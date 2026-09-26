"""GET /api/datasets returns per-dataset item counts from a single grouped query."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app

client = TestClient(app)


def _cleanup(db, workflow_ids, dataset_ids):
    db.query(models.DatasetItem).filter(models.DatasetItem.dataset_id.in_(dataset_ids)).delete(
        synchronize_session=False
    )
    db.query(models.Dataset).filter(models.Dataset.id.in_(dataset_ids)).delete(synchronize_session=False)
    db.query(models.Workflow).filter(models.Workflow.id.in_(workflow_ids)).delete(synchronize_session=False)
    db.commit()


def test_list_datasets_reports_item_counts_and_filters_by_workflow():
    db = SessionLocal()
    wf_a = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="A")
    wf_b = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="B")
    db.add_all([wf_a, wf_b])
    db.flush()
    full = models.Dataset(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, workflow_id=wf_a.id, name="full")
    empty = models.Dataset(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, workflow_id=wf_a.id, name="empty")
    other = models.Dataset(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, workflow_id=wf_b.id, name="other")
    db.add_all([full, empty, other])
    db.flush()
    db.add_all(
        [models.DatasetItem(id=uuid4(), dataset_id=full.id, input_text=f"in {i}") for i in range(3)]
        + [models.DatasetItem(id=uuid4(), dataset_id=other.id, input_text="x")]
    )
    db.commit()
    try:
        resp = client.get("/api/datasets")
        assert resp.status_code == 200
        counts = {d["id"]: d["item_count"] for d in resp.json()}
        assert counts[str(full.id)] == 3
        assert counts[str(empty.id)] == 0
        assert counts[str(other.id)] == 1

        resp = client.get(f"/api/datasets?workflow_id={wf_a.id}")
        ids = {d["id"] for d in resp.json()}
        assert ids == {str(full.id), str(empty.id)}
    finally:
        _cleanup(db, [wf_a.id, wf_b.id], [full.id, empty.id, other.id])
        db.close()
