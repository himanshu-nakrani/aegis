"""Integration coverage for previously-dark critical paths (audit P1/P2).

Targets the exact gaps called out in docs/audit-2026-08-07.md:

* P1-14 — human-approval ``/approve`` transitions (approve→running, deny→failed,
  wrong-status guard) and that the decision is delivered to the per-node
  approval key the executor's ``wait_for_approval`` reads.
* P1-16 — deferred eval fan-out actually runs concurrently and maps
  results/errors per node (the pre-existing test mocked and asserted nothing).
* P1-17 — ``_consume_with_timeout`` charges only active time and is exempt while
  a run is parked ``awaiting_approval`` (the inverted-check bug it prevents).
* P2-17 — retention purge removes child ``run_spans`` explicitly (SQLite has no
  ON DELETE CASCADE), so spans are never orphaned.
"""

from __future__ import annotations

import asyncio
import threading
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services import approval_service
from app.services import eval_runner
from app.services import executor as executor_service
from app.services.graph_defaults import wrap_graph_with_trigger_end

client = TestClient(app)


def _linear_graph() -> dict:
    return wrap_graph_with_trigger_end(
        [
            {
                "id": "a",
                "position": {"x": 0, "y": 0},
                "data": {"label": "A", "nodeType": "transform", "template": "A"},
            }
        ],
        [],
        entry_id="a",
        exit_id="a",
    )


def _seed_run(status: str, *, metrics: dict | None = None) -> models.WorkflowRun:
    db = SessionLocal()
    try:
        wf = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Approval WF")
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1, graph_json=_linear_graph()
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status=status,
            input_text="hello",
            metrics_json=metrics or {},
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()


def _run_status(run_id) -> tuple[str, dict]:
    db = SessionLocal()
    try:
        row = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        return row.status, dict(row.metrics_json or {})
    finally:
        db.close()


def _park_run_approval(run: models.WorkflowRun, node_id: str = "approve1") -> str:
    metadata = asyncio.run(approval_service.park_approval(str(run.id), node_id, "ok?"))
    with SessionLocal() as db:
        row = db.get(models.WorkflowRun, run.id)
        row.status = "awaiting_approval"
        row.metrics_json = {**(row.metrics_json or {}), "pending_approval": metadata}
        db.commit()
    return metadata["approval_id"]


# ---------------------------------------------------------------------------
# P1-14 — human-approval /approve transitions
# ---------------------------------------------------------------------------


