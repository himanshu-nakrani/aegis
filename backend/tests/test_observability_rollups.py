from datetime import datetime, timezone
from uuid import uuid4

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.services.observability_rollups import aggregate_rollups_for_user


def test_leaderboard_run_count_uses_total_runs_not_eval_count():
    db = SessionLocal()
    workflow_id = uuid4()
    try:
        bucket = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        db.add(
            models.ObservabilityRollup(
                user_id=DEFAULT_DEV_USER_ID,
                workflow_id=workflow_id,
                bucket_hour=bucket,
                run_count=10,
                eval_count=4,
                eval_sum=16.0,
            )
        )
        db.commit()

        result = aggregate_rollups_for_user(db, DEFAULT_DEV_USER_ID)
        entry = next(
            row
            for row in result["workflow_eval_leaderboard"]
            if row["workflow_id"] == str(workflow_id)
        )
        assert entry["run_count"] == 10
        assert entry["avg_eval_score"] == 4.0
    finally:
        db.query(models.ObservabilityRollup).filter(
            models.ObservabilityRollup.workflow_id == workflow_id
        ).delete()
        db.commit()
        db.close()

def test_rollup_resume_counts_logical_run_once():
    """Attempt 1 fails, resume attempt 2 completes: run_count stays 1 and the
    outcome moves from failed to completed (regression for #11)."""
    from app.services.observability_rollups import record_run_rollup

    user_id = uuid4()
    workflow_id = uuid4()
    run_id = uuid4()
    db = SessionLocal()
    try:
        record_run_rollup(
            db, user_id=user_id, workflow_id=workflow_id, status="failed",
            metrics={}, run_id=run_id, attempt=1,
        )
        db.commit()
        record_run_rollup(
            db, user_id=user_id, workflow_id=workflow_id, status="completed",
            metrics={}, run_id=run_id, attempt=2,
        )
        db.commit()
        # Same-attempt refire is also a no-op.
        record_run_rollup(
            db, user_id=user_id, workflow_id=workflow_id, status="completed",
            metrics={}, run_id=run_id, attempt=2,
        )
        db.commit()

        row = db.query(models.ObservabilityRollup).filter(
            models.ObservabilityRollup.user_id == user_id,
            models.ObservabilityRollup.workflow_id == workflow_id,
        ).one()
        assert row.run_count == 1
        assert row.failed_count == 0
        assert row.completed_count == 1
    finally:
        db.query(models.ObservabilityRollup).filter(
            models.ObservabilityRollup.workflow_id == workflow_id
        ).delete(synchronize_session=False)
        db.query(models.RunRollupLedger).filter(
            models.RunRollupLedger.run_id == run_id
        ).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_rollup_concurrent_replacement_counts_once():
    """Two sessions racing the same attempt-1→2 replacement: exactly one
    subtracts and one adds; run_count stays 1 (regression for the ledger
    read-modify-write race)."""
    import threading

    from app.services.observability_rollups import record_run_rollup

    user_id = uuid4()
    workflow_id = uuid4()
    run_id = uuid4()
    db = SessionLocal()
    try:
        record_run_rollup(
            db, user_id=user_id, workflow_id=workflow_id, status="failed",
            metrics={}, run_id=run_id, attempt=1,
        )
        db.commit()
    finally:
        db.close()

    def _replace():
        s = SessionLocal()
        try:
            record_run_rollup(
                s, user_id=user_id, workflow_id=workflow_id, status="completed",
                metrics={}, run_id=run_id, attempt=2,
            )
            s.commit()
        finally:
            s.close()

    threads = [threading.Thread(target=_replace) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    db = SessionLocal()
    try:
        row = db.query(models.ObservabilityRollup).filter(
            models.ObservabilityRollup.user_id == user_id,
            models.ObservabilityRollup.workflow_id == workflow_id,
        ).one()
        assert row.run_count == 1
        assert row.completed_count == 1
        assert row.failed_count == 0
    finally:
        db.query(models.ObservabilityRollup).filter(
            models.ObservabilityRollup.workflow_id == workflow_id
        ).delete(synchronize_session=False)
        db.query(models.RunRollupLedger).filter(
            models.RunRollupLedger.run_id == run_id
        ).delete(synchronize_session=False)
        db.commit()
        db.close()
