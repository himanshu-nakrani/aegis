"""Tests for durable per-node checkpoints and the resume plan (Phase 2, slice C).

Covers the mark_* upsert semantics (no downgrade of completed/skipped), the
resume plan derivation (frontier = started ∪ safe-ready; conditional children
of completed routers are excluded unless they already started), and the
execute_run resume path end-to-end on non-LLM nodes.
"""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.db import models
from app.db.database import SessionLocal
from app.services.checkpoints import (
    compute_resume,
    load_checkpoints,
    mark_node_completed,
    mark_node_started,
    mark_pinned_skipped,
)
from app.services.graph_defaults import wrap_graph_with_trigger_end


def _transform(node_id: str, template: str = "{{last_output}}") -> dict:
    return {
        "id": node_id,
        "position": {"x": 0, "y": 0},
        "data": {"label": node_id.upper(), "nodeType": "transform", "template": template},
    }


def _seed_run(graph_json: dict | None = None, status: str = "completed") -> models.WorkflowRun:
    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="checkpoint-test")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version_number=1,
            graph_json=graph_json or {"nodes": [], "edges": []},
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status=status,
            input_text="hello",
            started_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()


def _linear_graph() -> dict:
    """trigger -> a -> b -> end."""
    return wrap_graph_with_trigger_end(
        [_transform("a"), _transform("b")],
        [{"id": "e-ab", "source": "a", "target": "b"}],
        entry_id="a",
        exit_id="b",
    )


def _router_graph() -> dict:
    """trigger -> router -[true]-> a -+-> m -> end
                              -[false]-> b -+
    """
    return wrap_graph_with_trigger_end(
        [
            {
                "id": "router",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "R",
                    "nodeType": "router",
                    "routes": ["true", "false"],
                },
            },
            _transform("a"),
            _transform("b"),
            _transform("m"),
        ],
        [
            {"id": "e-ra", "source": "router", "target": "a", "label": "true"},
            {"id": "e-rb", "source": "router", "target": "b", "label": "false"},
            {"id": "e-am", "source": "a", "target": "m"},
            {"id": "e-bm", "source": "b", "target": "m"},
        ],
        entry_id="router",
        exit_id="m",
    )


def _status(db, run_id, node_id) -> str:
    return (
        db.query(models.RunCheckpoint)
        .filter(
            models.RunCheckpoint.run_id == run_id,
            models.RunCheckpoint.node_id == node_id,
        )
        .one()
        .status
    )


# --------------------------------------------------------------------------- #
# mark_* upserts
# --------------------------------------------------------------------------- #


def test_mark_started_inserts_then_does_not_downgrade():
    run = _seed_run()
    db = SessionLocal()
    try:
        mark_node_started(db, run.id, "a")
        db.commit()
        assert _status(db, run.id, "a") == "started"

        mark_node_completed(db, run.id, "a", "out-A")
        db.commit()
        row = (
            db.query(models.RunCheckpoint)
            .filter_by(run_id=run.id, node_id="a")
            .one()
        )
        assert row.status == "completed"
        assert row.output == "out-A"

        # A replayed/late node_started must not downgrade the completed row.
        mark_node_started(db, run.id, "a")
        db.commit()
        assert _status(db, run.id, "a") == "completed"
    finally:
        db.close()


def test_mark_completed_is_upsert_for_reexecuted_node():
    run = _seed_run()
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "a", "first")
        db.commit()
        mark_node_completed(db, run.id, "a", "second")
        db.commit()
        rows = (
            db.query(models.RunCheckpoint)
            .filter_by(run_id=run.id, node_id="a")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].output == "second"
    finally:
        db.close()


def test_mark_pinned_skipped_creates_and_updates():
    run = _seed_run()
    db = SessionLocal()
    try:
        mark_pinned_skipped(db, run.id, "a", "pin-1")
        db.commit()
        assert _status(db, run.id, "a") == "skipped"
        mark_pinned_skipped(db, run.id, "a", "pin-2")
        db.commit()
        row = db.query(models.RunCheckpoint).filter_by(run_id=run.id, node_id="a").one()
        assert row.status == "skipped" and row.output == "pin-2"
    finally:
        db.close()


