"""P3-C slice A: config/boot/worker fixes.

Covers:
- #25: run_execution_mode is Literal-gated so a typo fails Settings
  construction instead of silently skipping both recovery paths.
- L14: database_url defaults to the documented SQLite local-dev path.
- L22: migration_check_strict is fail-closed — a check error under strict
  mode propagates instead of returning False (boot keeps running while
  claiming refusal).
- L20: claim_pending_runs uses a status-guarded UPDATE so a second claimant
  cannot stomp a running run back to queued.
"""

from typing import Literal, get_args, get_origin
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.db import models
from app.db.database import SessionLocal
from app.services import run_worker, startup


def _seed_run(status: str) -> models.WorkflowRun:
    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="P3C Boot Test")
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
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()


def _get_status(run_id) -> str:
    db = SessionLocal()
    try:
        return db.get(models.WorkflowRun, run_id).status
    finally:
        db.close()


# --- #25 / L14: config invariants ------------------------------------------


def test_run_execution_mode_is_literal_gated():
    """Invalid modes must fail Settings construction, not silently no-op."""
    with pytest.raises(ValidationError):
        Settings(run_execution_mode="workers")
    assert Settings(run_execution_mode="worker").run_execution_mode == "worker"
    assert Settings(run_execution_mode="inline").run_execution_mode == "inline"


def test_run_execution_mode_annotation_is_literal():
    annotation = Settings.model_fields["run_execution_mode"].annotation
    assert get_origin(annotation) is Literal
    assert set(get_args(annotation)) == {"inline", "worker"}


def test_database_url_defaults_to_sqlite():
    """Matches .env.example/CLAUDE.md; Postgres stays the env-provided prod path."""
    assert Settings.model_fields["database_url"].default == "sqlite:///./aegis.db"


def test_provider_keys_declared_once():
    """L14: duplicate declarations would collapse to one field, but the source
    must not carry a second (shadowing) declaration block."""
    import inspect
    import re

    source = inspect.getsource(Settings)
    for name in ("openai_api_key", "anthropic_api_key"):
        assert len(re.findall(rf"^\s+{name}:", source, re.M)) == 1


# --- L22: strict migration gate is fail-closed ------------------------------


def test_strict_migration_check_propagates_check_errors(monkeypatch):
    def _boom():
        raise RuntimeError("DB unreachable")

    monkeypatch.setattr(startup, "_alembic_head_revisions", _boom)
    with pytest.raises(RuntimeError, match="DB unreachable"):
        startup.check_migrations_current(strict=True)


def test_nonstrict_migration_check_returns_false_on_error(monkeypatch):
    def _boom():
        raise RuntimeError("DB unreachable")

    monkeypatch.setattr(startup, "_alembic_head_revisions", _boom)
    assert startup.check_migrations_current(strict=False) is False


def test_strict_migration_check_raises_when_behind(monkeypatch):
    monkeypatch.setattr(startup, "_alembic_head_revisions", lambda: {"head"})
    monkeypatch.setattr(startup, "_current_db_revisions", lambda: {"old"})
    with pytest.raises(startup.MigrationsBehindError):
        startup.check_migrations_current(strict=True)


# --- L20: claim_pending_runs status-guarded claim ---------------------------


def test_claim_pending_runs_claims_pending(monkeypatch):
    monkeypatch.setattr(run_worker.settings, "max_concurrent_runs", 1000)
    run = _seed_run("pending")
    try:
        claimed = run_worker.claim_pending_runs()
        assert run.id in claimed
        assert _get_status(run.id) == "running"
    finally:
        db = SessionLocal()
        try:
            db.delete(db.get(models.WorkflowRun, run.id))
            db.commit()
        finally:
            db.close()


def test_claim_pending_runs_never_stomps_running(monkeypatch):
    """Second claimant selecting a now-running row sees rowcount 0 via the
    status guard — the row keeps 'running' instead of being reset to 'queued'."""
    monkeypatch.setattr(run_worker.settings, "max_concurrent_runs", 1000)
    run = _seed_run("pending")
    try:
        claimed = run_worker.claim_pending_runs()
        assert run.id in claimed

        # Simulate the executor picking the run up before another claimant's
        # overlapping SELECT lands.
        db = SessionLocal()
        try:
            db.get(models.WorkflowRun, run.id).status = "running"
            db.commit()
        finally:
            db.close()

        again = run_worker.claim_pending_runs()
        assert run.id not in again
        assert _get_status(run.id) == "running"
    finally:
        db = SessionLocal()
        try:
            db.delete(db.get(models.WorkflowRun, run.id))
            db.commit()
        finally:
            db.close()


def test_claim_pending_runs_is_exclusive(monkeypatch):
    """A second claim of a row already moved to running must not reschedule it.

    The previous CAS set status back to queued, which still matched the
    predicate, so every later poll re-claimed the same row.
    """
    monkeypatch.setattr(run_worker.settings, "max_concurrent_runs", 1000)
    run = _seed_run("pending")
    try:
        first = run_worker.claim_pending_runs()
        second = run_worker.claim_pending_runs()
        assert run.id in first
        assert run.id not in second
        assert _get_status(run.id) == "running"
    finally:
        db = SessionLocal()
        try:
            db.delete(db.get(models.WorkflowRun, run.id))
            db.commit()
        finally:
            db.close()


def test_claim_pending_runs_skips_terminal_and_running(monkeypatch):
    monkeypatch.setattr(run_worker.settings, "max_concurrent_runs", 1000)
    for status in ("running", "completed", "failed", "cancelled"):
        run = _seed_run(status)
        try:
            assert run.id not in run_worker.claim_pending_runs()
            assert _get_status(run.id) == status
        finally:
            db = SessionLocal()
            try:
                db.delete(db.get(models.WorkflowRun, run.id))
                db.commit()
            finally:
                db.close()
