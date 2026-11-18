"""Repair validates evidence and adopts a draft without publishing."""

import pytest
from uuid import UUID

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.run_repair import adopt, validate_repair
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


def test_validation_retrieves_workflow_knowledge_like_a_normal_run():
    token = "stored reference token"
    graph = valid_graph(
        [
            {
                "id": "kb",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "KB",
                    "nodeType": "kb_retrieve",
                    "kbSource": "workflow",
                    "kbMethod": "bm25",
                    "kbQuery": "{{input.text}}",
                },
            }
        ]
    )
    created = client.post("/api/workflows", json={"name": "KB repair", "graph_json": graph})
    assert created.status_code == 200, created.text
    workflow_id = created.json()["id"]
    version_id = created.json()["draft_version"]["id"]
    added = client.post(
        f"/api/workflows/{workflow_id}/knowledge",
        json={"title": "Reference", "text": token},
    )
    assert added.status_code == 200, added.text
    db = SessionLocal()
    run = models.WorkflowRun(
        workflow_version_id=UUID(version_id),
        status="failed",
        input_text=token,
        final_output="missing",
    )
    db.add(run)
    db.commit()
    run_id = str(run.id)
    db.close()
    repair = client.post("/api/run-repairs", json={"source_run_id": run_id})
    assert repair.status_code == 201, repair.text
    repair_id = repair.json()["id"]
    assert client.post(
        f"/api/run-repairs/{repair_id}/context",
        json={"consent": ["input", "output"]},
    ).status_code == 200
    assert client.post(
        f"/api/run-repairs/{repair_id}/proposals",
        json={"graph_json": graph, "origin": "manual"},
    ).status_code == 200
    assert client.post(f"/api/run-repairs/{repair_id}/candidate").status_code == 200
    validation = client.post(
        f"/api/run-repairs/{repair_id}/validations",
        json={"expected_output": token},
    )
    assert validation.status_code == 200, validation.text
    summary = validation.json()["validation"]["summary"]
    assert summary.get("reason") != "execution_deferred"
    assert token in summary["base_output"]
    assert '"results": []' not in summary["base_output"]
    assert token in summary["candidate_output"]


def test_api_validation_is_incomplete_and_unvalidated_adopt_does_not_publish():
    workflow_id, run_id = _failed_run()
    repair_id = _candidate(workflow_id, run_id)
    validation = client.post(
        f"/api/run-repairs/{repair_id}/validations",
        json={"expected_output": "4"},
    )
    assert validation.status_code == 200, validation.text
    body = validation.json()["validation"]
    summary = body["summary"]
    assert body["publishable"] is False
    assert summary.get("reason") != "execution_deferred"
    assert summary.get("base_output")
    assert summary["base_output"] == summary["candidate_output"]
    assert summary["base_output"] != "5"
    if body["status"] == "passed":
        adopted = client.post(
            f"/api/run-repairs/{repair_id}/adopt",
            json={"expected_draft_revision": 1, "adoption_mode": "validated"},
        )
    else:
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


def test_stale_session_cannot_adopt_over_another_adoption():
    workflow_id, run_id = _failed_run()
    version_id = client.get(f"/api/workflows/{workflow_id}").json()["draft_version"]["id"]
    db = SessionLocal()
    other = models.WorkflowRun(
        workflow_version_id=UUID(version_id),
        status="failed",
        input_text="2+2",
        final_output="5",
    )
    db.add(other)
    db.commit()
    other_id = str(other.id)
    db.close()
    repair_a = _candidate(workflow_id, run_id)
    repair_b = _candidate(workflow_id, other_id)
    first_db = SessionLocal()
    second_db = SessionLocal()
    try:
        first = first_db.get(models.RunRepair, UUID(repair_a))
        second = second_db.get(models.RunRepair, UUID(repair_b))
        assert first_db.get(models.Workflow, UUID(workflow_id)).draft_revision == 1
        assert second_db.get(models.Workflow, UUID(workflow_id)).draft_revision == 1
        adopt(first_db, first, expected_revision=1, mode="unvalidated")
        first_db.commit()
        with pytest.raises(Exception) as blocked:
            adopt(second_db, second, expected_revision=1, mode="unvalidated")
        assert getattr(blocked.value, "status_code", None) == 409
        second_db.rollback()
    finally:
        first_db.close()
        second_db.close()
    check = SessionLocal()
    workflow = check.get(models.Workflow, UUID(workflow_id))
    states = [
        row.state
        for row in check.query(models.RunRepair)
        .filter(models.RunRepair.workflow_id == workflow.id)
        .all()
    ]
    assert workflow.draft_revision == 2
    assert states.count("adopted") == 1
    check.close()