def test_approve_run_resumes_and_delivers_decision_to_node_waiter():
    run = _seed_run("awaiting_approval")
    approval_id = _park_run_approval(run)
    other_key = approval_service._approval_key(str(run.id), "unrelated")
    other_event = asyncio.Event()
    run_event = asyncio.Event()
    approval_service._approval_events[other_key] = other_event
    approval_service._approval_events[str(run.id)] = run_event

    resp = client.post(
        f"/api/runs/{run.id}/approve",
        json={"approval_id": approval_id, "approved": True, "comment": "lgtm"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "running"

    status, metrics = _run_status(run.id)
    assert status == "running"
    # pending_approval is cleared; the decision is recorded for the UI.
    assert "pending_approval" not in metrics
    assert metrics["approval_decision"]["approved"] is True
    assert metrics["approval_decision"]["node_id"] == "approve1"
    assert metrics["approval_decision"]["approval_id"] == approval_id
    with SessionLocal() as db:
        approval = db.get(models.ApprovalRequest, UUID(approval_id))
        assert approval.status == "approved"
        assert approval.comment == "lgtm"
        assert approval.resolved_at is not None
    assert not other_event.is_set()
    assert not run_event.is_set()
    assert other_key not in approval_service._approval_results
    assert str(run.id) not in approval_service._approval_results

    # The decision is delivered under the per-node key the executor waits on,
    # so wait_for_approval(run_id, node_id="approve1") resolves rather than
    # stranding the run forever.
    decision = asyncio.run(
        approval_service.wait_for_approval(str(run.id), node_id="approve1", timeout=1.0)
    )
    assert decision["approved"] is True
    assert decision["comment"] == "lgtm"
    approval_service.clear_approval_state(str(run.id))


def test_deny_run_marks_failed_with_comment():
    run = _seed_run("awaiting_approval")
    approval_id = _park_run_approval(run)

    resp = client.post(
        f"/api/runs/{run.id}/approve",
        json={"approval_id": approval_id, "approved": False, "comment": "nope"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "failed"

    status, metrics = _run_status(run.id)
    assert status == "failed"
    assert metrics["approval_decision"]["approved"] is False
    db = SessionLocal()
    try:
        row = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run.id).first()
        assert row.final_output == "nope"
        assert row.completed_at is not None
        approval = db.get(models.ApprovalRequest, UUID(approval_id))
        assert approval.status == "denied"
        assert approval.comment == "nope"
        assert approval.resolved_at is not None
    finally:
        db.close()
    approval_service.clear_approval_state(str(run.id))


def test_approve_rejects_run_not_awaiting_approval():
    run = _seed_run("running")
    resp = client.post(
        f"/api/runs/{run.id}/approve",
        json={"approval_id": str(uuid4()), "approved": True},
    )
    assert resp.status_code == 400
    assert "awaiting approval" in resp.json()["detail"].lower()


@pytest.mark.parametrize("approved", [True, False])
def test_delayed_approval_a_cannot_resolve_newly_parked_b(approved):
    run = _seed_run("awaiting_approval")
    first_id = _park_run_approval(run)
    first_response = client.post(
        f"/api/runs/{run.id}/approve",
        json={"approval_id": first_id, "approved": True, "comment": "First decision"},
    )
    assert first_response.status_code == 200, first_response.text
    first_decision = asyncio.run(
        approval_service.wait_for_approval(str(run.id), node_id="approve1", timeout=1.0)
    )
    assert first_decision == {"approved": True, "comment": "First decision"}
    # Reuse the node key: only the request UUID distinguishes successive calls.
    second_id = _park_run_approval(run)
    before = _run_status(run.id)
    key = approval_service._approval_key(str(run.id), "approve1")
    second_event = approval_service._approval_events[key]
    try:
        delayed = client.post(
            f"/api/runs/{run.id}/approve",
            json={"approval_id": first_id, "approved": approved, "comment": "Delayed response"},
        )
        assert delayed.status_code == 409, delayed.text
        assert _run_status(run.id) == before
        assert not second_event.is_set()
        assert key not in approval_service._approval_results
        with SessionLocal() as db:
            first = db.get(models.ApprovalRequest, UUID(first_id))
            second = db.get(models.ApprovalRequest, UUID(second_id))
            assert first.status == "approved"
            assert first.comment == "First decision"
            assert second.status == "parked"
            assert second.comment is None
            assert second.resolved_at is None
            stored_run = db.get(models.WorkflowRun, run.id)
            assert stored_run.final_output is None
            assert stored_run.completed_at is None
        current = client.post(
            f"/api/runs/{run.id}/approve",
            json={"approval_id": second_id, "approved": approved, "comment": "Current decision"},
        )
        assert current.status_code == 200, current.text
        assert second_event.is_set()
        assert approval_service._approval_results[key] == {
            "approved": approved, "comment": "Current decision",
        }
        with SessionLocal() as db:
            second = db.get(models.ApprovalRequest, UUID(second_id))
            assert second.status == ("approved" if approved else "denied")
            assert second.comment == "Current decision"
    finally:
        approval_service.clear_approval_state(str(run.id))


def test_approval_replacement_after_read_rolls_back_record_transition(monkeypatch):
    from app.api import runs as runs_api

    run = _seed_run("awaiting_approval")
    first_id = _park_run_approval(run)
    original_get = runs_api._get_user_run
    replacement = {}

    def replace_after_read(db, run_id, user_id):
        loaded = original_get(db, run_id, user_id)
        replacement["approval_id"] = _park_run_approval(run)
        replacement["before"] = _run_status(run.id)
        return loaded

    monkeypatch.setattr(runs_api, "_get_user_run", replace_after_read)
    try:
        response = client.post(
            f"/api/runs/{run.id}/approve",
            json={"approval_id": first_id, "approved": False, "comment": "Old decision"},
        )
        assert response.status_code == 409, response.text
        assert _run_status(run.id) == replacement["before"]
        with SessionLocal() as db:
            for approval_id in (first_id, replacement["approval_id"]):
                approval = db.get(models.ApprovalRequest, UUID(approval_id))
                assert approval.status == "parked"
                assert approval.comment is None
                assert approval.resolved_at is None
            stored_run = db.get(models.WorkflowRun, run.id)
            assert stored_run.final_output is None
            assert stored_run.completed_at is None
        key = approval_service._approval_key(str(run.id), "approve1")
        assert not approval_service._approval_events[key].is_set()
        assert key not in approval_service._approval_results
    finally:
        approval_service.clear_approval_state(str(run.id))


@pytest.mark.parametrize("approval_id", [None, "not-a-uuid"])
def test_approval_requires_current_request_uuid(approval_id):
    run = _seed_run("awaiting_approval")
    current_id = _park_run_approval(run)
    payload = {"approved": True}
    if approval_id is not None:
        payload["approval_id"] = approval_id
    try:
        before = _run_status(run.id)
        response = client.post(f"/api/runs/{run.id}/approve", json=payload)
        assert response.status_code == 422, response.text
        assert _run_status(run.id) == before
        with SessionLocal() as db:
            assert db.get(models.ApprovalRequest, UUID(current_id)).status == "parked"
        key = approval_service._approval_key(str(run.id), "approve1")
        assert not approval_service._approval_events[key].is_set()
        assert key not in approval_service._approval_results
    finally:
        approval_service.clear_approval_state(str(run.id))


@pytest.mark.parametrize("record_change", ["resolved", "wrong_node", "missing"])
def test_approval_rejects_pending_metadata_without_matching_parked_row(record_change):
    run = _seed_run("awaiting_approval")
    approval_id = _park_run_approval(run)
    with SessionLocal() as db:
        approval = db.get(models.ApprovalRequest, UUID(approval_id))
        if record_change == "resolved":
            approval.status = "timed_out"
        elif record_change == "wrong_node":
            approval.node_id = "different-node"
        else:
            db.delete(approval)
        db.commit()
    before = _run_status(run.id)
    key = approval_service._approval_key(str(run.id), "approve1")
    try:
        response = client.post(
            f"/api/runs/{run.id}/approve",
            json={"approval_id": approval_id, "approved": True},
        )
        assert response.status_code == 409, response.text
        assert _run_status(run.id) == before
        assert not approval_service._approval_events[key].is_set()
        assert key not in approval_service._approval_results
        with SessionLocal() as db:
            approval = db.get(models.ApprovalRequest, UUID(approval_id))
            if record_change == "missing":
                assert approval is None
            else:
                assert approval.status == ("timed_out" if record_change == "resolved" else "parked")
                assert approval.comment is None
                assert approval.resolved_at is None
    finally:
        approval_service.clear_approval_state(str(run.id))


def test_cross_process_approve_reaches_waiter_via_row_poll(monkeypatch):
    """A decision committed by another process reaches a waiter that never gets
    the in-process Event: the approval row is the durable wait truth."""
    from app.api import runs as runs_api

    async def _noop_deliver(url, payload):
        return True

    monkeypatch.setattr(approval_service, "dispatch_webhook", _noop_deliver)
    monkeypatch.setattr(approval_service, "_POLL_SECONDS", 0.05)
    run = _seed_run("awaiting_approval")
    approval_id = _park_run_approval(run)

    # Simulate a remote deciding process: the endpoint commits the row but the
    # local fast path cannot deliver into this waiter's process.
    monkeypatch.setattr(runs_api, "submit_approval", lambda *args, **kwargs: None)
    # A waiter on its own event loop (as a worker process would run it); its
    # asyncio.Event can never be signalled from this thread.
    outcome: dict = {}

    def wait():
        try:
            outcome["decision"] = asyncio.run(
                approval_service.wait_for_approval(str(run.id), node_id="approve1", timeout=10.0)
            )
        except Exception as exc:  # noqa: BLE001 — surface thread failures to the assert
            outcome["error"] = exc

    thread = threading.Thread(target=wait)
    thread.start()
    try:
        time.sleep(0.2)  # let the waiter start its poll loop
        response = client.post(
            f"/api/runs/{run.id}/approve",
            json={"approval_id": approval_id, "approved": True, "comment": "remote ok"},
        )
        assert response.status_code == 200, response.text
        thread.join(timeout=10.0)
        assert not thread.is_alive(), "waiter did not resolve via the row poll"
    finally:
        if thread.is_alive():
            approval_service.clear_approval_state(str(run.id))
            thread.join(timeout=5.0)
    assert "error" not in outcome, outcome.get("error")
    assert outcome["decision"] == {"approved": True, "comment": "remote ok"}
    approval_service.clear_approval_state(str(run.id))


# ---------------------------------------------------------------------------
# P1-16 — deferred eval fan-out runs concurrently and maps results/errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_parallel_evaluations_runs_concurrently_and_maps_errors(monkeypatch):
    active = 0
    max_active = 0

    async def fake_eval(content, meta, request_context=None):
        nonlocal active, max_active
        if meta.get("boom"):
            raise RuntimeError("eval exploded")
        active += 1
        max_active = max(max_active, active)
        try:
            await asyncio.sleep(0.05)
            return {"aggregate": 4.0, "content": content}
        finally:
            active -= 1

    monkeypatch.setattr(eval_runner, "evaluate_node_async", fake_eval)

    specs = [
        ("n1", {}, "out1"),
        ("n2", {}, "out2"),
        ("n3", {"boom": True}, "out3"),
    ]
    results = await eval_runner.run_parallel_evaluations(specs, request_context="req")

    by_id = {node_id: (scores, err) for node_id, scores, err in results}
    # The two healthy evals ran at the same time — genuine concurrency, not the
    # serial mock the old test asserted nothing about.
    assert max_active >= 2
    assert by_id["n1"][0]["aggregate"] == 4.0
    assert by_id["n2"][0]["content"] == "out2"
    # A failing eval maps to (node_id, None, error) instead of aborting siblings.
    assert by_id["n3"][0] is None
    assert "eval exploded" in by_id["n3"][1]


# ---------------------------------------------------------------------------
# P1-17 — _consume_with_timeout: active-time budget + approval exemption
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_consume_with_timeout_returns_when_work_completes(monkeypatch):
    monkeypatch.setattr(settings, "run_timeout_seconds", 30)

    async def _work():
        return None

    # Completes on the first poll — no timeout.
    await executor_service._consume_with_timeout(uuid4(), _work())


@pytest.mark.asyncio
async def test_consume_with_timeout_times_out_on_active_work(monkeypatch):
    # Sub-poll budget: one 1s active poll (active_elapsed=1.0) exceeds it.
    monkeypatch.setattr(settings, "run_timeout_seconds", 0.5)

    async def _running_status(_run_id):
        return "running"

    monkeypatch.setattr(executor_service, "_read_run_status", _running_status)

    async def _never():
        await asyncio.Event().wait()

    with pytest.raises(asyncio.TimeoutError):
        await executor_service._consume_with_timeout(uuid4(), _never())


@pytest.mark.asyncio
async def test_consume_with_timeout_exempts_awaiting_approval(monkeypatch):
    # Positive budget the awaiting-approval path must never accrue against —
    # the exact inversion this function guards against.
    monkeypatch.setattr(settings, "run_timeout_seconds", 0.5)

    async def _awaiting(_run_id):
        return "awaiting_approval"

    monkeypatch.setattr(executor_service, "_read_run_status", _awaiting)

    async def _never():
        await asyncio.Event().wait()

    task = asyncio.ensure_future(
        executor_service._consume_with_timeout(uuid4(), _never())
    )
    # Span multiple 1s poll intervals; had the budget been charged the function
    # would have raised TimeoutError by now.
    await asyncio.sleep(2.5)
    assert not task.done()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


# ---------------------------------------------------------------------------
# P2-17 — retention purge removes child run_spans (no orphans on SQLite)
# ---------------------------------------------------------------------------


def test_purge_old_runs_removes_child_spans(monkeypatch):
    from app.services.retention import purge_old_runs

    monkeypatch.setattr(settings, "run_retention_days", 30)

    db = SessionLocal()
    try:
        wf = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Retention WF")
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1, graph_json=_linear_graph()
        )
        db.add(version)
        db.flush()
        old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=200)
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status="completed",
            input_text="old",
            created_at=old,
        )
        db.add(run)
        db.flush()
        span = models.RunSpan(
            id=uuid4(), run_id=run.id, kind="node", name="A", status="completed"
        )
        db.add(span)
        db.commit()
        run_id = run.id
        span_id = span.id
    finally:
        db.close()

    deleted = purge_old_runs()
    assert deleted >= 1

    db = SessionLocal()
    try:
        assert (
            db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
            is None
        )
        # The child span must be gone too — not orphaned.
        assert (
            db.query(models.RunSpan).filter(models.RunSpan.id == span_id).first() is None
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# P2-A #23 — tool-approval decisions survive resume; distinct calls re-ask
# ---------------------------------------------------------------------------


def _tool_review(node_id: str, tool: str, args: dict) -> tuple[str, str]:
    import json as _json

    review = _json.dumps(
        {"agent_node_id": node_id, "tool": tool, "arguments": args}, ensure_ascii=False
    )
    return f"{node_id}:tool:{tool}:1", review


def test_tool_approval_resume_reuses_decided_invocation():
    """Restart after an approved pre-crash invocation applies the durable
    verdict without re-asking; a distinct later call parks fresh."""
    run = _seed_run("running")

    # Pre-crash: invocation 1 approved, invocation 2 (distinct args) parked.
    key1, review1 = _tool_review("agent1", "send", {"to": "a"})
    meta1 = asyncio.run(approval_service.park_approval(str(run.id), key1, review1, allow_reuse=True))
    key2, review2 = _tool_review("agent1", "send", {"to": "b"})
    # Per-node seq would place the second call at :2; use its real key.
    key2 = "agent1:tool:send:2"
    meta2 = asyncio.run(approval_service.park_approval(str(run.id), key2, review2, allow_reuse=True))
    with SessionLocal() as db:
        assert approval_service.resolve_approval_record(
            db, str(run.id), key1, "approved", "ok", meta1["approval_id"]
        )
        db.commit()

    # Simulated resume (fresh process: reset counters, same keys+reviews).
    replay1 = asyncio.run(approval_service.park_approval(str(run.id), key1, review1, allow_reuse=True))
    assert replay1.get("prior_decision") == {"approved": True, "comment": "ok"}
    assert replay1["approval_id"] == meta1["approval_id"]

    # Distinct later call: same tool, different args → fresh parked row.
    replay2 = asyncio.run(approval_service.park_approval(str(run.id), key2, review2, allow_reuse=True))
    assert "prior_decision" not in replay2
    assert replay2["approval_id"] == meta2["approval_id"]
    assert replay2["status"] == "parked"

    # Same args, same key, but a *denied* row must surface the denial.
    key3, review3 = _tool_review("agent1", "send", {"to": "c"})
    key3 = "agent1:tool:send:3"
    meta3 = asyncio.run(approval_service.park_approval(str(run.id), key3, review3, allow_reuse=True))
    with SessionLocal() as db:
        assert approval_service.resolve_approval_record(
            db, str(run.id), key3, "denied", "no", meta3["approval_id"]
        )
        db.commit()
    replay3 = asyncio.run(approval_service.park_approval(str(run.id), key3, review3, allow_reuse=True))
    assert replay3.get("prior_decision") == {"approved": False, "comment": "no"}
    with SessionLocal() as db:
        db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run.id).update(
            {"status": "completed"}, synchronize_session=False
        )
        db.commit()