def test_load_checkpoints_returns_rows():
    run = _seed_run()
    db = SessionLocal()
    try:
        mark_node_started(db, run.id, "a")
        mark_node_completed(db, run.id, "b", "o")
        db.commit()
    finally:
        db.close()
    rows = load_checkpoints(run.id)
    assert {r.node_id: r.status for r in rows} == {"a": "started", "b": "completed"}


# --------------------------------------------------------------------------- #
# compute_resume
# --------------------------------------------------------------------------- #


def test_compute_resume_none_without_checkpoints():
    run = _seed_run(_linear_graph())
    db = SessionLocal()
    try:
        db_run = db.get(models.WorkflowRun, run.id)
        assert compute_resume(db, db_run, _linear_graph()) is None
    finally:
        db.close()


def test_compute_resume_frontier_linear():
    """Crash with a completed 'a' and 'b' mid-flight: resume at b only."""
    graph = _linear_graph()
    run = _seed_run(graph)
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "a", "out-A")
        mark_node_started(db, run.id, "b")
        db.commit()

        db_run = db.get(models.WorkflowRun, run.id)
        plan = compute_resume(db, db_run, graph)

        assert plan["frontier_ids"] == {"b"}
        assert plan["completed_ids"] == {"trigger", "a"}
        assert plan["pinned_outputs"]["a"] == "out-A"
        assert plan["prune_needed"] is True
    finally:
        db.close()


def test_compute_resume_safe_ready_child_of_completed_parent():
    """b never started but every parent completed → it is safe-ready."""
    graph = _linear_graph()
    run = _seed_run(graph)
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "a", "out-A")
        db.commit()

        plan = compute_resume(db, db.get(models.WorkflowRun, run.id), graph)
        assert "b" in plan["frontier_ids"]
    finally:
        db.close()


def test_compute_resume_conditional_child_not_safe_ready():
    """Unstarted children of a completed router never resume implicitly."""
    graph = _router_graph()
    run = _seed_run(graph)
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "router", "true")
        mark_node_started(db, run.id, "a")
        db.commit()

        plan = compute_resume(db, db.get(models.WorkflowRun, run.id), graph)
        assert "a" in plan["frontier_ids"]  # started → at-least-once re-execute
        assert "b" not in plan["frontier_ids"]
        # m's parents are not all completed, so it is not frontier either.
        assert "m" not in plan["frontier_ids"]
    finally:
        db.close()


def test_compute_resume_taken_branch_resumes_untaken_sibling_pruned():
    """Router completed, taken branch 'a' started, crash.

    'a' is in the frontier; 'b' is conditional on an OBSERVED route (a ran) so
    it is provably untaken — pruned, not dangling, never executed.
    """
    graph = _router_graph()
    run = _seed_run(graph)
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "router", "true")
        mark_node_started(db, run.id, "a")
        db.commit()

        plan = compute_resume(db, db.get(models.WorkflowRun, run.id), graph)
        assert "a" in plan["frontier_ids"]
        assert "b" not in plan["frontier_ids"]
        assert "b" not in plan["dangling_ids"], "observed route must not false-fail"
        assert "m" not in plan["dangling_ids"]  # blocked on unstarted 'a', not ambiguous
    finally:
        db.close()


def test_compute_resume_unobserved_route_is_dangling():
    """Router completed but NO branch ever started — route decision lost."""
    graph = _router_graph()
    run = _seed_run(graph)
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "router", "true")
        db.commit()

        plan = compute_resume(db, db.get(models.WorkflowRun, run.id), graph)
        # Neither branch started: the taken child is unknowable.
        assert {"a", "b"} <= plan["dangling_ids"]
        assert "a" not in plan["frontier_ids"]
        assert "b" not in plan["frontier_ids"]
    finally:
        db.close()


def test_compute_resume_pinned_outputs_ordered_by_updated_at():
    run = _seed_run(_linear_graph())
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "b", "o-b")
        db.commit()
        mark_node_completed(db, run.id, "a", "o-a")
        db.commit()
        plan = compute_resume(db, db.get(models.WorkflowRun, run.id), _linear_graph())
        # b completed first, a second → ordering follows updated_at.
        assert list(plan["pinned_outputs"].keys()) == ["b", "a"]
    finally:
        db.close()




