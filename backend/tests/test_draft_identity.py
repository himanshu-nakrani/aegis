"""Draft identity: append-only authoring versions and compare-and-swap."""

from uuid import UUID

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from tests.conftest import valid_graph

client = TestClient(app)


def _graph(label: str = "Calc") -> dict:
    return valid_graph(
        [
            {
                "id": "n1",
                "position": {"x": 0, "y": 0},
                "data": {"label": label, "nodeType": "tool", "toolType": "calculator"},
            }
        ]
    )


def _create(label: str = "Calc") -> dict:
    response = client.post("/api/workflows", json={"name": "Draft", "graph_json": _graph(label)})
    assert response.status_code == 200, response.text
    return response.json()


def test_unchanged_save_keeps_the_draft_row():
    created = _create()
    version_id = created["draft_version"]["id"]
    saved = client.post(
        f"/api/workflows/{created['id']}/versions",
        json={"graph_json": _graph(), "expected_draft_revision": created["draft_revision"]},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["id"] == version_id
    assert saved.json()["draft_revision"] == created["draft_revision"]


def test_changed_save_appends_and_keeps_the_old_graph():
    created = _create("First")
    first_id = created["draft_version"]["id"]
    saved = client.post(
        f"/api/workflows/{created['id']}/versions",
        json={"graph_json": _graph("Second"), "expected_draft_revision": created["draft_revision"]},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["id"] != first_id
    old = client.get(f"/api/workflows/{created['id']}/versions/{first_id}")
    assert old.status_code == 200
    labels = [
        node["data"]["label"]
        for node in old.json()["graph_json"]["nodes"]
        if node["data"].get("label") == "First"
    ]
    assert labels == ["First"]
    current = client.get(f"/api/workflows/{created['id']}")
    assert current.json()["latest_version"]["id"] == saved.json()["id"]
    assert current.json()["draft_revision"] == created["draft_revision"] + 1


def test_stale_draft_revision_conflicts_without_a_new_row():
    created = _create()
    conflict = client.post(
        f"/api/workflows/{created['id']}/versions",
        json={"graph_json": _graph("Other"), "expected_draft_revision": 0},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "DRAFT_CHANGED"
    listed = client.get(f"/api/workflows/{created['id']}/versions")
    assert len(listed.json()) == 1


def test_omitted_revision_still_saves():
    created = _create()
    saved = client.post(
        f"/api/workflows/{created['id']}/versions",
        json={"graph_json": _graph("Later")},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["id"] != created["draft_version"]["id"]


def test_dataset_revision_bumps_when_an_item_is_added():
    created = _create()
    dataset = client.post("/api/datasets", json={"workflow_id": created["id"], "name": "Gold"})
    assert dataset.status_code == 201, dataset.text
    dataset_id = dataset.json()["id"]
    assert dataset.json()["revision"] == 0
    added = client.post(
        f"/api/datasets/{dataset_id}/items",
        json={"input_text": "2+2", "expected_output": "4"},
    )
    assert added.status_code == 201
    detail = client.get(f"/api/datasets/{dataset_id}")
    assert detail.json()["revision"] == 1


def test_repair_candidate_does_not_become_the_draft():
    created = _create("Live")
    version_id = created["draft_version"]["id"]
    db = SessionLocal()
    run = models.WorkflowRun(
        workflow_version_id=UUID(version_id),
        status="failed",
        input_text="2+2",
        final_output="5",
    )
    db.add(run)
    db.commit()
    run_id = str(run.id)
    db.close()

    repair = client.post("/api/run-repairs", json={"source_run_id": run_id})
    assert repair.status_code == 201, repair.text
    repair_id = repair.json()["id"]
    context = client.post(
        f"/api/run-repairs/{repair_id}/context",
        json={"consent": ["input", "output"]},
    )
    assert context.status_code == 200, context.text
    proposal = client.post(
        f"/api/run-repairs/{repair_id}/proposals",
        json={"graph_json": _graph("Candidate"), "origin": "manual"},
    )
    assert proposal.status_code == 200, proposal.text
    candidate = client.post(f"/api/run-repairs/{repair_id}/candidate")
    assert candidate.status_code == 200, candidate.text
    assert candidate.json()["publishable"] is False
    current = client.get(f"/api/workflows/{created['id']}")
    assert current.json()["latest_version"]["id"] == version_id
    db = SessionLocal()
    workflow = db.get(models.Workflow, UUID(created["id"]))
    assert workflow.published_version_id is None
    assert str(workflow.draft_version_id) == version_id
    db.close()
