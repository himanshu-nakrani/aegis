import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.startup import (
    STALE_JOB_MESSAGE,
    STALE_RUN_MESSAGE,
    recover_stale_jobs,
    recover_stale_runs,
    resume_orphaned_runs,
)


def _seed_run(status: str, metrics: dict | None = None) -> models.WorkflowRun:
    db = SessionLocal()
    try:
        workflow = models.Workflow(
            id=uuid4(),
            user_id=uuid4(),
            name="Stale Run Test",
        )
        db.add(workflow)
        db.flush()

        version = models.WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version_number=1,
            graph_json={"nodes": [], "edges": []},
        )
        db.add(version)
        db.flush()

        old = datetime.now(timezone.utc) - timedelta(seconds=3600)
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status=status,
            input_text="test",
            metrics_json=metrics,
            created_at=old,
            started_at=old if status in ("running", "awaiting_approval") else None,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()


def _get_run(run_id) -> models.WorkflowRun:
    db = SessionLocal()
    try:
        return db.get(models.WorkflowRun, run_id)
    finally:
        db.close()


def _expire_runs(*run_ids) -> None:
    """Mark seeded runs terminal so claimable leftovers cannot consume the
    shared test DB's concurrent-run admission slots."""
    db = SessionLocal()
    try:
        for run_id in run_ids:
            row = db.get(models.WorkflowRun, run_id)
            if row and row.status in ("pending", "queued", "running", "awaiting_approval"):
                row.status = "failed"
                row.final_output = "test cleanup"
                row.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def test_recover_stale_runs_fails_when_resume_disabled(monkeypatch):
    """Pre-durable behavior is preserved behind resume_runs_on_boot=False."""
    monkeypatch.setattr(settings, "resume_runs_on_boot", False)
    pending = _seed_run("pending")
    running = _seed_run("running")

    recover_stale_runs()

    pending_after = _get_run(pending.id)
    running_after = _get_run(running.id)
    assert pending_after.status == "failed"
    assert running_after.status == "failed"
    assert pending_after.final_output == STALE_RUN_MESSAGE
    assert pending_after.completed_at is not None


def test_recover_stale_runs_resumes_running_and_awaiting(monkeypatch):
    """Crash orphans are re-queued for checkpoint resume, not failed."""
    monkeypatch.setattr(settings, "resume_runs_on_boot", True)
    monkeypatch.setattr(settings, "resume_max_attempts", 3)

    running = _seed_run("running")
    awaiting = _seed_run(
        "awaiting_approval",
        metrics={"pending_approval": {"node_id": "appr", "approval_id": str(uuid4())}},
    )
    pending = _seed_run("pending")

    # Parked approval rows are cancelled so the node re-parks a fresh row.
    db = SessionLocal()
    try:
        parked = models.ApprovalRequest(
            run_id=awaiting.id, node_id="appr", status="parked",
            notification_channels=[], notification_errors=[],
            parked_at=datetime.now(timezone.utc),
        )
        db.add(parked)
        db.commit()
        parked_id = parked.id
    finally:
        db.close()

    handled = recover_stale_runs()
    assert handled == 2  # pending left claimable; running + awaiting re-queued

    running_after = _get_run(running.id)
    awaiting_after = _get_run(awaiting.id)
    pending_after = _get_run(pending.id)

    assert running_after.status == "queued"
    assert running_after.completed_at is None
    assert running_after.metrics_json["resume_attempts"] == 1
    assert running_after.metrics_json["resumed_at"]

    assert awaiting_after.status == "queued"
    assert "pending_approval" not in (awaiting_after.metrics_json or {})
    assert pending_after.status == "pending"  # still claimable, untouched

    _expire_runs(running.id, awaiting.id, pending.id)

    db = SessionLocal()
    try:
        row = db.get(models.ApprovalRequest, parked_id)
        assert row.status == "cancelled"
        assert row.resolved_at is not None
    finally:
        db.close()