@pytest.mark.asyncio
async def test_execute_run_fails_closed_on_unobserved_route(monkeypatch):
    """Crash between router completion and branch start fails, never silently completes."""
    from app.services import executor

    async def _noop_drain():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop_drain)
    graph = _router_graph()
    run = _seed_run(graph, status="queued")
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "router", "true")
        db.commit()
    finally:
        db.close()

    await executor.execute_run(run.id)

    db = SessionLocal()
    try:
        finished = db.get(models.WorkflowRun, run.id)
        assert finished.status == "failed"
        assert "Cannot resume safely" in (finished.final_output or "")
        assert sorted((finished.metrics_json or {}).get("dangling_ids") or []) == ["a", "b"]
        # Nothing downstream ran: no NodeResults for a/b/m.
        ran = {
            r.node_id
            for r in db.query(models.NodeResult).filter_by(run_id=run.id).all()
        }
        assert not ran & {"a", "b", "m"}
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# execute_run resume end-to-end (non-LLM nodes only)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_execute_run_resumes_from_frontier(monkeypatch):
    """A crashed run resumes at b; a is pinned and not re-executed."""
    from app.services import executor

    # Keep the shared test DB's stray pending rows out of this test.
    async def _noop_drain():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop_drain)

    graph = _linear_graph()
    run = _seed_run(graph, status="queued")
    db = SessionLocal()
    try:
        mark_node_completed(db, run.id, "trigger", "hello")
        mark_node_completed(db, run.id, "a", "pinned-A")
        mark_node_started(db, run.id, "b")
        db.commit()
    finally:
        db.close()

    await executor.execute_run(run.id)

    db = SessionLocal()
    try:
        finished = db.get(models.WorkflowRun, run.id)
        assert finished.status == "completed"
        # b consumed the pinned 'a' output via {{steps.a.output}}.
        assert "pinned-A" in (finished.final_output or "")
        metrics = finished.metrics_json or {}
        assert metrics.get("resume_attempts") == 1
        assert metrics.get("resumed_at")
        results = {
            r.node_id: r for r in
            db.query(models.NodeResult).filter_by(run_id=run.id).all()
        }
        # 'a' was pruned from the resume graph: no fresh NodeResult row.
        assert "a" not in results
        assert results["b"].status == "completed"
        checkpoints = {
            r.node_id: r for r in
            db.query(models.RunCheckpoint).filter_by(run_id=run.id).all()
        }
        assert checkpoints["a"].status == "completed"
        assert checkpoints["b"].status == "completed"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_execute_run_no_checkpoints_runs_normally(monkeypatch):
    """A fresh run (no checkpoints) still executes end-to-end."""
    from app.services import executor

    async def _noop_drain():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop_drain)
    run = _seed_run(_linear_graph(), status="pending")
    await executor.execute_run(run.id)

    db = SessionLocal()
    try:
        finished = db.get(models.WorkflowRun, run.id)
        assert finished.status == "completed"
        checkpoints = {
            r.node_id: r.status
            for r in db.query(models.RunCheckpoint).filter_by(run_id=run.id).all()
        }
        # Every executed node left a completed checkpoint behind.
        assert checkpoints.get("a") == "completed"
        assert checkpoints.get("b") == "completed"
        assert (finished.metrics_json or {}).get("resume_attempts") is None
    finally:
        db.close()




@pytest.mark.asyncio
async def test_execute_run_writes_observability_rollup(monkeypatch):
    """A finished run increments its hourly rollup row.

    The executor's finally block wraps the rollup call in a broad
    ``except Exception: log`` — a broken import or signature fails silently
    while the run still reports completed. This test proves the row is
    actually written, not merely that execute_run returns.
    """
    from app.services import executor

    async def _noop_drain():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop_drain)
    run = _seed_run(_linear_graph(), status="pending")
    db = SessionLocal()
    try:
        workflow_id = db.get(models.WorkflowVersion, run.workflow_version_id).workflow_id
        db.query(models.ObservabilityRollup).filter_by(workflow_id=workflow_id).delete()
        db.commit()
    finally:
        db.close()

    await executor.execute_run(run.id)

    db = SessionLocal()
    try:
        finished = db.get(models.WorkflowRun, run.id)
        assert finished.status == "completed"
        row = (
            db.query(models.ObservabilityRollup)
            .filter_by(workflow_id=workflow_id)
            .one()
        )
        assert row.run_count == 1
        assert row.completed_count == 1
        assert row.failed_count == 0
    finally:
        db.close()
