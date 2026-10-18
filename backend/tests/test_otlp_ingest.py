"""Inbound OTLP: POST /v1/ingest/runs accepts OTLP/GenAI-convention spans.

An OTLP/JSON ``resourceSpans`` envelope must land as WorkflowRun + NodeResult
(roots) + RunSpan (descendants) + LlmCall (gen_ai.* spans) — and the bespoke
Aegis JSON shape must keep working on the same path.
"""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app

client = TestClient(app)

_BASE_NS = 1_700_000_000_000_000_000


def _otlp_payload() -> dict:
    """A minimal-but-realistic OTel/GenAI export: agent root → llm + tool."""
    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        {
                            "key": "service.name",
                            "value": {"stringValue": "otlp-test-agent"},
                        }
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "my-agent"},
                        "spans": [
                            {
                                "traceId": "aa" * 16,
                                "spanId": "root01",
                                "name": "agent run",
                                "kind": 1,
                                "startTimeUnixNano": str(_BASE_NS),
                                "endTimeUnixNano": str(_BASE_NS + 2_000_000_000),
                                "status": {"code": "STATUS_CODE_OK"},
                            },
                            {
                                "traceId": "aa" * 16,
                                "spanId": "llm001",
                                "parentSpanId": "root01",
                                "name": "chat gpt-4o",
                                "startTimeUnixNano": str(_BASE_NS + 100_000_000),
                                "endTimeUnixNano": str(_BASE_NS + 1_100_000_000),
                                "status": {"code": "STATUS_CODE_OK"},
                                "attributes": [
                                    {
                                        "key": "gen_ai.operation.name",
                                        "value": {"stringValue": "chat"},
                                    },
                                    {
                                        "key": "gen_ai.system",
                                        "value": {"stringValue": "openai"},
                                    },
                                    {
                                        "key": "gen_ai.request.model",
                                        "value": {"stringValue": "gpt-4o"},
                                    },
                                    {
                                        "key": "gen_ai.response.model",
                                        "value": {"stringValue": "gpt-4o-2024-08-06"},
                                    },
                                    {
                                        "key": "gen_ai.usage.input_tokens",
                                        "value": {"intValue": "150"},
                                    },
                                    {
                                        "key": "gen_ai.usage.output_tokens",
                                        "value": {"intValue": "40"},
                                    },
                                ],
                            },
                            {
                                "traceId": "aa" * 16,
                                "spanId": "tool01",
                                "parentSpanId": "root01",
                                "name": "web_search",
                                "startTimeUnixNano": str(_BASE_NS + 1_200_000_000),
                                "endTimeUnixNano": str(_BASE_NS + 1_900_000_000),
                                "status": {"code": "STATUS_CODE_ERROR"},
                                "attributes": [
                                    {
                                        "key": "gen_ai.tool.name",
                                        "value": {"stringValue": "web_search"},
                                    }
                                ],
                            },
                        ],
                    }
                ],
            }
        ]
    }


def test_otlp_ingest_lands_trace_rows():
    res = client.post("/v1/ingest/runs", json=_otlp_payload())
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["format"] == "otlp"
    assert body["spans"] == 3
    assert body["node_results"] == 1
    assert body["llm_calls"] == 1

    run_id = body["run_id"]
    db = SessionLocal()
    try:
        run = db.get(models.WorkflowRun, UUID(run_id))
        assert run is not None
        # tool span erred → run failed
        assert run.status == "failed"
        # trace_id threads the run into a session
        assert run.session_id == "aa" * 16
        # workflow resolved from resource service.name
        wf = run.version.workflow
        assert str(wf.id) == body["workflow_id"]
        assert wf.name == "[external] otlp-test-agent"

        node_results = (
            db.query(models.NodeResult)
            .filter(models.NodeResult.run_id == run.id)
            .all()
        )
        assert len(node_results) == 1
        assert node_results[0].node_type == "external"
        assert node_results[0].latency_ms == 2000

        spans = (
            db.query(models.RunSpan)
            .filter(models.RunSpan.run_id == run.id)
            .all()
        )
        assert len(spans) == 2
        by_kind = {s.kind: s for s in spans}
        assert set(by_kind) == {"llm_call", "tool_call"}
        llm_span = by_kind["llm_call"]
        assert llm_span.duration_ms == 1000
        assert (llm_span.tokens_json or {}).get("total") == 190
        assert (llm_span.attributes_json or {}).get("gen_ai.system") == "openai"
        assert by_kind["tool_call"].status == "failed"
        # both children hang under the root's node id
        assert {s.node_id for s in spans} == {"agent run"}

        calls = (
            db.query(models.LlmCall)
            .filter(models.LlmCall.run_id == run.id)
            .all()
        )
        assert len(calls) == 1
        call = calls[0]
        assert call.model == "gpt-4o-2024-08-06"
        assert call.prompt_tokens == 150
        assert call.completion_tokens == 40
        assert call.total_tokens == 190
        assert call.latency_ms == 1000
    finally:
        db.close()

    # …and the ingested rows are reachable via the cross-run search
    res = client.get(
        "/api/observability/spans",
        params={"run_id": run_id, "source": "llm_calls"},
    )
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["model"] == "gpt-4o-2024-08-06"
    assert items[0]["total_tokens"] == 190

