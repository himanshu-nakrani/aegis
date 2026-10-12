"""LangSmith tracing: export pipeline, privacy, run roots, attempts, isolation.

Drives the real ``execute_run`` through the real LangSmith exporter wrapper, with
only the network leg (the inner OTLP exporter) replaced by an in-memory sink, so
what the sink receives is exactly what would leave the process.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services import executor, tracing
from app.services.graph_defaults import wrap_graph_with_trigger_end

CANARY_SECRET = "sk-CANARYSECRET0123456789abcdef"
CANARY_PROMPT = "CANARY-PROMPT-CONTENT-7731"


class _FailingExporter(SpanExporter):
    def export(self, spans):  # noqa: ARG002
        raise RuntimeError("langsmith unreachable")

    def shutdown(self) -> None:  # pragma: no cover
        pass


@pytest.fixture
def langsmith_sink(monkeypatch):
    """Provider whose only exporter is the real LangSmithSpanExporter -> memory sink."""

    def build(*, capture_content: bool, inner: SpanExporter | None = None):
        tracing.shutdown_tracing()
        sink = InMemorySpanExporter()
        exporter = tracing.LangSmithSpanExporter(inner or sink, capture_content=capture_content)
        monkeypatch.setattr(settings, "langsmith_capture_content", capture_content)
        provider = TracerProvider(sampler=ParentBased(TraceIdRatioBased(1.0)))
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        tracing._provider = provider
        tracing._tracer = provider.get_tracer("aegis-test", "0.4.0")
        tracing._enabled = True
        tracing._langsmith_export = True
        return sink, provider

    yield build
    tracing._provider = None
    tracing._tracer = None
    tracing._enabled = False
    tracing._langsmith_export = False


def _graph_with_secret() -> dict:
    return wrap_graph_with_trigger_end(
        [
            {
                "id": "echo",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "Echo",
                    "nodeType": "transform",
                    "template": "{{input.text}}",
                    # A config value that looks like a credential: must never export.
                    "authorization": f"Bearer {CANARY_SECRET}",
                },
            }
        ],
        [],
        entry_id="echo",
        exit_id="echo",
    )


def _seed_run(graph: dict, input_text: str = "hello", metrics: dict | None = None) -> models.WorkflowRun:
    db = SessionLocal()
    try:
        wf = models.Workflow(id=uuid4(), user_id=uuid4(), name="LS Tracing")
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1, graph_json=graph
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status="queued",
            input_text=input_text,
            metrics_json=metrics,
            started_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()


async def _execute(run_id, monkeypatch) -> None:
    async def _noop():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop)
    await executor.execute_run(run_id)


def _all_text(spans) -> str:
    parts: list[str] = []
    for span in spans:
        parts.append(span.name)
        parts.extend(f"{k}={v}" for k, v in (span.attributes or {}).items())
        for event in span.events:
            parts.append(event.name)
            parts.extend(f"{k}={v}" for k, v in (event.attributes or {}).items())
        if span.status.description:
            parts.append(span.status.description)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "base,expected",
    [
        ("https://api.smith.langchain.com", "https://api.smith.langchain.com/otel/v1/traces"),
        ("https://api.smith.langchain.com/", "https://api.smith.langchain.com/otel/v1/traces"),
        ("https://eu.api.smith.langchain.com", "https://eu.api.smith.langchain.com/otel/v1/traces"),
        ("https://ls.example.com/api/v1", "https://ls.example.com/api/v1/otel/v1/traces"),
        ("https://api.smith.langchain.com/otel", "https://api.smith.langchain.com/otel/v1/traces"),
        (
            "https://api.smith.langchain.com/otel/v1/traces",
            "https://api.smith.langchain.com/otel/v1/traces",
        ),
    ],
)
def test_traces_endpoint_never_doubles_signal_path(base, expected):
    assert tracing.langsmith_traces_endpoint(base) == expected


def test_init_requires_api_key_and_is_idempotent(monkeypatch):
    tracing.shutdown_tracing()
    # No network, and no mutation of the process-global provider (settable once).
    monkeypatch.setattr(tracing, "OTLPSpanExporter", lambda **kwargs: InMemorySpanExporter())
    monkeypatch.setattr(tracing.trace, "set_tracer_provider", lambda provider: None)
    monkeypatch.setattr(settings, "otel_enabled", False)
    monkeypatch.setattr(settings, "langsmith_enabled", True)
    monkeypatch.setattr(settings, "langsmith_api_key", "")
    tracing.init_tracing()
    assert tracing.is_tracing_enabled() is False, "no key -> no export, no crash"

    monkeypatch.setattr(settings, "langsmith_api_key", "lsv2_test_key_value")
    tracing.init_tracing()
    first = tracing._provider
    assert tracing.is_tracing_enabled() and tracing.is_langsmith_export_enabled()
    tracing.init_tracing()  # API + worker both call this
    assert tracing._provider is first
    tracing.shutdown_tracing()


# ---------------------------------------------------------------------------
# Run roots, privacy, status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_exports_detached_root_with_metadata_only(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=False)
    run = _seed_run(_graph_with_secret(), input_text=CANARY_PROMPT)

    # Execute inside an "HTTP request" span: the run must still be its own root.
    request_span = tracing._tracer.start_span("POST /api/runs", kind=trace.SpanKind.SERVER)
    with trace.use_span(request_span, end_on_exit=True):
        await _execute(run.id, monkeypatch)
    provider.force_flush()

    spans = sink.get_finished_spans()
    names = [s.name for s in spans]
    assert "workflow.run" in names
    assert "POST /api/runs" not in names, "HTTP request spans are not exported to LangSmith"
    # ADK's invoke_node spans already represent each node (verified live against
    # LangSmith); this fixture's private provider doesn't see ADK's global-provider
    # spans, so only the dedupe is asserted here.
    assert "workflow.node" not in names

    root = next(s for s in spans if s.name == "workflow.run")
    assert root.parent is None, "run root must not nest inside the request span"
    assert len(root.links) == 1, "initiating request is linked, not parented"
    attrs = dict(root.attributes)
    assert attrs["langsmith.span.kind"] == "chain"
    assert attrs["langsmith.metadata.aegis_run_id"] == str(run.id)
    assert attrs["langsmith.metadata.aegis_execution_attempt"] == 1
    assert attrs["aegis.run_status"] == "completed"

    # Everything else belongs to the same trace.
    assert {s.context.trace_id for s in spans if s.name != "POST /api/runs"} == {root.context.trace_id}

    text = _all_text(spans)
    assert CANARY_PROMPT not in text, "workflow input must not be exported by default"
    assert CANARY_SECRET not in text

    db = SessionLocal()
    try:
        metrics = db.get(models.WorkflowRun, run.id).metrics_json
        assert metrics["trace_id"] == format(root.context.trace_id, "032x")
        assert [a["attempt"] for a in metrics["trace_attempts"]] == [1]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_capture_content_opt_in_exports_input_but_never_secrets(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=True)
    run = _seed_run(_graph_with_secret(), input_text=CANARY_PROMPT)
    await _execute(run.id, monkeypatch)
    provider.force_flush()

    spans = sink.get_finished_spans()
    root = next(s for s in spans if s.name == "workflow.run")
    assert root.attributes["input.value"] == CANARY_PROMPT
    assert CANARY_SECRET not in _all_text(spans), "secrets stay out even with content capture on"


@pytest.mark.asyncio
async def test_failed_run_marks_root_span_error(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=False)
    # input_schema requiring a field that the input lacks fails deterministically.
    graph = wrap_graph_with_trigger_end(
        [
            {
                "id": "fail",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "Need field",
                    "nodeType": "input_schema",
                    "inputFields": [{"key": "must_exist", "type": "string", "required": True}],
                },
            }
        ],
        [],
        entry_id="fail",
        exit_id="fail",
    )
    run = _seed_run(graph, input_text="not json")
    await _execute(run.id, monkeypatch)
    provider.force_flush()

    db = SessionLocal()
    try:
        status = db.get(models.WorkflowRun, run.id).status
    finally:
        db.close()
    assert status == "failed"
    root = next(s for s in sink.get_finished_spans() if s.name == "workflow.run")
    assert root.status.status_code == trace.StatusCode.ERROR
    assert root.attributes["aegis.run_status"] == "failed"
    assert root.status.description is None, "error text can carry content; stripped by default"


@pytest.mark.asyncio
async def test_resume_creates_linked_attempt_without_overwriting_history(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=False)
    prior = {
        "trace_attempts": [
            {"attempt": 1, "trace_id": "ab" * 16, "span_id": "cd" * 8, "started_at": "2026-01-01T00:00:00+00:00"}
        ]
    }
    run = _seed_run(_graph_with_secret(), metrics=prior)
    await _execute(run.id, monkeypatch)
    provider.force_flush()

    root = next(s for s in sink.get_finished_spans() if s.name == "workflow.run")
    assert root.attributes["langsmith.metadata.aegis_execution_attempt"] == 2
    linked = {format(link.context.trace_id, "032x") for link in root.links}
    assert "ab" * 16 in linked, "new attempt links to the previous attempt's trace"

    db = SessionLocal()
    try:
        attempts = db.get(models.WorkflowRun, run.id).metrics_json["trace_attempts"]
    finally:
        db.close()
    assert [a["attempt"] for a in attempts] == [1, 2]
    assert attempts[0]["trace_id"] == "ab" * 16


@pytest.mark.asyncio
async def test_export_failure_never_breaks_a_run(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=False, inner=_FailingExporter())
    run = _seed_run(_graph_with_secret())
    await _execute(run.id, monkeypatch)
    provider.force_flush()

    db = SessionLocal()
    try:
        assert db.get(models.WorkflowRun, run.id).status == "completed"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Sanitizer unit contracts
# ---------------------------------------------------------------------------


def test_sanitizer_strips_adk_content_and_secrets_by_default():
    out = tracing.sanitize_span_attributes(
        "execute_tool calc",
        {
            "gcp.vertex.agent.tool_call_args": '{"q": "CANARY"}',
            "gcp.vertex.agent.tool_response": '{"r": "CANARY"}',
            "gcp.vertex.agent.llm_request": '{"contents": []}',
            "gen_ai.prompt.0.content": "CANARY",
            "gen_ai.tool.name": "calc",
            "http.request.header.authorization": "Bearer abcdefghijkl",
            "provider_api_key": "sk-abcdefghijklmnopqrstuvwxyz",
        },
        capture_content=False,
    )
    assert "CANARY" not in str(out)
    assert not any("authorization" in k or "api_key" in k for k in out)
    assert out["gen_ai.tool.name"] == "calc"
    assert out["langsmith.span.kind"] == "tool"


def test_sanitizer_maps_adk_llm_payload_to_langsmith_messages_when_enabled():
    request = '{"contents": [{"role": "user", "parts": [{"text": "hi there"}]}]}'
    response = '{"content": {"role": "model", "parts": [{"text": "hello!"}]}}'
    out = tracing.sanitize_span_attributes(
        "generate_content gemini-2.5-flash",
        {
            "gcp.vertex.agent.llm_request": request,
            "gcp.vertex.agent.llm_response": response,
            "gen_ai.operation.name": "generate_content",
        },
        capture_content=True,
    )
    assert out["langsmith.span.kind"] == "llm"
    assert out["gen_ai.prompt.0.content"] == "hi there"
    assert out["gen_ai.completion.0.content"] == "hello!"
    assert "gcp.vertex.agent.llm_request" not in out


def test_only_the_provider_request_span_carries_usage():
    """ADK emits generate_content (llm) AND a call_llm wrapper with the same usage;
    node summaries repeat it too. LangSmith sums usage per trace, so exactly one
    span per model call may keep it."""
    usage = {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 50,
        "gen_ai.request.model": "m",
    }
    node = tracing.sanitize_span_attributes(
        "workflow.node", {"node.id": "a", **usage}, capture_content=False
    )
    wrapper = tracing.sanitize_span_attributes("call_llm", dict(usage), capture_content=False)
    request = tracing.sanitize_span_attributes(
        "generate_content m",
        {**usage, "gen_ai.operation.name": "generate_content"},
        capture_content=False,
    )

    for summary in (node, wrapper):
        assert summary["langsmith.span.kind"] == "chain"
        assert "gen_ai.usage.input_tokens" not in summary
        assert summary["aegis.summary.usage.input_tokens"] == 100
    assert request["langsmith.span.kind"] == "llm"
    assert request["gen_ai.usage.input_tokens"] == 100
    assert request["gen_ai.usage.output_tokens"] == 50


def test_value_scrubber_redacts_credential_shaped_strings():
    scrubbed = tracing.sanitize_span_attributes(
        "x",
        {"note": f"token {CANARY_SECRET} and Bearer abcdefghijklmnop"},
        capture_content=True,
    )
    assert CANARY_SECRET not in scrubbed["note"]
    assert "abcdefghijklmnop" not in scrubbed["note"]


# ---------------------------------------------------------------------------
# Model-call + standalone operation coverage
# ---------------------------------------------------------------------------


def test_generate_text_emits_llm_span_with_usage_and_no_content(langsmith_sink, monkeypatch):
    from types import SimpleNamespace

    from app.services import llm_providers

    sink, provider = langsmith_sink(capture_content=False)

    class _Models:
        def generate_content(self, **kwargs):  # noqa: ARG002
            return SimpleNamespace(
                text="ANSWER-CANARY",
                usage_metadata=SimpleNamespace(
                    prompt_token_count=11, candidates_token_count=4, total_token_count=15
                ),
            )

    monkeypatch.setattr(
        llm_providers, "_genai_client", lambda pm: SimpleNamespace(models=_Models())  # noqa: ARG005
    )
    pm = llm_providers.ProviderModel(provider="google", model="gemini-test")
    out = llm_providers.generate_text(pm, system_instruction="s", contents=CANARY_PROMPT)
    provider.force_flush()

    assert out == "ANSWER-CANARY"
    span = next(s for s in sink.get_finished_spans() if s.name.startswith("chat gemini-test"))
    assert span.attributes["langsmith.span.kind"] == "llm"
    assert span.attributes["gen_ai.system"] == "google"
    assert span.attributes["gen_ai.usage.input_tokens"] == 11
    assert span.attributes["gen_ai.usage.output_tokens"] == 4
    assert span.attributes["gen_ai.usage.total_tokens"] == 15
    text = _all_text(sink.get_finished_spans())
    assert CANARY_PROMPT not in text and "ANSWER-CANARY" not in text


def test_model_call_is_a_noop_when_tracing_disabled():
    tracing.shutdown_tracing()
    with tracing.model_call_span("google", "m") as call:
        call.set_usage(1, 2)
        call.set_io(prompt="x", completion="y")  # must not raise


def test_operation_span_detaches_from_http_request(langsmith_sink):
    sink, provider = langsmith_sink(capture_content=False)
    request_span = tracing._tracer.start_span("POST /api/playground/run", kind=trace.SpanKind.SERVER)
    with trace.use_span(request_span, end_on_exit=True):
        with tracing.operation_span("playground.variant", {"aegis.operation": "playground"}):
            pass
    provider.force_flush()
    op = next(s for s in sink.get_finished_spans() if s.name == "playground.variant")
    assert op.parent is None and len(op.links) == 1


def test_health_reports_langsmith_export_state(langsmith_sink):
    from fastapi.testclient import TestClient

    from app.main import app

    langsmith_sink(capture_content=False)
    body = TestClient(app).get("/health").json()
    assert body["langsmith_export"] is True
    assert body["langsmith_capture_content"] is False
    assert "api_key" not in str(body).lower()


# ---------------------------------------------------------------------------
# Review-driven regressions
# ---------------------------------------------------------------------------


def test_unsampled_span_never_yields_ids():
    """A non-recording span has a valid context; persisting its id would point at a
    trace that was never exported."""
    provider = TracerProvider(sampler=ParentBased(TraceIdRatioBased(0.0)))
    tracer = provider.get_tracer("t")
    with tracer.start_as_current_span("root") as span:
        assert span.get_span_context().is_valid and not span.is_recording()
        assert tracing.get_trace_id() is None
        assert tracing.get_span_id() is None

    sampled = TracerProvider(sampler=ParentBased(TraceIdRatioBased(1.0))).get_tracer("t")
    with sampled.start_as_current_span("root"):
        assert tracing.get_trace_id() is not None
        assert tracing.get_span_id() is not None


@pytest.mark.parametrize(
    "key",
    [
        "gen_ai.prompt",
        "gen_ai.completion",
        "gen_ai.prompt.3.content",
        "gen_ai.input.messages",
        "gen_ai.output.messages",
        "gen_ai.system_instructions",
        "gen_ai.tool.call.arguments",
        "input.value",
        "output.value",
        "llm.input_messages",
        "llm.invocation_parameters",
        "retrieval.documents.0.document.content",
        "traceloop.entity.input",
        "tool_arguments",
        "tools",
        "prompt",
        "metadata",
    ],
)
def test_every_langsmith_ingested_content_key_is_stripped(key):
    out = tracing.sanitize_span_attributes(
        "x", {key: "CONTENT-CANARY", "gen_ai.usage.input_tokens": 3}, capture_content=False
    )
    assert "CONTENT-CANARY" not in str(out), key


def test_content_prefixes_do_not_eat_unrelated_numeric_keys():
    out = tracing.sanitize_span_attributes(
        "generate_content m",
        {
            "gen_ai.operation.name": "generate_content",
            "gen_ai.usage.prompt_tokens": 9,
            "gen_ai.usage.input_tokens": 9,
            "prompt_tokens": 9,
            "tools_count": 2,
        },
        capture_content=False,
    )
    assert out["gen_ai.usage.input_tokens"] == 9
    assert out["prompt_tokens"] == 9 and out["tools_count"] == 2


def test_content_events_are_dropped_by_default_and_kept_when_enabled():
    from opentelemetry.sdk.trace import Event

    events = [
        Event("gen_ai.content.prompt", {"gen_ai.prompt": "EVENT-CANARY"}, 1),
        Event("gen_ai.user.message", {"content": "EVENT-CANARY"}, 2),
        Event("gen_ai.choice", {"message.content": "EVENT-CANARY"}, 3),
        Event("exception", {"exception.type": "ValueError", "exception.message": "EVENT-CANARY",
                            "exception.stacktrace": "EVENT-CANARY"}, 4),
        Event("custom.marker", {"detail": "EVENT-CANARY"}, 5),
    ]
    stripped = tracing._sanitize_events(events, capture_content=False)
    assert "EVENT-CANARY" not in str([(e.name, dict(e.attributes)) for e in stripped])
    assert [e.name for e in stripped] == ["exception", "custom.marker"]
    assert dict(stripped[0].attributes) == {"exception.type": "ValueError"}

    kept = tracing._sanitize_events(events, capture_content=True)
    assert "exception.stacktrace" not in dict(kept[-2].attributes), "stack traces never leave"


@pytest.mark.asyncio
async def test_cancellation_during_run_is_not_swallowed_by_span_finalize(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=False)
    run = _seed_run(_graph_with_secret())

    async def _cancelled(*_args, **_kwargs):
        raise asyncio.CancelledError()

    async def _noop():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop)
    monkeypatch.setattr(executor, "_run_workflow", _cancelled)
    with pytest.raises(asyncio.CancelledError):
        await executor.execute_run(run.id)
    provider.force_flush()

    root = next(s for s in sink.get_finished_spans() if s.name == "workflow.run")
    assert root.status.status_code == trace.StatusCode.ERROR
    assert root.attributes["aegis.run_status"] in ("cancelled", "failed")


def test_pre_installed_global_provider_is_surfaced_not_silent(monkeypatch):
    """Asserts observable state (and /health), not log text: the app's logging
    config disables pre-existing loggers, so log assertions are environment-bound."""
    tracing.shutdown_tracing()
    monkeypatch.setattr(tracing, "OTLPSpanExporter", lambda **kwargs: InMemorySpanExporter())
    monkeypatch.setattr(settings, "otel_enabled", False)
    monkeypatch.setattr(settings, "langsmith_enabled", True)
    monkeypatch.setattr(settings, "langsmith_api_key", "lsv2_test_key_value")
    # Simulate "someone else already owns the global provider".
    monkeypatch.setattr(tracing.trace, "set_tracer_provider", lambda provider: None)
    monkeypatch.setattr(tracing.trace, "get_tracer_provider", lambda: object())
    try:
        tracing.init_tracing()
        assert tracing.is_langsmith_export_enabled() is True, "our own spans still export"
        assert tracing.adk_spans_exported() is False, "ADK spans would bypass our exporters"
    finally:
        tracing.shutdown_tracing()
        tracing._global_provider_owned = True


# ---------------------------------------------------------------------------
# PR review: secret fields in captured content, scheduled eval, shutdown, counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_captured_json_input_never_exports_password_fields(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=True)
    secret_input = '{"password": "ordinary-private-password", "user": "ada", "profile": {"api_key": "k-123456789"}}'
    run = _seed_run(_graph_with_secret(), input_text=secret_input)
    await _execute(run.id, monkeypatch)
    provider.force_flush()

    root = next(s for s in sink.get_finished_spans() if s.name == "workflow.run")
    exported = root.attributes["input.value"]
    assert "ordinary-private-password" not in exported
    assert "k-123456789" not in exported
    assert "ada" in exported, "non-secret fields survive so the trace stays useful"
    assert "ordinary-private-password" not in _all_text(sink.get_finished_spans())


@pytest.mark.parametrize(
    "raw,must_not_contain",
    [
        ('login failed password=hunter2 for ada', "hunter2"),
        ("user=ada&token=abc123xyz&x=1", "abc123xyz"),
        ('[{"secret": "s3cret"}, {"name": "x"}]', "s3cret"),
        ("Authorization: Bearer abcdefghijklmnop", "abcdefghijklmnop"),
    ],
)
def test_non_json_and_nested_secret_shapes_are_redacted(raw, must_not_contain):
    assert must_not_contain not in tracing._scrub_value(raw)


def test_token_counts_are_not_mistaken_for_secrets():
    text = "prompt_tokens: 12 max_tokens=100 token_count: 5"
    assert tracing._scrub_value(text) == text


@pytest.mark.asyncio
async def test_scheduled_online_eval_nests_under_the_run_via_copied_context(langsmith_sink):
    """schedule_task uses loop.create_task, which copies the creator's context, so a
    fire-and-forget eval started inside the run parents on workflow.run. A late child
    of an exported parent is valid for LangSmith; this pins that behaviour."""
    from app.services.async_tasks import schedule_task

    sink, provider = langsmith_sink(capture_content=False)

    async def _eval():
        with tracing.operation_span("online_eval", {"aegis.operation": "online_eval"}):
            pass

    task = None
    with tracing.workflow_run_span("run-x", "wf-x", "WF"):
        task = schedule_task(_eval())
    await task  # runs after the workflow span has already ended
    provider.force_flush()

    spans = {s.name: s for s in sink.get_finished_spans()}
    root, evaluation = spans["workflow.run"], spans["online_eval"]
    assert evaluation.parent is not None
    assert evaluation.parent.span_id == root.context.span_id
    assert evaluation.context.trace_id == root.context.trace_id


@pytest.mark.asyncio
async def test_attempt_count_survives_the_bounded_window(langsmith_sink, monkeypatch):
    sink, provider = langsmith_sink(capture_content=False)
    window = [
        {"attempt": n, "trace_id": f"{n:032x}", "span_id": f"{n:016x}", "started_at": "2026-01-01T00:00:00+00:00"}
        for n in range(2, 22)  # 20 retained entries, attempts 2..21
    ]
    run = _seed_run(_graph_with_secret(), metrics={"trace_attempts": window, "trace_attempt_count": 21})
    await _execute(run.id, monkeypatch)
    provider.force_flush()

    root = next(s for s in sink.get_finished_spans() if s.name == "workflow.run")
    assert root.attributes["langsmith.metadata.aegis_execution_attempt"] == 22
    db = SessionLocal()
    try:
        metrics = db.get(models.WorkflowRun, run.id).metrics_json
    finally:
        db.close()
    assert metrics["trace_attempt_count"] == 22
    assert len(metrics["trace_attempts"]) == 20, "window stays bounded"


@pytest.mark.asyncio
async def test_worker_shutdown_drains_active_runs_before_closing_tracing():
    import worker

    order: list[str] = []

    async def _noop(*_a, **_k):
        return None

    import app.services.executor as ex_mod
    import app.services.tracing as tr_mod

    async def _drain():
        order.append("drain")

    saved = (ex_mod.shutdown_active_runs, tr_mod.shutdown_tracing, worker.stop_run_worker, worker.start_run_worker)
    ex_mod.shutdown_active_runs = _drain
    tr_mod.shutdown_tracing = lambda: order.append("tracing")
    worker.stop_run_worker = _noop
    worker.start_run_worker = lambda: None
    try:
        async with worker.lifespan(worker.app):
            pass
    finally:
        ex_mod.shutdown_active_runs, tr_mod.shutdown_tracing, worker.stop_run_worker, worker.start_run_worker = saved
    assert order == ["drain", "tracing"], order
