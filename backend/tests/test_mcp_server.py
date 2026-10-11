"""MCP server surface: /mcp JSON-RPC tools exposed from published deployments."""

import json
import subprocess
import sys
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.deploy_descriptor import _sanitize_tool_name
from tests.conftest import valid_graph

client = TestClient(app)

BACKEND_DIR = Path(__file__).resolve().parents[1]

MCP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def _rpc(method: str, params: dict | None = None, request_id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}


def _tool_name(workflow_name: str) -> str:
    return f"invoke_{_sanitize_tool_name(workflow_name)}"


def _unique_name(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def _published_workflow(name: str = "MCP Echo"):
    """Create + publish a transform-only workflow; return (body, credential)."""
    response = client.post(
        "/api/workflows",
        json={
            "name": name,
            "graph_json": valid_graph(
                [
                    {
                        "id": "schema",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "label": "Input Schema",
                            "nodeType": "input_schema",
                            "inputFields": [
                                {"key": "message", "type": "string", "required": True}
                            ],
                        },
                    },
                    {
                        "id": "n1",
                        "position": {"x": 200, "y": 0},
                        "data": {
                            "label": "Transform",
                            "nodeType": "transform",
                            "template": "echo: {{input.message}}",
                        },
                    },
                ],
                [{"id": "e1", "source": "schema", "target": "n1"}],
                entry_id="schema",
                exit_id="n1",
            ),
        },
    )
    assert response.status_code == 200, response.text
    workflow = response.json()
    version_id = workflow["latest_version"]["id"]
    published = client.post(
        f"/api/workflows/{workflow['id']}/publish", json={"version_id": version_id}
    )
    assert published.status_code == 200, published.text
    issued = client.post(f"/api/workflows/{workflow['id']}/deploy/credentials/invoke_key")
    assert issued.status_code == 200, issued.text
    return workflow, issued.json()


def _invoke_headers(credential: dict) -> dict:
    return {
        "X-Aegis-Invoke-Key": credential["secret"],
        "X-Aegis-Deployment-ID": credential["deployment_id"],
        "X-Aegis-Version-ID": credential["version_id"],
    }


def _mcp_post(payload: dict | list, headers: dict | None = None) -> httpx.Response:
    return client.post("/mcp", json=payload, headers={**MCP_HEADERS, **(headers or {})})


def _run_count() -> int:
    db = SessionLocal()
    try:
        return db.query(models.WorkflowRun).count()
    finally:
        db.close()


def test_tools_list_returns_published_workflow_tool():
    name = _unique_name("MCP Echo")
    workflow, credential = _published_workflow(name)
    assert workflow["id"]
    response = _mcp_post(_rpc("tools/list"), _invoke_headers(credential))
    assert response.status_code == 200, response.text
    tools = response.json()["result"]["tools"]
    assert len(tools) == 1
    tool = next(t for t in tools if t["name"] == _tool_name(name))
    assert tool["inputSchema"]["type"] == "object"
    assert "message" in tool["inputSchema"]["properties"]


def test_tools_list_rejects_missing_credentials():
    name = _unique_name("MCP Echo Guard")
    _published_workflow(name)
    response = _mcp_post(_rpc("tools/list"))
    assert response.status_code == 401, response.text


def test_tools_list_excludes_unpublished_workflows():
    published_name = _unique_name("Published Echo")
    _workflow, credential = _published_workflow(published_name)
    unpublished = _unique_name("Never published")
    response = client.post(
        "/api/workflows",
        json={
            "name": unpublished,
            "graph_json": valid_graph(
                [
                    {
                        "id": "t",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "nodeType": "transform",
                            "label": "Echo",
                            "transformTemplate": "{{input.text}}",
                        },
                    }
                ]
            ),
        },
    )
    assert response.status_code == 200, response.text
    listed = _mcp_post(_rpc("tools/list"), _invoke_headers(credential)).json()["result"]["tools"]
    names = {t["name"] for t in listed}
    assert _tool_name(published_name) in names
    assert _tool_name(unpublished) not in names


