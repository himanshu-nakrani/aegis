"""MCP credential isolation, real subprocess lifecycle, and untrusted schema boundaries."""
import asyncio
import json
import os
import sys
import textwrap
from uuid import uuid4

import pytest
import httpx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.deps import get_current_user_id
from app.config import settings
from app.db import models
from app.db.database import Base, get_db
from app.main import app
from app.services.credentials import resolve_credential
from app.services.mcp_client import (
    MCPClientError, MCPToolError, MCPPinnedTransport, make_mcp_tool_cache, open_mcp_session,
    validate_mcp_config, validate_mcp_endpoint, validate_mcp_schema,
)


@pytest.fixture
def mcp_credentials(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    owner = uuid4()

    def database():
        with sessions() as db:
            yield db

    overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user_id] = lambda: owner
    monkeypatch.setattr(settings, 'auth_enabled', False)
    monkeypatch.setattr(settings, 'app_encryption_key', Fernet.generate_key().decode())
    monkeypatch.setattr(settings, 'mcp_allowed_hosts', '127.0.0.1')
    monkeypatch.setattr(settings, 'mcp_stdio_enabled', True)
    monkeypatch.setattr(settings, 'mcp_timeout_seconds', 3)
    client = TestClient(app)
    try:
        yield client, sessions, owner
    finally:
        client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
        engine.dispose()


def _stdio_server(tmp_path, *, mode='normal'):
    server = tmp_path / f'mcp_{mode}.py'
    pidfile = tmp_path / f'mcp_{mode}.pid'
    server.write_text(textwrap.dedent('''
        import json, os, sys, time
        from pathlib import Path
        Path(sys.argv[1]).write_text(str(os.getpid()))
        mode = sys.argv[2]
        for line in sys.stdin:
            request = json.loads(line)
            if 'id' not in request:
                continue
            method = request['method']
            if method == 'initialize':
                if mode == 'initialize_hang':
                    time.sleep(60)
                result = {'protocolVersion': request['params']['protocolVersion'], 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'test', 'version': '1'}}
            elif method == 'tools/list':
                result = {'tools': [{'name': 'sum', 'description': 'Add two integers', 'inputSchema': {'type': 'object', 'properties': {'a': {'type': 'integer'}, 'b': {'type': 'integer'}}, 'required': ['a', 'b'], 'additionalProperties': False}}, {'name': 'failure', 'inputSchema': {'type': 'object'}}]}
                if mode == 'unsafe_output':
                    result['tools'][0]['outputSchema'] = {'type': 'object', 'properties': {'total': {'type': 'string', 'pattern': '(a+)+$'}}}
                if mode == 'safe_output':
                    result['tools'][0]['outputSchema'] = {'type': 'object', 'properties': {'label': {'type': 'string', 'pattern': '^[a-z]+$'}}}
            elif method == 'tools/call':
                if mode == 'call_hang':
                    Path(sys.argv[1] + '.called').write_text('ready')
                    time.sleep(60)
                if request['params']['name'] == 'failure':
                    result = {'content': [{'type': 'text', 'text': 'bad ' + os.environ.get('MCP_TEST_SECRET', '')}], 'isError': True}
                else:
                    args = request['params']['arguments']
                    result = {'content': [{'type': 'text', 'text': str(args['a'] + args['b'])}], 'structuredContent': {'total': args['a'] + args['b'], 'ambient_provider_key': 'GOOGLE_API_KEY' in os.environ, 'echoed_secret': os.environ.get('MCP_TEST_SECRET', '')}, 'isError': False}
                    if mode == 'safe_output':
                        result['structuredContent']['label'] = 'sum'
            else:
                result = {}
            print(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': result}), flush=True)
    '''))
    return {'transport': 'stdio', 'command': sys.executable, 'args': [str(server), str(pidfile), mode], 'env': {'MCP_TEST_SECRET': 'unique-private-test-token'}}, pidfile


async def _wait_for_file(path):
    for _ in range(100):
        if path.exists():
            return
        await asyncio.sleep(0.02)
    pytest.fail(f'MCP subprocess did not reach {path.name}')


