import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.approval_service import clear_approval_state, submit_approval, wait_for_approval
from app.services.code_sandbox import run_sandboxed_code, validate_code_safety
from app.services.embeddings import EMBEDDING_DIM, embed_text
from app.services.guardrail import validate_content
from app.services.observability_events import (
    broadcast_observability_event,
    subscribe_observability,
    unsubscribe_observability,
    _subscribers,
)
from app.services.regex_safety import validate_safe_regex
from app.services.integrations import (
    _parameterize_query,
    _validate_postgres_connection_url,
    run_postgres_integration,
)
from app.services.webhook import dispatch_webhook
from app.services.node_handlers import NodeExecutionError
from app.services.sub_workflow import MAX_SUB_WORKFLOW_DEPTH, execute_sub_workflow
from app.services.url_safety import resolve_public_ip, safe_http_request, validate_hostname_public
from app.services.vector_stores import _validate_embedding


def test_code_sandbox_blocks_json_module_escape():
    exploit = (
        "sys = json.codecs.sys\n"
        "os = sys.modules['os']\n"
        "result = 'escaped'"
    )
    with pytest.raises(ValueError, match="json.loads and json.dumps"):
        validate_code_safety(exploit)


def test_code_sandbox_blocks_format_field_traversal():
    for exploit in (
        'result = "{0.__globals__[os].environ}".format(json.loads)',
        'result = "{0.__globals__[os].environ[HOME]}".format(json.loads)',
        'result = "{0.__class__.__base__}".format("x")',
        'result = "{}".format_map({"a": 1})',
    ):
        with pytest.raises(ValueError, match="str.format"):
            validate_code_safety(exploit)


def test_code_sandbox_blocks_format_alias_hop():
    exploit = "f = '{0.__globals__}'.format\nresult = f(json.loads)"
    with pytest.raises(ValueError, match="str.format"):
        validate_code_safety(exploit)


def test_code_sandbox_times_out_slow_execution(monkeypatch):
    # Sandbox runs in a subprocess; monkeypatching parent _execute_code would not
    # affect the child. Drive a real hang and a short parent-side join timeout.
    monkeypatch.setattr("app.services.code_sandbox.CODE_TIMEOUT_SECONDS", 0.4)
    # Infinite loop is allowed by the AST gate; the hard kill is what we assert.
    code = "while True:\n    pass\nresult = 'never'"
    ctx = {"input": {}, "steps": {}, "last_output": "", "memory": {}}
    with pytest.raises(ValueError, match="timed out"):
        run_sandboxed_code(code, ctx, "")


def test_validate_safe_regex_rejects_nested_quantifiers():
    with pytest.raises(ValueError, match="catastrophic backtracking"):
        validate_safe_regex("(a+)+")


def test_validate_safe_regex_rejects_alternation_overlap():
    # The class the old nested-only guard missed (audit P2-12).
    for pattern in ("(a|a)*", "(a|ab)*", "(.|a)+", "(a|)*"):
        with pytest.raises(ValueError, match="catastrophic backtracking"):
            validate_safe_regex(pattern)


def test_validate_safe_regex_allows_disjoint_alternation():
    # Common, safe quantified alternations must still be accepted.
    validate_safe_regex("(cat|dog)+")
    validate_safe_regex("(https?|ftp)")


def test_guardrail_rejects_unsafe_blocked_pattern():
    result = validate_content("hello", {"blocked_patterns": ["(a+)+"]})
    assert result.passed is False
    assert "pattern" in result.message.lower()


def test_validate_embedding_rejects_non_finite_values():
    with pytest.raises(ValueError, match="non-finite"):
        _validate_embedding([1.0, float("nan")])
    with pytest.raises(ValueError, match="non-finite"):
        _validate_embedding([float("inf")])


def test_embedding_hash_fallback_matches_pgvector_dim():
    vector = embed_text("dimension check")
    assert len(vector) == EMBEDDING_DIM
    assert EMBEDDING_DIM == 768