def test_tool_approval_resume_skipped_prefix_node_reuses_key():
    """NodeA's call approved pre-crash; resume skips nodeA (pinned) and replays
    nodeB from per-node seq 1 — nodeB's row is found by its own key."""
    run = _seed_run("running")

    key_a, review_a = _tool_review("agentA", "send", {"to": "a"})
    meta_a = asyncio.run(approval_service.park_approval(str(run.id), key_a, review_a, allow_reuse=True))
    with SessionLocal() as db:
        assert approval_service.resolve_approval_record(
            db, str(run.id), key_a, "approved", "ok", meta_a["approval_id"]
        )
        db.commit()
    key_b, review_b = _tool_review("agentB", "send", {"to": "b"})
    meta_b = asyncio.run(approval_service.park_approval(str(run.id), key_b, review_b, allow_reuse=True))

    # Resume replays only nodeB; its per-node counter restarts at 1, which is
    # exactly its pre-crash key — the parked row is reused, not duplicated.
    replay_b = asyncio.run(approval_service.park_approval(str(run.id), key_b, review_b, allow_reuse=True))
    assert replay_b.get("reused") is True
    assert replay_b["approval_id"] == meta_b["approval_id"]
    with SessionLocal() as db:
        rows = (
            db.query(models.ApprovalRequest)
            .filter(
                models.ApprovalRequest.run_id == run.id,
                models.ApprovalRequest.node_id == key_b,
            )
            .all()
        )
        assert len(rows) == 1
        db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run.id).update(
            {"status": "completed"}, synchronize_session=False
        )
        db.commit()
    approval_service.clear_approval_state(str(run.id))