def _assert_process_gone(pidfile):
    pid = int(pidfile.read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_nested_mcp_secrets_encrypted_masked_and_owner_scoped(mcp_credentials):
    client, sessions, owner = mcp_credentials
    token = 'Bearer credential-private-token'
    response = client.post('/api/credentials', json={'name': 'MCP', 'type': 'mcp', 'config': {'transport': 'streamable_http', 'url': 'http://127.0.0.1:9876/mcp', 'headers': {'Authorization': token}}})
    assert response.status_code == 200, response.text
    credential_id = response.json()['id']
    assert response.json()['config']['headers']['Authorization'] == '••••••••'
    assert token not in client.get('/api/credentials').text
    with sessions() as db:
        row = db.query(models.Credential).one()
        assert row.config['headers']['Authorization'].startswith('v1:')
        assert resolve_credential(row)['headers']['Authorization'] == token
        assert row.mcp_tool_cache is None
    app.dependency_overrides[get_current_user_id] = lambda: uuid4()
    for method, suffix in [('get', 'mcp/tools'), ('post', 'mcp/discover')]:
        assert getattr(client, method)(f'/api/credentials/{credential_id}/{suffix}').status_code == 404
    assert client.delete(f'/api/credentials/{credential_id}').status_code == 404
    app.dependency_overrides[get_current_user_id] = lambda: owner
    assert client.get(f'/api/credentials/{credential_id}/mcp/tools').json() == {'tools': [], 'discovered_at': None}
    assert client.delete(f'/api/credentials/{credential_id}').status_code == 200


def test_discovery_cache_real_stdio_and_runtime_errors(mcp_credentials, tmp_path, monkeypatch):
    client, sessions, _ = mcp_credentials
    config, pidfile = _stdio_server(tmp_path)
    monkeypatch.setenv('GOOGLE_API_KEY', 'ambient-key-not-for-server')
    created = client.post('/api/credentials', json={'name': 'Child', 'type': 'mcp', 'config': config})
    assert created.status_code == 200, created.text
    credential_id = created.json()['id']
    discovered = client.post(f'/api/credentials/{credential_id}/mcp/discover')
    assert discovered.status_code == 200, discovered.text
    assert {tool['name'] for tool in discovered.json()['tools']} == {'sum', 'failure'}
    assert client.get(f'/api/credentials/{credential_id}/mcp/tools').json() == discovered.json()
    with sessions() as db:
        assert 'unique-private-test-token' not in json.dumps(db.query(models.Credential).one().mcp_tool_cache)
    _assert_process_gone(pidfile)

    async def call():
        async with open_mcp_session(config) as session:
            result = await session.call_tool('sum', {'a': 5, 'b': 7})
            assert result['structuredContent'] == {'total': 12, 'ambient_provider_key': False, 'echoed_secret': '[redacted]'}
            with pytest.raises(MCPClientError, match='input schema'):
                await session.call_tool('sum', {'a': '5', 'b': 7})
            with pytest.raises(MCPClientError, match='not advertised'):
                await session.call_tool('missing', {})
            with pytest.raises(MCPToolError) as error:
                await session.call_tool('failure', {})
            assert error.value.result['isError'] is True
            assert error.value.result['content'][0]['text'] == 'bad [redacted]'
    asyncio.run(call())
    _assert_process_gone(pidfile)


@pytest.mark.parametrize('mode', ['initialize_hang', 'call_hang'])
def test_cancellation_reaps_real_stdio_child(mcp_credentials, tmp_path, mode):
    config, pidfile = _stdio_server(tmp_path, mode=mode)

    async def exercise():
        async def run():
            async with open_mcp_session(config) as session:
                await session.call_tool('sum', {'a': 1, 'b': 2})
        task = asyncio.create_task(run())
        await _wait_for_file(pidfile if mode == 'initialize_hang' else pidfile.with_name(pidfile.name + '.called'))
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, timeout=10)
    asyncio.run(exercise())
    _assert_process_gone(pidfile)


def test_stdio_opt_in_and_secret_key_are_required(mcp_credentials, monkeypatch):
    client, _, _ = mcp_credentials
    monkeypatch.setattr(settings, 'mcp_stdio_enabled', False)
    response = client.post('/api/credentials', json={'name': 'Blocked', 'type': 'mcp', 'config': {'transport': 'stdio', 'command': sys.executable}})
    assert response.status_code == 403
    monkeypatch.setattr(settings, 'app_encryption_key', '')
    response = client.post('/api/credentials', json={'name': 'Unencrypted', 'type': 'mcp', 'config': {'transport': 'streamable_http', 'url': 'http://127.0.0.1:9876/mcp', 'headers': {'Authorization': 'private-value'}}})
    assert response.status_code == 400
    assert 'APP_ENCRYPTION_KEY' in response.json()['detail']
    assert 'private-value' not in response.text


@pytest.mark.parametrize('config', [
    [{'Authorization': 'submitted-private-value'}],
    'submitted-private-value',
    {'transport': 'streamable_http', 'url': 'http://127.0.0.1/mcp', 'headers': {'Authorization': ['submitted-private-value']}},
])
def test_malformed_mcp_config_errors_do_not_echo_input(mcp_credentials, config):
    client, _, _ = mcp_credentials
    response = client.post('/api/credentials', json={'name': 'Invalid', 'type': 'mcp', 'config': config})
    assert response.status_code == 400
    assert 'Invalid MCP config' in response.json()['detail']
    assert 'submitted-private-value' not in response.text


def test_private_mcp_hosts_need_exact_allowlist(monkeypatch):
    monkeypatch.setattr(settings, 'mcp_allowed_hosts', '')
    with pytest.raises(MCPClientError, match='MCP_ALLOWED_HOSTS'):
        validate_mcp_endpoint('http://127.0.0.1:8765/mcp')
    monkeypatch.setattr(settings, 'mcp_allowed_hosts', '127.0.0.1')
    validate_mcp_endpoint('http://127.0.0.1:8765/mcp')
    with pytest.raises(MCPClientError, match='MCP_ALLOWED_HOSTS'):
        validate_mcp_endpoint('http://127.0.0.2:8765/mcp')
    for url in ['http://user:password@127.0.0.1/mcp', 'http://127.0.0.1/mcp?token=secret', 'http://127.0.0.1/mcp#secret']:
        with pytest.raises(MCPClientError, match='credentials, a query, or a fragment'):
            validate_mcp_config({'transport': 'streamable_http', 'url': url})