def _two_trace_payload() -> dict:
    """One batch, two independent traces: trace A ok, trace B errored."""
    def _span(trace, span_id, name, status, start, end):
        return {
            "traceId": trace,
            "spanId": span_id,
            "name": name,
            "kind": 1,
            "startTimeUnixNano": str(start),
            "endTimeUnixNano": str(end),
            "status": {"code": status},
        }

    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "multi-trace-agent"}}
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "agent"},
                        "spans": [
                            _span("aa" * 16, "a_root", "trace A run", "STATUS_CODE_OK",
                                  _BASE_NS, _BASE_NS + 1_000_000_000),
                            _span("bb" * 16, "b_root", "trace B run", "STATUS_CODE_ERROR",
                                  _BASE_NS + 2_000_000_000, _BASE_NS + 2_500_000_000),
                        ],
                    }
                ],
            }
        ]
    }


def test_otlp_batch_splits_runs_by_trace_id():
    """A collector batch with two trace ids must land as two independent runs —
    one failure must not mark the other failed, nor merge their timing."""
    res = client.post("/v1/ingest/runs", json=_two_trace_payload())
    assert res.status_code == 201, res.text
    body = res.json()
    run_ids = body["run_ids"]
    assert len(run_ids) == 2, body

    db = SessionLocal()
    try:
        runs = [db.get(models.WorkflowRun, UUID(rid)) for rid in run_ids]
        statuses = {r.status for r in runs}
        sessions = {r.session_id for r in runs}
        # Independent statuses — not both failed.
        assert statuses == {"completed", "failed"}, statuses
        # Each run keyed to its own trace id, not the first.
        assert sessions == {"aa" * 16, "bb" * 16}, sessions
    finally:
        db.close()


def test_otlp_explicit_format_field():
    payload = _otlp_payload()
    payload["format"] = "otlp"
    # move resourceSpans under a sub-key? No — explicit format still reads
    # top-level resourceSpans; just assert explicit marker works.
    res = client.post("/v1/ingest/runs", json=payload)
    assert res.status_code == 201, res.text
    assert res.json()["format"] == "otlp"


def test_otlp_empty_envelope_rejected():
    res = client.post("/v1/ingest/runs", json={"resourceSpans": []})
    assert res.status_code == 400


def test_bespoke_ingest_still_works():
    res = client.post(
        "/v1/ingest/runs",
        json={
            "workflow_name": "bespoke-agent",
            "input": "ping",
            "output": "pong",
            "node_events": [
                {"node_id": "n1", "label": "Step 1", "latency_ms": 12}
            ],
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert "run_id" in body

    db = SessionLocal()
    try:
        run = db.get(models.WorkflowRun, UUID(body["run_id"]))
        assert run is not None
        assert run.final_output == "pong"
        assert len(run.node_results) == 1
        assert run.node_results[0].latency_ms == 12
    finally:
        db.close()


def test_unknown_format_rejected():
    res = client.post(
        "/v1/ingest/runs",
        json={"format": "zipkin", "workflow_name": "x"},
    )
    assert res.status_code == 400


def test_otlp_ingest_clamps_overflow_timestamp_and_coerces_output():
    """L6: broken-emitter nanos (far future) must not 500 ingest; structured
    output must land as serialized text, not a driver error."""
    from app.services.otlp_ingest import _coerce_output_text, _nano_to_dt

    assert _nano_to_dt(10**21) is None  # past year 9999
    assert _nano_to_dt(-5) is None
    assert _nano_to_dt(1_700_000_000_000_000_000) is not None
    assert _coerce_output_text({"a": 1}) == '{"a": 1}'
    assert _coerce_output_text([1, 2]) == "[1, 2]"
    assert _coerce_output_text("plain") == "plain"
    assert _coerce_output_text(None) is None


def test_otlp_namespace_never_collides_with_real_workflow():
    """M10: an ingested service named like a real workflow lands in the
    reserved [external] namespace instead of polluting its eval history."""
    from app.db.database import SessionLocal
    from app.services.otlp_ingest import resolve_external_workflow
    from app.auth.deps import DEFAULT_DEV_USER_ID

    db = SessionLocal()
    try:
        wf, _ = resolve_external_workflow(db, DEFAULT_DEV_USER_ID, "MyRealWorkflow")
        db.commit()
        assert wf.name == "[external] MyRealWorkflow"
        # Idempotent: second resolve returns the same row.
        wf2, _ = resolve_external_workflow(db, DEFAULT_DEV_USER_ID, "MyRealWorkflow")
        assert wf2.id == wf.id
    finally:
        db.close()