def test_recover_stale_runs_fails_past_resume_max_attempts(monkeypatch):
    """A run that keeps crashing stops resuming and fails with the stale message."""
    monkeypatch.setattr(settings, "resume_runs_on_boot", True)
    monkeypatch.setattr(settings, "resume_max_attempts", 3)

    run = _seed_run("running", metrics={"resume_attempts": 3})
    recover_stale_runs()

    after = _get_run(run.id)
    assert after.status == "failed"
    assert after.final_output == STALE_RUN_MESSAGE
    assert after.completed_at is not None


def test_recover_stale_runs_worker_mode_guard(monkeypatch):
    """API-process boot in worker mode must not touch in-flight runs."""
    monkeypatch.setattr(settings, "resume_runs_on_boot", True)
    monkeypatch.setattr(settings, "run_execution_mode", "worker")
    running = _seed_run("running")

    assert recover_stale_runs() == 0
    assert _get_run(running.id).status == "running"

    # The worker's own boot uses force=True and re-queues the orphan. The
    # count is scoped to the seeded row: force recovers every non-live
    # orphan, and the shared test DB may hold other tests' leftovers.
    handled_before = recover_stale_runs(force=True)
    assert handled_before >= 1
    assert _get_run(running.id).status == "queued"
    _expire_runs(running.id)


def _seed_job(status: str) -> models.BackgroundJob:
    db = SessionLocal()
    try:
        old = datetime.now(timezone.utc) - timedelta(seconds=3600)
        job = models.BackgroundJob(
            id=uuid4(),
            job_type="knowledge_bulk_import",
            status=status,
            user_id=uuid4(),
            payload_json={"documents": []},
            created_at=old,
            started_at=old if status == "running" else None,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job
    finally:
        db.close()


def test_recover_stale_jobs_marks_running_failed():
    running = _seed_job("running")

    recover_stale_jobs()

    db = SessionLocal()
    try:
        running_after = db.get(models.BackgroundJob, running.id)
        assert running_after is not None
        assert running_after.status == "failed"
        assert running_after.error == STALE_JOB_MESSAGE
        assert running_after.completed_at is not None
    finally:
        db.close()


def test_health_reports_database_status():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["database_ok"] is True
    assert payload["status"] in {"ok", "degraded"}


def test_resume_orphaned_runs_schedules_pending_inline(monkeypatch):
    """Inline-mode boot drain claims pending rows and schedules them."""
    monkeypatch.setattr(settings, "run_execution_mode", "inline")
    run = _seed_run("pending")

    scheduled: list = []
    from app.services import executor as executor_module

    monkeypatch.setattr(executor_module, "schedule_run", scheduled.append)

    claimed = asyncio.run(resume_orphaned_runs())

    assert claimed >= 1
    assert run.id in scheduled
    # claim_pending_runs marks claimed rows queued before scheduling.
    assert _get_run(run.id).status in ("queued", "pending", "running")
    _expire_runs(run.id)


def test_resume_orphaned_runs_noop_in_worker_mode(monkeypatch):
    """Worker mode leaves claiming to the worker poll loop."""
    monkeypatch.setattr(settings, "run_execution_mode", "worker")
    run = _seed_run("pending")

    from app.services import executor as executor_module

    scheduled: list = []
    monkeypatch.setattr(executor_module, "schedule_run", scheduled.append)

    assert asyncio.run(resume_orphaned_runs()) == 0
    assert scheduled == []
    assert _get_run(run.id).status == "pending"
    monkeypatch.setattr(settings, "run_execution_mode", "inline")
    _expire_runs(run.id)


def test_recover_leaves_young_in_flight_rows_alone():
    """A fresh running row may belong to a live owner — recovery skips it."""
    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="Young")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={}
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status="running",
            input_text="test",
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    assert recover_stale_runs() == 0
    assert _get_run(run_id).status == "running"
    _expire_runs(run_id)