@pytest.mark.asyncio
async def test_observability_broadcast_drops_full_queues():
    user_id = "audit-user"
    _subscribers.pop(user_id, None)
    queue = subscribe_observability(user_id)
    for _ in range(64):
        queue.put_nowait({"type": "fill"})
    await broadcast_observability_event(user_id, {"type": "live"})
    assert queue not in _subscribers.get(user_id, [])
    dropped = queue.get_nowait()
    assert dropped["type"] == "events_dropped"
    assert dropped["count"] == 1
    unsubscribe_observability(user_id, queue)
    _subscribers.pop(user_id, None)


def test_code_sandbox_allows_json_loads_and_dumps():
    code = "result = json.loads('{\"ok\": true}')"
    ctx = {"input": {}, "steps": {}, "last_output": "", "memory": {}}
    out = run_sandboxed_code(code, ctx, "")
    assert '"ok": true' in out


def test_validate_hostname_public_blocks_loopback():
    with pytest.raises(ValueError, match="not allowed|blocked"):
        validate_hostname_public("127.0.0.1", 5432)


def test_validate_postgres_connection_url_blocks_localhost():
    with pytest.raises(ValueError, match="not allowed|blocked"):
        _validate_postgres_connection_url("postgresql://aegis:aegis@127.0.0.1:5432/aegis")


def test_resolve_public_ip_returns_address_for_public_host():
    ip = resolve_public_ip("example.com", 443)
    assert ip


@pytest.mark.asyncio
async def test_safe_http_request_pins_resolved_ip():
    client = AsyncMock()
    client.request = AsyncMock(
        return_value=MagicMock(status_code=200, headers={}, text="ok")
    )

    with patch("app.services.url_safety.resolve_public_ip", return_value="93.184.216.34"):
        response = await safe_http_request(client, "GET", "https://example.com/path")

    assert response.status_code == 200
    called_url = client.request.await_args.args[1]
    assert "93.184.216.34" in called_url
    assert client.request.await_args.kwargs["headers"]["Host"] == "example.com"
    assert client.request.await_args.kwargs["follow_redirects"] is False
    assert client.request.await_args.kwargs["extensions"] == {"sni_hostname": "example.com"}


@pytest.mark.asyncio
async def test_safe_http_request_refuses_redirect_to_loopback():
    """A public endpoint 307-redirecting to loopback must be refused, not
    followed: every redirect hop re-validates the destination."""
    redirect = MagicMock(status_code=307, headers={"location": "http://127.0.0.1:9/x"})
    client = AsyncMock()
    client.request = AsyncMock(return_value=redirect)

    with patch("app.services.url_safety.resolve_public_ip", return_value="93.184.216.34"):
        with pytest.raises(ValueError, match="not allowed|blocked"):
            await safe_http_request(client, "GET", "https://example.com/start")