def test_tools_call_rejects_missing_deployment_headers():
    name = _unique_name("Auth Guarded")
    _workflow, _credential = _published_workflow(name)
    before = _run_count()
    response = _mcp_post(
        _rpc("tools/call", {"name": _tool_name(name), "arguments": {"message": "hi"}})
    )
    # Rejected before a transport/run is created: JSON-RPC error, HTTP 401.
    assert response.status_code == 401, response.text
    body = response.json()
    assert body["error"]["code"] == -32600
    assert "X-Aegis" in body["error"]["message"]
    assert _run_count() == before


@pytest.mark.asyncio
async def test_tools_call_runs_workflow_and_returns_output(monkeypatch):
    monkeypatch.setattr(settings, "run_execution_mode", "inline")
    monkeypatch.setattr(settings, "max_concurrent_runs", 1000)
    name = _unique_name("Round Trip")
    workflow, credential = _published_workflow(name)
    assert workflow["id"]
    headers = _invoke_headers(credential)

    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    transport = httpx.ASGITransport(app=app)

    http = httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers=headers,
        timeout=httpx.Timeout(30.0),
    )
    async with streamable_http_client("http://testserver/mcp", http_client=http) as (
        read_stream,
        write_stream,
        _,
    ):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            tools = await session.list_tools()
            assert any(t.name == _tool_name(name) for t in tools.tools)
            result = await session.call_tool(
                _tool_name(name), {"message": "hello from mcp"}
            )
            assert not result.isError
            assert result.content[0].text == "echo: hello from mcp"
            assert result.structuredContent["status"] == "completed"
            assert result.structuredContent["output"] == "echo: hello from mcp"
            assert result.structuredContent["run_id"]

    db = SessionLocal()
    try:
        run = db.get(models.WorkflowRun, UUID(result.structuredContent["run_id"]))
        assert run is not None and run.status == "completed"
    finally:
        db.close()


def test_stdio_entry_help_works():
    result = subprocess.run(
        [sys.executable, "mcp_stdio_entry.py", "--help"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "--check" in result.stdout


@pytest.mark.asyncio
async def test_stdio_entry_tool_builder_and_call():
    """The stdio server's tool comes from the deployment descriptor; calls POST
    to the invoke endpoint with deployment headers."""
    import mcp_stdio_entry
    from mcp import types

    descriptor = {
        "deployment_id": "dep-1",
        "workflow_id": "wf-1",
        "version_id": "ver-1",
        "workflow_name": "Stdio Flow",
        "description": "stdio tool",
        "tool_name": "invoke_stdio_flow",
        "input_schema": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"],
        },
    }

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "run_id": "run-1",
                "status": "completed",
                "output": "done",
                "version": 3,
            },
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    server = mcp_stdio_entry.build_stdio_server(
        api_url="http://api.test",
        deployment_id="dep-1",
        version_id="ver-1",
        invoke_key="sekret",
        descriptor=descriptor,
        http_client=http,
    )
    assert server.name == "aegis"

    # Exercise the registered handlers directly (no live stdio handshake).
    list_handler = server.request_handlers[types.ListToolsRequest]
    list_result = await list_handler(types.ListToolsRequest(method="tools/list"))
    tools = list_result.root.tools
    assert [t.name for t in tools] == ["invoke_stdio_flow"]
    assert tools[0].inputSchema == descriptor["input_schema"]

    call_handler = server.request_handlers[types.CallToolRequest]
    call_result = await call_handler(
        types.CallToolRequest(
            method="tools/call",
            params={"name": "invoke_stdio_flow", "arguments": {"message": "hey"}},
        )
    )
    payload = call_result.root
    assert payload.isError is False
    assert payload.content[0].text == "done"
    assert payload.structuredContent["status"] == "completed"
    assert captured["url"] == "http://api.test/v1/workflows/wf-1/invoke?wait=true"
    assert captured["headers"]["x-aegis-invoke-key"] == "sekret"
    assert captured["headers"]["x-aegis-deployment-id"] == "dep-1"
    assert captured["body"] == {"input": '{"message": "hey"}'}
    await http.aclose()


def test_stdio_args_to_invoke_body():
    import mcp_stdio_entry

    body = mcp_stdio_entry._args_to_invoke_body(
        {"message": "hi", "session_id": "s1", "tags": ["a"]}
    )
    assert body == {"input": '{"message": "hi"}', "session_id": "s1", "tags": ["a"]}

    body = mcp_stdio_entry._args_to_invoke_body({"input": "plain"})
    assert body == {"input": "plain"}
