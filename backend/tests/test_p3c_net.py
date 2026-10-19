"""P3-C slice B: url-safety residuals, Postgres hardening, /mcp rate limit,
webhook timeout wiring, and ?api_key= removal."""

from collections import OrderedDict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import integrations
from app.services.url_safety import safe_http_request, validate_http_url


def test_validate_http_url_rejects_userinfo():
    """user:pass@host embeds credentials in logs — reject, don't strip."""
    with pytest.raises(ValueError, match="credentials"):
        validate_http_url("http://user:pass@example.com/path")


def test_validate_http_url_rejects_cgnat_literal():
    """100.64.0.0/10 is carrier-grade NAT: not globally routable, and
    ipaddress.is_private/is_reserved do not flag it on this Python."""
    with pytest.raises(ValueError, match="blocked|not allowed"):
        validate_http_url("http://100.64.5.6/")


@pytest.mark.asyncio
async def test_safe_http_request_host_header_keeps_port():
    """A non-default origin port must survive into the Host header once the
    URL is pinned to an IP literal."""
    client = AsyncMock()
    client.request = AsyncMock(return_value=MagicMock(status_code=200, headers={}))

    with (
        patch("app.services.url_safety.validate_http_url", side_effect=lambda u: u),
        patch("app.services.url_safety.resolve_public_ip", return_value="93.184.216.34"),
    ):
        await safe_http_request(client, "GET", "http://example.com:8080/path")

    call = client.request.await_args
    assert call.kwargs["headers"]["Host"] == "example.com:8080"
    assert "93.184.216.34:8080" in call.args[1]


@pytest.mark.asyncio
async def test_safe_http_request_forwards_timeout():
    client = AsyncMock()
    client.request = AsyncMock(return_value=MagicMock(status_code=200, headers={}))

    with (
        patch("app.services.url_safety.validate_http_url", side_effect=lambda u: u),
        patch("app.services.url_safety.resolve_public_ip", return_value="93.184.216.34"),
    ):
        await safe_http_request(client, "GET", "https://example.com/", timeout=4.5)

    assert client.request.await_args.kwargs["timeout"] == 4.5


@pytest.mark.asyncio
async def test_safe_http_request_rejects_userinfo_url():
    client = AsyncMock()
    client.request = AsyncMock()
    with pytest.raises(ValueError, match="credentials"):
        await safe_http_request(client, "GET", "http://user:pass@example.com/")
    client.request.assert_not_called()


class _FakeResult:
    def mappings(self):
        return self

    def fetchmany(self, _limit):
        return []


