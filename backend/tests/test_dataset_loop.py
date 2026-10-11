"""Dataset-loop API regressions: atomic CSV and exact, tenant-safe run reuse."""
import csv
import io
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app

client = TestClient(app)


@pytest.fixture
def seeded():
    db = SessionLocal()
    workflows = []
    runs = []
    datasets = []
    for user_id in [DEFAULT_DEV_USER_ID, DEFAULT_DEV_USER_ID, uuid4()]:
        workflow = models.Workflow(id=uuid4(), user_id=user_id, name=f"Loop {uuid4()}")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={"nodes": [], "edges": []})
        db.add(version)
        db.flush()
        dataset = models.Dataset(id=uuid4(), workflow_id=workflow.id, user_id=user_id, name="Golden")
        db.add(dataset)
        db.flush()
        group = []
        for index, (status, output) in enumerate([("completed", "good answer"), ("failed", "Timeout 101"), ("failed", "Timeout 202"), ("failed", "Permission denied")]):
            run = models.WorkflowRun(id=uuid4(), workflow_version_id=version.id, input_text=f"case {index}", status=status, final_output=output)
            db.add(run)
            group.append(run)
        workflows.append(workflow)
        datasets.append(dataset)
        runs.append(group)
    db.commit()
    try:
        yield db, workflows, datasets, runs
    finally:
        workflow_ids = [workflow.id for workflow in workflows]
        dataset_ids = db.query(models.Dataset.id).filter(models.Dataset.workflow_id.in_(workflow_ids))
        run_ids = [run.id for group in runs for run in group]
        db.query(models.DatasetItem).filter(models.DatasetItem.dataset_id.in_(dataset_ids)).delete(synchronize_session=False)
        db.query(models.Dataset).filter(models.Dataset.workflow_id.in_(workflow_ids)).delete(synchronize_session=False)
        db.query(models.Feedback).filter(models.Feedback.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(models.WorkflowRun).filter(models.WorkflowRun.id.in_(run_ids)).delete(synchronize_session=False)
        db.query(models.WorkflowVersion).filter(models.WorkflowVersion.workflow_id.in_(workflow_ids)).delete(synchronize_session=False)
        db.query(models.Workflow).filter(models.Workflow.id.in_(workflow_ids)).delete(synchronize_session=False)
        db.commit()
        db.close()


def _items(dataset):
    response = client.get(f"/api/datasets/{dataset.id}")
    assert response.status_code == 200
    return response.json()["items"]


def _csv(rows):
    text = io.StringIO()
    writer = csv.writer(text)
    writer.writerow(["input", "expected_output", "metadata"])
    writer.writerows(rows)
    return text.getvalue()


def test_csv_preserves_quoted_multiline_labels_and_metadata(seeded):
    _, _, datasets, _ = seeded
    response = client.post(f"/api/datasets/{datasets[0].id}/import-csv", json={"csv_text": _csv([["hello,\nworld", "correct, answer", '{"group":"edge"}'], ["unlabelled", "", ""]])})
    assert response.status_code == 200
    assert response.json() == {"imported": 2}
    rows = {row["input_text"]: row for row in _items(datasets[0])}
    assert rows["hello,\nworld"]["expected_output"] == "correct, answer"
    assert rows["hello,\nworld"]["tags"] == {"group": "edge", "import_source": "csv", "import_row": 3}
    assert rows["unlabelled"]["expected_output"] is None


@pytest.mark.parametrize("bad", ["blank", "metadata", "null_metadata", "columns", "empty_record", "quote", "header"])
def test_csv_bad_rows_are_reported_without_partial_import(seeded, bad):
    _, _, datasets, _ = seeded
    text = {
        "blank": _csv([["valid", "gold", ""], [" ", "", ""]]),
        "metadata": _csv([["valid", "gold", ""], ["invalid", "", "[]"]]),
        "null_metadata": _csv([["valid", "gold", ""], ["invalid", "", "null"]]),
        "empty_record": "input,expected_output,metadata\nvalid,gold,\n\n",
        "columns": "input,expected_output,metadata\nvalid,gold,\nwrong,,{},extra\n",
        "quote": 'input,expected_output,metadata\nvalid,gold,\n"unterminated',
        "header": "prompt,expected_output\nvalid,gold\n",
    }[bad]
    response = client.post(f"/api/datasets/{datasets[0].id}/import-csv", json={"csv_text": text})
    assert response.status_code == 422
    assert all(error["row"] >= 1 and error["message"] for error in response.json()["detail"]["errors"])
    assert _items(datasets[0]) == []


def test_csv_row_and_request_bounds(seeded):
    _, _, datasets, _ = seeded
    path = f"/api/datasets/{datasets[0].id}/import-csv"
    response = client.post(path, json={"csv_text": _csv([[f"case {i}", "", ""] for i in range(501)])})
    assert response.status_code == 422
    assert "500" in response.json()["detail"]["errors"][0]["message"]
    assert _items(datasets[0]) == []
    assert client.post(path, json={"csv_text": "input\n" + "x" * 2_000_000}).status_code == 422
    assert client.post(path, json={"csv_text": _csv([[f"case {i}", "", ""] for i in range(500)])}).json() == {"imported": 500}


def test_add_run_dedupes_across_capture_and_rejects_other_workflows(seeded):
    _, workflows, datasets, runs = seeded
    dataset, run = datasets[0], runs[0][0]
    assert client.get(f"/api/runs/{run.id}").json()["workflow_id"] == str(workflows[0].id)
    first = client.post(f"/api/datasets/{dataset.id}/add-run/{run.id}")
    assert first.status_code == 201
    repeat = client.post(f"/api/datasets/{dataset.id}/add-run/{run.id}").json()
    assert repeat == {"id": first.json()["id"], "added": 0, "skipped": 1}
    capture = client.post(f"/api/datasets/{dataset.id}/capture", json={"filter": "recent"}).json()
    assert capture["added"] == 3 and capture["skipped"] == 1
    copied = {row["tags"]["source_run"]: row for row in _items(dataset)}
    assert copied[str(run.id)]["expected_output"] == "good answer"
    assert copied[str(runs[0][1].id)]["expected_output"] is None
    assert copied[str(runs[0][1].id)]["tags"]["observed_output"] == "Timeout 101"
    assert client.post(f"/api/datasets/{dataset.id}/add-run/{runs[1][0].id}").status_code == 400
    assert client.post(f"/api/datasets/{dataset.id}/add-run/{runs[2][0].id}").status_code == 404


def test_imported_metadata_cannot_break_run_capture(seeded):
    _, _, datasets, runs = seeded
    dataset, run = datasets[0], runs[0][0]
    assert client.post(f"/api/datasets/{dataset.id}/import-csv", json={"csv_text": _csv([["manual example", "", '{"source_run":[] }']])}).status_code == 200
    response = client.post(f"/api/datasets/{dataset.id}/add-run/{run.id}")
    assert response.status_code == 201
    assert next(row for row in _items(dataset) if row["id"] == response.json()["id"])["input_text"] == run.input_text


def test_cluster_capture_exact_members_and_scope(seeded):
    _, workflows, datasets, runs = seeded
    dataset = datasets[0]
    clusters = client.get("/api/observability/errors?limit=1000").json()["clusters"]
    cluster = next(cluster for cluster in clusters if cluster["signature"] == "Timeout <n>")
    selected = [member["run_id"] for member in cluster["members"] if member["workflow_id"] == str(workflows[0].id)]
    assert set(selected) == {str(runs[0][1].id), str(runs[0][2].id)}
    path = f"/api/datasets/{dataset.id}/capture"
    payload = {"filter": "cluster", "cluster_signature": cluster["signature"], "run_ids": selected, "limit": 2}
    for wrong, status in [(runs[0][3], 400), (runs[1][1], 400), (runs[2][1], 404)]:
        response = client.post(path, json={**payload, "run_ids": [selected[0], str(wrong.id)]})
        assert response.status_code == status
        assert _items(dataset) == []
    assert client.post(path, json={**payload, "limit": 1}).status_code == 400
    assert client.post(path, json=payload).json()["added"] == 2
    assert client.post(path, json=payload).json()["skipped"] == 2
    assert {row["tags"]["source_run"] for row in _items(dataset)} == set(selected)
    assert all(row["expected_output"] is None for row in _items(dataset))


def test_negative_feedback_targets_default_or_selected_dataset_and_positive_does_not_copy(seeded):
    _, workflows, datasets, runs = seeded
    good, bad = runs[0][0], runs[0][1]
    positive = client.post("/api/feedback", json={"run_id": str(good.id), "rating": 1})
    assert positive.status_code == 201 and positive.json()["dataset"] is None
    negative = client.post("/api/feedback", json={"run_id": str(good.id), "rating": -1}).json()["dataset"]
    assert negative["dataset_name"] == "Negative feedback" and negative["added"] == 1
    detail = client.get(f"/api/datasets/{negative['dataset_id']}").json()
    assert detail["workflow_id"] == str(workflows[0].id)
    assert detail["items"][0]["expected_output"] is None
    assert detail["items"][0]["tags"]["source_run"] == str(good.id)
    repeat = client.post("/api/feedback", json={"run_id": str(good.id), "rating": -1}).json()["dataset"]
    assert repeat["dataset_id"] == negative["dataset_id"] and repeat["skipped"] == 1
    targeted = client.post("/api/feedback", json={"run_id": str(bad.id), "rating": -1, "dataset_id": str(datasets[0].id)}).json()["dataset"]
    assert targeted["dataset_id"] == str(datasets[0].id)
    assert _items(datasets[0])[0]["tags"]["capture"] == "negative_feedback"
    assert client.post(f"/api/datasets/{datasets[0].id}/add-run/{bad.id}").json()["skipped"] == 1
    labelled = client.post(f"/api/datasets/{datasets[0].id}/add-run/{good.id}").json()
    repeat_target = client.post("/api/feedback", json={"run_id": str(good.id), "rating": -1, "dataset_id": str(datasets[0].id)}).json()["dataset"]
    assert repeat_target["item_id"] == labelled["id"] and repeat_target["skipped"] == 1
    assert next(row for row in _items(datasets[0]) if row["id"] == labelled["id"])["expected_output"] == "good answer"
    for target, status in [(datasets[1], 400), (datasets[2], 404)]:
        assert client.post("/api/feedback", json={"run_id": str(good.id), "rating": -1, "dataset_id": str(target.id)}).status_code == status
    assert client.post("/api/feedback", json={"run_id": str(runs[2][0].id), "rating": -1}).status_code == 404
