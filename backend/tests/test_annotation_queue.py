"""Annotation queue: enqueue paths, dedup, label→dataset seam, and filters.

Seeds real runs and exercises the endpoints through the API — the queue is the
contract between feedback/capture and golden datasets, so the assertions land
on annotation_tasks rows and dataset_items tags, not internals.
"""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app

client = TestClient(app)


def _seed(status="completed", eval_aggregate=None, count=1):
    """Create a workflow + version + runs; return (workflow_id, [run_ids])."""
    db = SessionLocal()
    try:
        wf = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Annotate WF")
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1,
            graph_json={"nodes": [], "edges": []},
        )
        db.add(version)
        db.flush()
        run_ids = []
        for i in range(count):
            run = models.WorkflowRun(
                id=uuid4(),
                workflow_version_id=version.id,
                status=status,
                input_text=f"input {uuid4()}",
                final_output="observed output" if status == "completed" else "boom",
                metrics_json={"eval_aggregate": eval_aggregate} if eval_aggregate is not None else {},
            )
            db.add(run)
            run_ids.append(run.id)
        db.commit()
        return wf.id, run_ids
    finally:
        db.close()


def test_manual_enqueue_and_pending_filter():
    wf_id, (run_id,) = _seed()
    resp = client.post("/api/annotation/enqueue", json={"run_id": str(run_id)})
    assert resp.status_code == 201
    body = resp.json()
    assert body["created"] is True
    assert body["task"]["status"] == "pending"
    assert body["task"]["created_by"] == "manual"
    assert body["task"]["run"]["input_text"].startswith("input ")

    # Dedup on run_id — second enqueue returns the same task.
    again = client.post("/api/annotation/enqueue", json={"run_id": str(run_id)})
    assert again.json()["created"] is False
    assert again.json()["task"]["id"] == body["task"]["id"]

    queue = client.get("/api/annotation/queue", params={"status": "pending", "workflow_id": str(wf_id)})
    assert queue.status_code == 200
    assert queue.json()["total"] == 1
    assert queue.json()["items"][0]["id"] == body["task"]["id"]


def test_thumbs_down_auto_enqueues():
    _, (run_id,) = _seed()
    resp = client.post("/api/feedback", json={"run_id": str(run_id), "rating": -1})
    assert resp.status_code == 201
    annotation = resp.json()["annotation"]
    assert annotation is not None

    queue = client.get("/api/annotation/queue", params={"status": "pending"})
    items = queue.json()["items"]
    match = [i for i in items if i["id"] == annotation["task_id"]]
    assert match and match[0]["created_by"] == "negative_feedback"