def _fake_pg_engine(statements: list[str]):
    class FakeConn:
        def execute(self, statement, parameters=None):
            statements.append(str(statement))
            return _FakeResult()

        def begin(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeEngine:
        def connect(self):
            return FakeConn()

    return FakeEngine()


@pytest.mark.asyncio
async def test_postgres_query_sets_statement_timeout():
    """pg_sleep(3600) slips past the SELECT/WITH allowlist — the transaction
    must carry a statement_timeout so it cannot hold a pooled connection."""
    statements: list[str] = []
    with patch(
        "app.services.integrations._pg_engine",
        return_value=_fake_pg_engine(statements),
    ):
        result = await integrations.run_postgres_integration(
            {"connection_url": "postgresql://user:pass@example.com:5432/db"},
            "SELECT 1",
            {"input": {}, "steps": {}, "last_output": "", "memory": {}},
            "",
        )
    assert '"count": 0' in result
    assert any("READ ONLY" in s.upper() for s in statements)
    assert any("statement_timeout" in s for s in statements)


def test_pg_engine_cache_is_bounded(monkeypatch):
    """Unbounded per-URL engines leak pools; the cache must evict oldest."""
    engines: OrderedDict[str, MagicMock] = OrderedDict()
    monkeypatch.setattr(integrations, "_PG_ENGINES", engines)
    monkeypatch.setattr(
        integrations, "_validate_postgres_connection_url", lambda url: "93.184.216.34"
    )
    made: list[MagicMock] = []
    create_kwargs: list[dict] = []

    def fake_create(url, **kwargs):
        create_kwargs.append(kwargs)
        engine = MagicMock()
        made.append(engine)
        return engine

    monkeypatch.setattr(integrations, "create_engine", fake_create)

    for i in range(integrations._MAX_PG_ENGINES + 2):
        integrations._pg_engine(f"postgresql://u:p@host{i}.example.com/db")

    assert len(engines) <= integrations._MAX_PG_ENGINES
    # Oldest entries were evicted and disposed outside the lock.
    assert made[0].dispose.called
    # Pool bounds are set on every engine so a full cache cannot exhaust fds.
    assert all(kw.get("pool_size") == 2 and kw.get("max_overflow") == 3 for kw in create_kwargs)


def test_pg_engine_cache_race_returns_single_engine(monkeypatch):
    """Two threads resolving the same URL must not keep two engines alive."""
    engines: OrderedDict[str, MagicMock] = OrderedDict()
    monkeypatch.setattr(integrations, "_PG_ENGINES", engines)
    monkeypatch.setattr(
        integrations, "_validate_postgres_connection_url", lambda url: "93.184.216.34"
    )
    made: list[MagicMock] = []

    def fake_create(url, **kwargs):
        engine = MagicMock()
        made.append(engine)
        return engine

    monkeypatch.setattr(integrations, "create_engine", fake_create)

    import threading

    url = "postgresql://u:p@shared.example.com/db"
    results = [integrations._pg_engine(url) for _ in range(4)]
    assert len({id(r) for r in results}) == 1
    threads = [threading.Thread(target=integrations._pg_engine, args=(url,)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert integrations._pg_engine(url) is results[0]


def test_pg_validation_blocks_private_host():
    """SSRF-via-config: credential-supplied hosts go through the private-IP
    block (localhost is not permitted on this path)."""
    with pytest.raises(ValueError):
        integrations._validate_postgres_connection_url(
            "postgresql://u:p@127.0.0.1:5432/db"
        )
    with pytest.raises(ValueError):
        integrations._validate_postgres_connection_url(
            "postgresql://u:p@100.64.9.9:5432/db"
        )
    with pytest.raises(ValueError):
        integrations._validate_postgres_connection_url("mysql://u:p@example.com/db")


@pytest.mark.asyncio
async def test_slack_message_capped_like_discord(monkeypatch):
    captured: dict = {}

    async def fake_post(url, payload):
        captured.update(payload)
        return "200"

    monkeypatch.setattr(integrations, "_post_integration_webhook", fake_post)
    await integrations.run_slack_integration(
        "https://example.com/hook", "x" * 5000, {}, ""
    )
    assert len(captured["text"]) == integrations.MAX_MESSAGE_CHARS
    captured.clear()
    await integrations.run_discord_integration(
        "https://example.com/hook", "x" * 5000, {}, ""
    )
    assert len(captured["content"]) == integrations.MAX_MESSAGE_CHARS


def test_mcp_route_is_rate_limited(monkeypatch):
    """/mcp was outside rate_limited_path; invoke-tier limits must apply."""
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_invoke_per_minute", 1)
    client = TestClient(app)
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    first = client.post("/mcp", json=body)
    assert first.status_code != 429
    assert client.post("/mcp", json=body).status_code == 429


def test_api_key_query_param_no_longer_authenticates(monkeypatch):
    """?api_key= leaks keys into access logs — headers only."""
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "aegis_api_key", "secret-key")
    client = TestClient(app)
    assert client.get("/api/workflows?api_key=secret-key").status_code == 401
    assert (
        client.get("/api/workflows", headers={"X-Aegis-API-Key": "secret-key"}).status_code
        == 200
    )


@pytest.mark.asyncio
async def test_dispatch_webhook_applies_configured_timeout(monkeypatch):
    """webhook_timeout_seconds was dead config — dispatch must use it."""
    from app.services import webhook

    captured: dict = {}

    async def fake_safe(client, method, url, **kwargs):
        captured.update(kwargs)
        return MagicMock(status_code=200, headers={})

    monkeypatch.setattr(webhook, "validate_http_url", lambda u: u)
    monkeypatch.setattr(webhook, "safe_http_request", fake_safe)
    monkeypatch.setattr(webhook, "get_http_client", lambda: MagicMock())
    monkeypatch.setattr(settings, "webhook_timeout_seconds", 4)

    assert await webhook.dispatch_webhook("https://example.com/hook", {"a": 1}) is True
    assert captured["timeout"] == 4.0