def test_untrusted_descriptor_schema_and_secrets_never_cached():
    config = {'headers': {'Authorization': 'Bearer private-credential-secret'}}
    tool = {'name': 'echo', 'description': 'server echoed private-credential-secret', 'input_schema': {'type': 'object'}}
    cache = make_mcp_tool_cache([tool], config)
    assert cache['tools'][0]['description'] == 'server echoed [redacted]'
    for schema in [{'type': 'object', '$ref': 'https://example.com/schema'}, {'type': 'object', 'properties': {'secret': {'type': 'string', 'default': 'private-credential-secret'}}}]:
        with pytest.raises(MCPClientError):
            make_mcp_tool_cache([{**tool, 'input_schema': schema}], config)
    with pytest.raises(MCPClientError, match='duplicate'):
        make_mcp_tool_cache([tool, tool], config)


def test_http_transport_pins_every_request_and_never_follows_redirects(monkeypatch):
    addresses = iter(['93.184.216.34', '93.184.216.35'])
    observed = []
    monkeypatch.setattr('app.services.mcp_client._resolve_endpoint', lambda url: next(addresses))

    async def exercise():
        transport = MCPPinnedTransport('https://mcp.example/tools')
        async def server(request):
            observed.append((str(request.url), request.headers['Host'], request.headers['Authorization'], request.extensions['sni_hostname']))
            if len(observed) == 2:
                return httpx.Response(307, headers={'Location': 'https://attacker.example/steal'}, request=request)
            return httpx.Response(200, json={'ok': True}, request=request)
        await transport.transport.aclose()
        transport.transport = httpx.MockTransport(server)
        async with httpx.AsyncClient(transport=transport, headers={'Authorization': 'Bearer private-token'}) as client:
            assert (await client.post('https://mcp.example/tools', json={})).json() == {'ok': True}
            with pytest.raises(MCPClientError, match='redirects are forbidden'):
                await client.post('https://mcp.example/tools', json={})
    asyncio.run(exercise())
    assert observed == [
        ('https://93.184.216.34/tools', 'mcp.example', 'Bearer private-token', 'mcp.example'),
        ('https://93.184.216.35/tools', 'mcp.example', 'Bearer private-token', 'mcp.example'),
    ]


def test_compressed_http_response_rejected_before_decompression(monkeypatch):
    monkeypatch.setattr('app.services.mcp_client._resolve_endpoint', lambda url: '93.184.216.34')

    async def exercise():
        transport = MCPPinnedTransport('https://mcp.example/tools')
        async def server(request):
            assert request.headers['Accept-Encoding'] == 'identity'
            # No valid compressed bytes: rejection must precede HTTPX's decoder.
            return httpx.Response(200, headers={'Content-Encoding': 'gzip'}, stream=httpx.ByteStream(b'not-gzip'), request=request)
        await transport.transport.aclose()
        transport.transport = httpx.MockTransport(server)
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(MCPClientError, match='compressed HTTP responses'):
                await client.post('https://mcp.example/tools', json={})
    asyncio.run(exercise())


@pytest.mark.parametrize('pattern', ['^[A-Za-z0-9_-]+$', r'^x\d{1,8}$', 'abc', '^name-[a-z]*-end$'])
def test_safe_common_schema_regex_admitted(pattern):
    validate_mcp_schema({'type': 'object', 'properties': {'value': {'type': 'string', 'pattern': pattern}}, 'patternProperties': {pattern: {'type': 'string'}}})


@pytest.mark.parametrize('pattern', ['(a+)+$', '^(a|aa)+$', '^a+a+$', 'a+$', r'^(a)\1$', '^[a-z]{1,1000000}$'])
def test_backtracking_schema_regex_explicitly_rejected(pattern):
    for schema in [{'type': 'string', 'pattern': pattern}, {'type': 'object', 'patternProperties': {pattern: {'type': 'string'}}}]:
        with pytest.raises(MCPClientError, match='supported safe subset'):
            validate_mcp_schema(schema)


def test_sdk_output_schema_validation_only_uses_admitted_regex(mcp_credentials, tmp_path):
    safe_config, safe_pid = _stdio_server(tmp_path, mode='safe_output')
    unsafe_config, unsafe_pid = _stdio_server(tmp_path, mode='unsafe_output')

    async def exercise():
        async with open_mcp_session(safe_config) as session:
            result = await session.call_tool('sum', {'a': 1, 'b': 2})
            assert result['structuredContent']['label'] == 'sum'
        async with open_mcp_session(unsafe_config) as session:
            # Discovery fails before the SDK can run the unsafe output matcher.
            with pytest.raises(MCPClientError, match='supported safe subset'):
                await session.call_tool('sum', {'a': 1, 'b': 2})
    asyncio.run(exercise())
    _assert_process_gone(safe_pid)
    _assert_process_gone(unsafe_pid)
