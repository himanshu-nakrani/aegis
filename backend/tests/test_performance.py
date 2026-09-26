from datetime import datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services import observability_service as observability_service
from app.services.schedule_info import batch_last_scheduled_run_at, last_scheduled_run_at
from app.services.workflow_context import WorkflowContext

client = TestClient(app)


def test_meta_tracing_endpoint():
    response = client.get("/api/meta/tracing")
    assert response.status_code == 200
    body = response.json()
    assert "enabled" in body
    assert "ui_base_url" in body


def test_observability_split_endpoints():
    for path in ("/api/observability/overview", "/api/observability/quality", "/api/observability/runs"):
        response = client.get(path)
        assert response.status_code == 200


def test_build_summary_fetches_runs_once(monkeypatch):
    run_query_calls = 0
    rollup_calls = 0
    original_runs_query = observability_service._user_runs_query
    original_rollups = observability_service.aggregate_rollups_for_user

    def counting_runs_query(db, user_id, *, limit=observability_service._SUMMARY_RUN_LIMIT):
        nonlocal run_query_calls
        run_query_calls += 1
        return original_runs_query(db, user_id, limit=limit)

    def counting_rollups(db, user_id):
        nonlocal rollup_calls
        rollup_calls += 1
        return original_rollups(db, user_id)

    monkeypatch.setattr(observability_service, "_user_runs_query", counting_runs_query)
    monkeypatch.setattr(observability_service, "aggregate_rollups_for_user", counting_rollups)

    db = SessionLocal()
    try:
        observability_service.build_summary(db, uuid4())
    finally:
        db.close()

    assert run_query_calls == 1
    assert rollup_calls == 1


def test_workflow_context_snapshot_truncates_large_outputs():
    ctx = WorkflowContext.from_input("hello")
    ctx.record_step("n1", "x" * 1000, label="Big", node_type="agent")
    snap = ctx.snapshot(max_output_chars=100)
    assert len(snap["steps"]["n1"]["output"]) < 200


def test_batch_last_scheduled_run_at_empty():
    from app.db.database import SessionLocal

    db = SessionLocal()
    try:
        assert batch_last_scheduled_run_at(db, []) == {}
    finally:
        db.close()


def test_batch_last_scheduled_run_at_limits_each_workflow_to_recent_runs():
    db = SessionLocal()
    try:
        workflows = [
            models.Workflow(id=uuid4(), user_id=uuid4(), name=f"Schedule {index}")
            for index in range(3)
        ]
        db.add_all(workflows)
        db.flush()
        versions = [
            models.WorkflowVersion(
                id=uuid4(),
                workflow_id=workflow.id,
                version_number=number,
                graph_json={"nodes": [], "edges": []},
            )
            for workflow in workflows
            for number in (1, 2)
        ]
        db.add_all(versions)
        db.flush()
        start = datetime(2026, 1, 1)
        for index, workflow in enumerate(workflows):
            workflow_versions = [version for version in versions if version.workflow_id == workflow.id]
            for minute in range(61):
                scheduled = minute in ({10, 12}, {5, 59}, {0})[index]
                db.add(
                    models.WorkflowRun(
                        id=uuid4(),
                        workflow_version_id=workflow_versions[minute // 31].id,
                        input_text='{"scheduled": true, "trigger": "cron"}' if scheduled else "manual",
                        created_at=start + timedelta(minutes=minute),
                    )
                )
        db.flush()

        result = batch_last_scheduled_run_at(db, [workflow.id for workflow in workflows])
        assert result == {
            workflows[0].id: start + timedelta(minutes=12),
            workflows[1].id: start + timedelta(minutes=59),
        }
        for workflow in workflows:
            assert result.get(workflow.id) == last_scheduled_run_at(db, workflow.id)
    finally:
        db.rollback()
        db.close()