def test_label_lands_dataset_row():
    wf_id, (run_id,) = _seed()
    task_id = client.post("/api/annotation/enqueue", json={"run_id": str(run_id)}).json()["task"]["id"]

    resp = client.post(
        f"/api/annotation/{task_id}/label",
        json={"expected_output": "the gold answer", "rating": 5, "category": "correct", "notes": "verified"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task"]["status"] == "labeled"
    assert body["task"]["expected_output"] == "the gold answer"
    dataset = body["dataset"]
    assert dataset is not None

    detail = client.get(f"/api/datasets/{dataset['dataset_id']}").json()
    rows = [i for i in detail["items"] if i["id"] == dataset["item_id"]]
    assert rows
    assert rows[0]["expected_output"] == "the gold answer"
    assert rows[0]["input_text"].startswith("input ")
    assert rows[0]["tags"]["source_run"] == str(run_id)
    assert rows[0]["tags"]["capture"] == "annotation"

    # Labeling again is a conflict — the task is closed.
    conflict = client.post(f"/api/annotation/{task_id}/label", json={"expected_output": "x"})
    assert conflict.status_code == 409


def test_label_updates_existing_dataset_row():
    """A run already captured via thumbs-down keeps its row; the human label
    becomes expected_output rather than duplicating the source_run."""
    _, (run_id,) = _seed()
    client.post("/api/feedback", json={"run_id": str(run_id), "rating": -1})
    items = client.get("/api/annotation/queue").json()["items"]
    task_id = next(i["id"] for i in items if i["run_id"] == str(run_id))

    resp = client.post(f"/api/annotation/{task_id}/label", json={"expected_output": "fixed output"})
    assert resp.status_code == 200
    dataset_id = resp.json()["dataset"]["dataset_id"]

    detail = client.get(f"/api/datasets/{dataset_id}").json()
    source_rows = [i for i in detail["items"] if (i["tags"] or {}).get("source_run") == str(run_id)]
    assert len(source_rows) == 1
    assert source_rows[0]["expected_output"] == "fixed output"


def test_skip_and_bulk_failed_capture():
    wf_id, run_ids = _seed(status="failed", count=3)
    resp = client.post(
        "/api/annotation/enqueue",
        json={"workflow_id": str(wf_id), "filter": "failed", "limit": 2},
    )
    assert resp.status_code == 201
    assert resp.json()["enqueued"] == 2

    # Re-capture dedups instead of duplicating.
    again = client.post(
        "/api/annotation/enqueue",
        json={"workflow_id": str(wf_id), "filter": "failed", "limit": 10},
    )
    assert again.json()["enqueued"] == 1
    assert again.json()["already_queued"] == 2

    task_id = client.get(
        "/api/annotation/queue", params={"workflow_id": str(wf_id), "status": "pending"}
    ).json()["items"][0]["id"]
    skip = client.post(f"/api/annotation/{task_id}/skip")
    assert skip.status_code == 200
    assert skip.json()["task"]["status"] == "skipped"

    pending = client.get(
        "/api/annotation/queue", params={"workflow_id": str(wf_id), "status": "pending"}
    ).json()
    assert pending["total"] == 2


def test_low_eval_capture_respects_threshold():
    wf_id, _ = _seed(eval_aggregate=2.0, count=1)
    _seed(eval_aggregate=4.5, count=1)  # different workflow — not in scope anyway

    # Same workflow, above-threshold run should not be captured.
    db = SessionLocal()
    try:
        version = db.query(models.WorkflowVersion).filter_by(workflow_id=wf_id).first()
        good = models.WorkflowRun(
            id=uuid4(), workflow_version_id=version.id, status="completed",
            input_text="good input", final_output="fine",
            metrics_json={"eval_aggregate": 4.9},
        )
        db.add(good)
        db.commit()
    finally:
        db.close()

    resp = client.post(
        "/api/annotation/enqueue",
        json={"workflow_id": str(wf_id), "filter": "low_eval", "max_eval": 3.0},
    )
    assert resp.status_code == 201
    assert resp.json()["enqueued"] == 1


def test_queue_requires_valid_status_filter():
    _, (run_id,) = _seed()
    client.post("/api/annotation/enqueue", json={"run_id": str(run_id)})
    resp = client.get("/api/annotation/queue", params={"status": "bogus"})
    assert resp.status_code == 400


def test_enqueue_insert_race_recovers_winner_row():
    """Two sessions racing the same (user_id, run_id) enqueue: the loser must
    get the winner's row — not a second IntegrityError from autoflushing the
    still-pending failed insert on the recovery SELECT, nor a poisoned commit."""
    from app.services import annotation

    _, (run_id,) = _seed()
    loser = SessionLocal()
    try:
        run = loser.get(models.WorkflowRun, run_id)
        assert run is not None

        # Interleave: the loser's dedupe SELECT sees nothing, then a winner on
        # an independent session+connection commits before the loser's INSERT.
        # All ORM statements route through Session.execute, so the first
        # post-hook execute completing is the dedupe SELECT — fire then.
        winner_id: dict[str, object] = {}
        fired = {"done": False}
        original_execute = loser.execute

        def racy_execute(*args, **kwargs):
            result = original_execute(*args, **kwargs)
            if not fired["done"]:
                fired["done"] = True
                winner = SessionLocal()
                try:
                    winner_run = winner.get(models.WorkflowRun, run_id)
                    task, _ = annotation.enqueue_run(
                        winner, winner_run, DEFAULT_DEV_USER_ID, source="thumbs_down"
                    )
                    winner.commit()
                    winner_id["id"] = task.id
                finally:
                    winner.close()
            return result

        loser.execute = racy_execute  # type: ignore[method-assign]

        task, created = annotation.enqueue_run(
            loser, run, DEFAULT_DEV_USER_ID, source="thumbs_down"
        )
        assert fired["done"], "winner never interleaved — dedupe path is not Session.execute"
        assert created is False
        assert task.id == winner_id["id"]
        # The losing session must be clean: its own commit cannot retry the
        # failed insert (the pre-fix PendingRollback/autoflush trap).
        loser.commit()
    finally:
        loser.close()
