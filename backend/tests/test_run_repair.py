"""Repair validates evidence and adopts a draft without publishing."""

from uuid import UUID

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.run_repair import validate_repair
from tests.conftest import valid_graph

client = TestClient(app)


def _graph(label: str) -> dict:
    return valid_graph(
        [
            {
                "id": "n1",
                "position": {"x": 0, "y": 0},
                "data": {"label": label, "nodeType": "tool", "toolType": "calculator"},
            }
        ]
    )


def _failed_run() -> tuple[str, str]:
    created = client.post("/api/workflows", json={"name": "Repair", "graph_json": _graph("Live")})
    assert created.status_code == 200, created.text
    workflow_id = created.json()["id"]
    version_id = created.json()["draft_version"]["id"]
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
    return workflow_id, run_id


def _candidate(workflow_id: str, run_id: str) -> str:
    repair = client.post("/api/run-repairs", json={"source_run_id": run_id})
    assert repair.status_code == 201, repair.text
    repair_id = repair.json()["id"]
    assert client.post(
        f"/api/run-repairs/{repair_id}/context",
        json={"consent": ["output"]},
    ).status_code == 422
    assert client.post(
        f"/api/run-repairs/{repair_id}/context",
        json={"consent": ["input", "output"]},
    ).status_code == 200
    assert client.post(
        f"/api/run-repairs/{repair_id}/proposals",
        json={"graph_json": _graph("Fixed"), "origin": "manual"},
    ).status_code == 200
    candidate = client.post(f"/api/run-repairs/{repair_id}/candidate")
    assert candidate.status_code == 200, candidate.text
    assert candidate.json()["candidate_version_id"]
    current = client.get(f"/api/workflows/{workflow_id}")
    assert current.json()["latest_version"]["graph_json"]["nodes"]
    labels = [
        node["data"].get("label")
        for node in current.json()["latest_version"]["graph_json"]["nodes"]
    ]
    assert "Fixed" not in labels
    return repair_id


def test_api_validation_is_incomplete_and_unvalidated_adopt_does_not_publish():
    workflow_id, run_id = _failed_run()
    repair_id = _candidate(workflow_id, run_id)
    validation = client.post(
        f"/api/run-repairs/{repair_id}/validations",
        json={"expected_output": "4"},
    )
    assert validation.status_code == 200, validation.text
    assert validation.json()["validation"]["status"] == "incomplete"
    assert validation.json()["validation"]["publishable"] is False
    blocked = client.post(
        f"/api/run-repairs/{repair_id}/adopt",
        json={"expected_draft_revision": 1, "adoption_mode": "validated"},
    )
    assert blocked.status_code == 409
    current = client.get(f"/api/workflows/{workflow_id}")
    adopted = client.post(
        f"/api/run-repairs/{repair_id}/adopt",
        json={
            "expected_draft_revision": current.json()["draft_revision"],
            "adoption_mode": "unvalidated",
        },
    )
    assert adopted.status_code == 200, adopted.text
    assert adopted.json()["state"] == "adopted"
    assert adopted.json()["publishable"] is False
    db = SessionLocal()
    workflow = db.get(models.Workflow, UUID(workflow_id))
    assert workflow.published_version_id is None
    assert str(workflow.draft_version_id) == adopted.json()["candidate_version_id"]
    db.close()


def test_injected_runner_can_pass_and_validated_adopt_stays_unpublished():
    workflow_id, run_id = _failed_run()
    repair_id = _candidate(workflow_id, run_id)
    db = SessionLocal()
    repair = db.get(models.RunRepair, UUID(repair_id))

    def runner(_version, _text):
        return "4"

    validation = validate_repair(db, repair, expected_output="4", runner=runner)
    assert validation.status == "passed"
    assert validation.summary_json["publishable"] is False
    db.commit()
    db.close()
    current = client.get(f"/api/workflows/{workflow_id}")
    adopted = client.post(
        f"/api/run-repairs/{repair_id}/adopt",
        json={
            "expected_draft_revision": current.json()["draft_revision"],
            "adoption_mode": "validated",
        },
    )
    assert adopted.status_code == 200, adopted.text
    db = SessionLocal()
    workflow = db.get(models.Workflow, UUID(workflow_id))
    assert workflow.published_version_id is None
    db.close()
