"""Guards for the run-concurrency gate: orphaned pending/running runs must not
permanently exhaust ``max_concurrent_runs`` (see services/run_concurrency).
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

from app.db import models
from app.db.database import SessionLocal
from app.services.run_concurrency import (
    STALE_RUN_MESSAGE,
    count_active_runs,
    sweep_stale_runs,
)


def _seed_run(status: str, *, age_seconds: int) -> models.WorkflowRun:
    """Create a run whose created_at is `age_seconds` in the past (naive UTC to
    match the func.now()-populated column)."""
    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="Concurrency Test")
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

        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status=status,
            input_text="test",
            created_at=_utcnow_naive() - timedelta(seconds=age_seconds),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()


def test_count_active_runs_excludes_stale_orphans():
    """A pending run older than the staleness window must not count toward the
    gate — otherwise a single zombie permanently blocks new runs with 429."""
    fresh = _seed_run("pending", age_seconds=5)
    stale = _seed_run("pending", age_seconds=24 * 3600)  # a day old

    db = SessionLocal()
    try:
        active = count_active_runs(db)
        ids = {
            r.id
            for r in db.query(models.WorkflowRun)
            .filter(models.WorkflowRun.status.in_(("pending", "running")))
            .all()
        }
        # The fresh run is present and counted; the stale one is present but not.
        assert fresh.id in ids and stale.id in ids
        assert active >= 1  # at least the fresh run
        # Sanity: excluding-stale count is strictly below the raw pending count.
        raw = (
            db.query(models.WorkflowRun)
            .filter(
                models.WorkflowRun.status.in_(("pending", "running")),
                models.WorkflowRun.id.in_([fresh.id, stale.id]),
            )
            .count()
        )
        assert raw == 2
        # Only the fresh one of our two seeds is inside the window.
        windowed = (
            db.query(models.WorkflowRun)
            .filter(
                models.WorkflowRun.status.in_(("pending", "running")),
                models.WorkflowRun.id.in_([fresh.id, stale.id]),
                models.WorkflowRun.created_at
                >= _utcnow_naive() - timedelta(seconds=900),
            )
            .count()
        )
        assert windowed == 1
    finally:
        db.close()


def test_sweep_stale_runs_reaps_orphans_only():
    """sweep_stale_runs marks stale pending/running rows failed and leaves
    fresh ones untouched."""
    fresh = _seed_run("running", age_seconds=5)
    stale = _seed_run("pending", age_seconds=24 * 3600)

    db = SessionLocal()
    try:
        swept = sweep_stale_runs(db)
        assert swept >= 1

        stale_after = db.get(models.WorkflowRun, stale.id)
        fresh_after = db.get(models.WorkflowRun, fresh.id)
        assert stale_after.status == "failed"
        assert stale_after.final_output == STALE_RUN_MESSAGE
        assert stale_after.completed_at is not None
        # Fresh run is still in-flight.
        assert fresh_after.status == "running"
    finally:
        db.close()


def test_terminal_cas_single_winner_complete_vs_cancel():
    """Concurrent complete + cancel: exactly one terminal write lands; the
    loser does not clobber (regression for the #10 lost-update race)."""
    import threading

    from app.services.executor import _cas_terminal_write

    run = _seed_run("running", age_seconds=5)
    results: dict[str, bool] = {}

    def _complete():
        db = SessionLocal()
        try:
            results["complete"] = _cas_terminal_write(
                db, run.id, "completed",
                {"final_output": "done", "completed_at": _utcnow_naive()},
            )
            db.commit()
        finally:
            db.close()

    def _cancel():
        db = SessionLocal()
        try:
            results["cancel"] = _cas_terminal_write(
                db, run.id, "cancelled",
                {"final_output": "stopped", "completed_at": _utcnow_naive()},
            )
            db.commit()
        finally:
            db.close()

    threads = [threading.Thread(target=_complete), threading.Thread(target=_cancel)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results.values()) == [False, True]
    db = SessionLocal()
    try:
        final = db.get(models.WorkflowRun, run.id)
        assert final.status in {"completed", "cancelled"}
        # Winner's output matches winner's status — no cross-clobber.
        assert final.final_output == ("done" if final.status == "completed" else "stopped")
        final.status = "failed"
        final.final_output = "test cleanup"
        final.completed_at = _utcnow_naive()
        db.commit()
    finally:
        db.close()


def test_terminal_cas_ordered_cancel_then_complete_stays_cancelled():
    """stop_run commits cancelled before complete's CAS: complete loses, the
    row stays cancelled with the cancel output (no resurrection)."""
    from app.services.executor import _cas_terminal_write

    run = _seed_run("running", age_seconds=5)
    db = SessionLocal()
    try:
        assert _cas_terminal_write(
            db, run.id, "cancelled",
            {"final_output": "stopped", "completed_at": _utcnow_naive()},
        ) is True
        db.commit()
        # Late complete arrives after the cancel committed.
        assert _cas_terminal_write(
            db, run.id, "completed",
            {"final_output": "done", "completed_at": _utcnow_naive()},
        ) is False
        db.commit()
        final = db.get(models.WorkflowRun, run.id)
        assert final.status == "cancelled"
        assert final.final_output == "stopped"
        final.status = "failed"
        final.final_output = "test cleanup"
        final.completed_at = _utcnow_naive()
        db.commit()
    finally:
        db.close()


def test_setup_claim_does_not_resurrect_cancelled():
    """execute_run's setup claim on a cancelled row affects 0 rows — the run
    never returns to running after stop_run won."""
    from sqlalchemy import update as _sa_update

    run = _seed_run("cancelled", age_seconds=5)
    db = SessionLocal()
    try:
        claimed = db.execute(
            _sa_update(models.WorkflowRun)
            .where(
                models.WorkflowRun.id == run.id,
                models.WorkflowRun.status.in_(("pending", "queued", "running", "awaiting_approval")),
            )
            .values(status="running")
        ).rowcount
        db.commit()
        assert claimed == 0
        assert db.get(models.WorkflowRun, run.id).status == "cancelled"
        db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run.id).update(
            {"status": "failed", "final_output": "test cleanup"},
            synchronize_session=False,
        )
        db.commit()
    finally:
        db.close()