@pytest.mark.asyncio
async def test_postgres_read_only_blocks_mutating_cte():
    class FakeResult:
        def mappings(self):
            return self

        def fetchmany(self, _limit):
            return []

    class FakeConn:
        def __init__(self):
            self.statements: list[str] = []
            self.read_only = False

        def execute(self, statement, parameters=None):
            sql = str(statement)
            self.statements.append(sql)
            if "SET TRANSACTION READ ONLY" in sql.upper():
                self.read_only = True
                return FakeResult()
            if self.read_only and "DELETE" in sql.upper():
                raise RuntimeError("cannot execute DELETE in a read-only transaction")
            return FakeResult()

        def begin(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeEngine:
        def connect(self):
            return FakeConn()

    with patch("app.services.integrations._pg_engine", return_value=FakeEngine()):
        with pytest.raises(NodeExecutionError, match="read-only"):
            await run_postgres_integration(
                {"connection_url": "postgresql://user:pass@example.com:5432/db"},
                "WITH payload AS (DELETE FROM users RETURNING *) SELECT 1",
                {"input": {}, "steps": {}, "last_output": "", "memory": {}},
                "",
            )


def test_parameterize_query_binds_template_values():
    query, binds = _parameterize_query(
        "SELECT * FROM users WHERE id = {{input.user_id}}",
        {"input": {"user_id": "1; DROP TABLE users"}, "steps": {}, "last_output": "", "memory": {}},
        "",
    )
    assert ":p0" in query
    assert binds["p0"] == "1; DROP TABLE users"
    assert "DROP TABLE" not in query.replace(":p0", "")


@pytest.mark.asyncio
async def test_dispatch_webhook_blocks_localhost():
    with patch("app.services.webhook.get_http_client") as mock_client:
        await dispatch_webhook("http://127.0.0.1/hook", {"event": "test"})
        mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_approval_early_submit_satisfies_later_wait():
    clear_approval_state("run-early")
    submit_approval("run-early", approved=True, comment="submitted first")
    decision = await wait_for_approval("run-early", timeout=1.0)
    assert decision["approved"] is True
    assert decision["comment"] == "submitted first"
    clear_approval_state("run-early")


@pytest.mark.asyncio
async def test_sub_workflow_detects_circular_dependency():
    workflow_id = uuid4()
    parent_context = {"_sub_workflow_stack": [str(workflow_id)]}

    with patch("app.services.sub_workflow.SessionLocal") as mock_session_local:
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        with pytest.raises(NodeExecutionError, match="circular dependency"):
            await execute_sub_workflow(
                workflow_id,
                "child input",
                parent_context=parent_context,
            )
    # Recursion guards short-circuit before any DB session is opened.
    mock_session_local.assert_not_called()


@pytest.mark.asyncio
async def test_sub_workflow_enforces_max_depth():
    workflow_id = uuid4()
    parent_context = {
        "_sub_workflow_stack": [str(uuid4()) for _ in range(MAX_SUB_WORKFLOW_DEPTH)]
    }

    with patch("app.services.sub_workflow.SessionLocal") as mock_session_local:
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        with pytest.raises(NodeExecutionError, match="max nesting depth"):
            await execute_sub_workflow(
                workflow_id,
                "child input",
                parent_context=parent_context,
            )
    mock_session_local.assert_not_called()

@pytest.mark.asyncio
async def test_sub_workflow_endpoint_gate_raises_not_returns():
    """The child-graph SSRF gate must raise NodeExecutionError (retries/error
    edges engage) instead of returning an error string as success output."""
    from app.services.node_handlers import NodeExecutionError

    from uuid import uuid4

    def _boom(*args, **kwargs):
        raise ValueError("http://169.254.169.254/ is not allowed")

    with patch("app.services.sub_workflow.SessionLocal") as mock_session_local:
        session = MagicMock()
        workflow = MagicMock()
        workflow.versions = [MagicMock(version_number=1, graph_json={"nodes": [], "edges": []})]
        session.query.return_value.options.return_value.filter.return_value.first.return_value = workflow
        mock_session_local.return_value = session
        with patch("app.services.llm_providers.validate_provider_endpoints", side_effect=_boom):
            with pytest.raises(NodeExecutionError, match="Sub-workflow error"):
                await execute_sub_workflow(uuid4(), "hi", user_id=uuid4())


def test_parameterize_query_unquotes_wrapped_placeholder():
    """WHERE x = '{{v}}' binds the value, not the literal ':p0' (R2-14)."""
    from app.services.integrations import _parameterize_query

    query, binds = _parameterize_query(
        "SELECT * FROM t WHERE name = '{{input.name}}'",
        {"input": {"name": "O'Brien"}},
        "",
    )
    assert query == "SELECT * FROM t WHERE name = :p0"
    assert binds == {"p0": "O'Brien"}


def test_parameterize_query_semicolon_in_literal_allowed():
    from app.services.integrations import _parameterize_query

    query, _ = _parameterize_query("SELECT 'a;b'", {}, "")
    assert query == "SELECT 'a;b'"


def test_parameterize_query_statement_semicolon_rejected():
    import pytest

    from app.services.integrations import _parameterize_query

    with pytest.raises(ValueError, match="Semicolons"):
        _parameterize_query("SELECT 1; SELECT 2", {}, "")