def test_quick_restart_recovers_young_orphan_on_force():
    """Worker boot (force=True, single owner) recovers even fresh orphans."""
    from app.services.startup import recover_stale_runs

    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="QuickRestart")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={}
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(), workflow_version_id=version.id, status="running",
            input_text="test", created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    # Non-force boot leaves the young row alone...
    assert recover_stale_runs() == 0
    assert _get_run(run_id).status == "running"
    # ...but the single worker's own boot recovers it immediately.
    # Scoped to the seeded row; the shared DB may hold other orphans.
    assert recover_stale_runs(force=True) >= 1
    assert _get_run(run_id).status == "queued"
    _expire_runs(run_id)


def test_periodic_recovery_picks_up_aged_orphan(monkeypatch):
    """Rows young at boot are recovered by the scheduler tick once stale."""
    import app.services.schedule_worker as sw
    from app.services.startup import recover_stale_runs

    monkeypatch.setattr(settings, "run_execution_mode", "inline")
    monkeypatch.setattr(settings, "run_stale_after_seconds", 60)
    monkeypatch.setattr(sw, "_last_recovery_at", None)

    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="AgedOrphan")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={}
        )
        db.add(version)
        db.flush()
        old = datetime.now(timezone.utc) - timedelta(seconds=3600)
        run = models.WorkflowRun(
            id=uuid4(), workflow_version_id=version.id, status="running",
            input_text="test", created_at=old, started_at=old,
        )
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    sw._maybe_recover_stale_runs()
    assert _get_run(run_id).status == "queued"
    # Second tick within the window is a no-op (rate-limited): the row stays
    # queued and is not re-handled.
    sw._maybe_recover_stale_runs()
    assert _get_run(run_id).status == "queued"
    _expire_runs(run_id)


def test_recovery_skips_live_in_process_tasks(monkeypatch):
    """Aged rows with live asyncio tasks are never re-queued and their parked
    approvals are never cancelled — the tick/duplicate-boot hazard."""
    from app.services import executor as executor_module
    from app.services.startup import recover_stale_runs

    monkeypatch.setattr(settings, "run_stale_after_seconds", 60)
    old = datetime.now(timezone.utc) - timedelta(seconds=3600)

    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="LiveTask")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={}
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(), workflow_version_id=version.id, status="awaiting_approval",
            input_text="test", created_at=old, started_at=old,
        )
        db.add(run)
        db.flush()
        approval = models.ApprovalRequest(
            id=uuid4(), run_id=run.id, node_id="n",
            status="parked", parked_at=old,
        )
        db.add(approval)
        db.commit()
        run_id, approval_id = run.id, approval.id
    finally:
        db.close()

    # White-box live-task registration: active_run_ids() reads this dict's keys.
    sentinel = object()
    executor_module._active_tasks[str(run_id)] = sentinel
    try:
        assert recover_stale_runs(force=True) == 0
    finally:
        executor_module._active_tasks.pop(str(run_id), None)

    db = SessionLocal()
    try:
        assert db.get(models.WorkflowRun, run_id).status == "awaiting_approval"
        assert db.get(models.ApprovalRequest, approval_id).status == "parked"
    finally:
        db.close()
    _expire_runs(run_id)


def test_tick_order_recovers_before_sweep(monkeypatch):
    """Tick order matters: an aged orphan must re-queue, not be failed first."""
    import app.services.schedule_worker as sw
    from app.services.run_concurrency import sweep_stale_runs

    monkeypatch.setattr(settings, "run_execution_mode", "inline")
    monkeypatch.setattr(settings, "run_stale_after_seconds", 60)
    monkeypatch.setattr(sw, "_last_recovery_at", None)
    old = datetime.now(timezone.utc) - timedelta(seconds=3600)

    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="TickOrder")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={}
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(), workflow_version_id=version.id, status="running",
            input_text="test", created_at=old, started_at=old,
        )
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    # Same order as _scheduler_loop: recover, then sweep.
    sw._maybe_recover_stale_runs()
    assert _get_run(run_id).status == "queued"
    db = SessionLocal()
    try:
        assert sweep_stale_runs(db) == 0
        assert _get_run(run_id).status == "queued"
    finally:
        db.close()
    _expire_runs(run_id)
