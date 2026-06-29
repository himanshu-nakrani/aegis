from fastapi.testclient import TestClient

from app.main import app
from app.services.schedule_info import batch_last_scheduled_run_at
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