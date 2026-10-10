"""Cross-run span/LLM-call search: GET /api/observability/spans.

Seeds two workflows with runs carrying RunSpan + LlmCall rows, then asserts
the merged, filtered, paginated results and the ownership scoping.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app

client = TestClient(app)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _seed_run(name: str, *, user_id=None):
    """Create workflow+version+run; return (workflow_id, run_id) as UUIDs."""
    db = SessionLocal()
    try:
        wf = models.Workflow(
            id=uuid4(), user_id=user_id or DEFAULT_DEV_USER_ID, name=name
        )
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(),
            workflow_id=wf.id,
            version_number=1,
            graph_json={"nodes": [], "edges": []},
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status="completed",
            input_text="hi",
            started_at=_utcnow(),
        )
        db.add(run)
        db.commit()
        return wf.id, run.id
    finally:
        db.close()


def _add_span(run_id: str, **kw) -> None:
    db = SessionLocal()
    try:
        db.add(models.RunSpan(run_id=run_id, **kw))
        db.commit()
    finally:
        db.close()


def _add_llm_call(run_id: str, **kw) -> None:
    db = SessionLocal()
    try:
        db.add(models.LlmCall(run_id=run_id, **kw))
        db.commit()
    finally:
        db.close()


def test_spans_search_merges_both_tables():
    wf_id, run_id = _seed_run(f"search-{uuid4().hex[:8]}")
    _add_span(
        run_id,
        node_id="agent1",
        kind="tool_call",
        name="kb_retrieve",
        status="completed",
        duration_ms=900,
        attributes_json={"started_wall": 1.0},
    )
    _add_llm_call(
        run_id,
        node_id="agent1",
        model="gemini-2.5-flash",
        total_tokens=1200,
        latency_ms=800,
        cost_usd=0.001,
    )

    res = client.get("/api/observability/spans", params={"workflow_id": str(wf_id)})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    records = {item["record"] for item in body["items"]}
    assert records == {"span", "llm_call"}
    llm = next(i for i in body["items"] if i["record"] == "llm_call")
    assert llm["model"] == "gemini-2.5-flash"
    assert llm["kind"] == "llm_call"
    assert llm["run_id"] == str(run_id)


def test_spans_search_filters():
    wf_id, run_id = _seed_run(f"filter-{uuid4().hex[:8]}")
    _add_span(
        run_id, node_id="a", kind="tool_call", name="slow_tool",
        status="failed", duration_ms=5000,
    )
    _add_span(
        run_id, node_id="b", kind="llm_call", name="gemini-2.5-pro",
        status="completed", duration_ms=200,
        tokens_json={"total": 3000},
    )
    _add_llm_call(
        run_id, node_id="b", model="gemini-2.5-pro",
        total_tokens=3000, latency_ms=200,
    )

    # kind filter → spans only
    res = client.get(
        "/api/observability/spans",
        params={"workflow_id": str(wf_id), "kind": "tool_call"},
    )
    items = res.json()["items"]
    assert len(items) == 1 and items[0]["name"] == "slow_tool"

    # status filter → failed span only
    res = client.get(
        "/api/observability/spans",
        params={"workflow_id": str(wf_id), "status": "failed"},
    )
    items = res.json()["items"]
    assert len(items) == 1 and items[0]["status"] == "failed"

    # latency band → only the slow span survives >=4000
    res = client.get(
        "/api/observability/spans",
        params={"workflow_id": str(wf_id), "min_latency_ms": 4000},
    )
    items = res.json()["items"]
    assert len(items) == 1 and items[0]["latency_ms"] == 5000

    # model substring matches both the llm_call span name and LlmCall.model
    res = client.get(
        "/api/observability/spans",
        params={"workflow_id": str(wf_id), "model": "gemini-2.5-pro"},
    )
    items = res.json()["items"]
    assert len(items) == 2
    assert {i["model"] for i in items} == {"gemini-2.5-pro"}

    # token range → the two 3000-token records, not the untokened tool
    res = client.get(
        "/api/observability/spans",
        params={"workflow_id": str(wf_id), "min_tokens": 2000},
    )
    items = res.json()["items"]
    assert len(items) == 2

    # node_id narrows to one node's records
    res = client.get(
        "/api/observability/spans",
        params={"workflow_id": str(wf_id), "node_id": "a"},
    )
    items = res.json()["items"]
    assert len(items) == 1 and items[0]["node_id"] == "a"


def test_spans_search_scopes_to_owner():
    """Foreign user's spans must not leak through the search."""
    foreign_user = uuid4()
    _wf, foreign_run = _seed_run(
        f"foreign-{uuid4().hex[:8]}", user_id=foreign_user
    )
    _add_span(
        foreign_run, node_id="x", kind="tool_call",
        name="secret_tool", status="completed", duration_ms=10,
    )

    res = client.get("/api/observability/spans", params={"kind": "tool_call"})
    assert res.status_code == 200
    names = [i["name"] for i in res.json()["items"]]
    assert "secret_tool" not in names


def test_spans_search_pagination():
    wf_id, run_id = _seed_run(f"page-{uuid4().hex[:8]}")
    for i in range(5):
        _add_llm_call(
            run_id, node_id="n", model=f"m-{i}",
            total_tokens=10, latency_ms=i,
        )

    res = client.get(
        "/api/observability/spans",
        params={
            "workflow_id": str(wf_id), "source": "llm_calls",
            "limit": 2, "offset": 0,
        },
    )
    body = res.json()
    assert body["total"] == 5 and len(body["items"]) == 2

    res2 = client.get(
        "/api/observability/spans",
        params={
            "workflow_id": str(wf_id), "source": "llm_calls",
            "limit": 2, "offset": 4,
        },
    )
    body2 = res2.json()
    assert len(body2["items"]) == 1


def test_spans_search_bad_source_rejected():
    res = client.get("/api/observability/spans", params={"source": "bogus"})
    assert res.status_code == 400
