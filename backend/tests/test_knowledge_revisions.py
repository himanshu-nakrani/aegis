"""Sealed knowledge revisions hide chunks that are not members."""

from uuid import UUID

from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.knowledge_revisions import deny_document
from tests.conftest import valid_graph

client = TestClient(app)


def _library() -> str:
    response = client.post("/api/knowledge", json={"name": "Notes"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_add_text_seals_a_revision_and_hides_a_later_stray_chunk():
    base_id = _library()
    added = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Manual", "text": "alpha token lives in the sealed revision"},
    )
    assert added.status_code == 201, added.text
    libraries = client.get("/api/knowledge")
    match = next(row for row in libraries.json() if row["id"] == base_id)
    assert match["active_revision_id"]
    assert match["revision_sequence"] == 1

    db = SessionLocal()
    db.add(
        models.KnowledgeDocument(
            knowledge_base_id=UUID(base_id),
            title="Stray",
            text="beta stray token should stay invisible",
        )
    )
    db.commit()
    db.close()

    hidden = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "beta stray token", "method": "keyword"},
    )
    assert hidden.status_code == 200, hidden.text
    assert all("beta stray" not in (hit.get("text") or "") for hit in hidden.json()["results"])
    assert hidden.json()["revision_id"] == match["active_revision_id"]

    visible = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "alpha token", "method": "keyword"},
    )
    assert visible.json()["results"]


def test_delete_moves_the_library_to_a_revision_without_the_source():
    base_id = _library()
    added = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Gone", "text": "gamma token before delete"},
    )
    source_id = added.json()["source_document_id"]
    deleted = client.delete(f"/api/knowledge/{base_id}/documents/{source_id}")
    assert deleted.status_code == 200, deleted.text
    queried = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "gamma token", "method": "keyword"},
    )
    assert queried.status_code == 200, queried.text
    assert queried.json()["results"] == []


def test_denial_rejects_the_whole_library():
    base_id = _library()
    added = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Secret", "text": "delta token in the only member"},
    )
    group_id = added.json()["source_document_id"]
    db = SessionLocal()
    logical = (
        db.query(models.KnowledgeSourceDocument)
        .filter(models.KnowledgeSourceDocument.remote_file_id == group_id)
        .one()
    )
    deny_document(
        db,
        user_id=DEFAULT_DEV_USER_ID,
        source_document_id=logical.id,
        reason="removed",
        knowledge_base_id=UUID(base_id),
    )
    db.commit()
    db.close()
    denied = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "delta token", "method": "keyword"},
    )
    assert denied.status_code == 409
    assert denied.json()["detail"] == "knowledge_access_denied"


def test_workflow_document_seals_the_workflow_revision():
    created = client.post(
        "/api/workflows",
        json={
            "name": "KB",
            "graph_json": valid_graph(
                [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Calc", "nodeType": "tool", "toolType": "calculator"},
                    }
                ]
            ),
        },
    )
    workflow_id = created.json()["id"]
    doc = client.post(
        f"/api/workflows/{workflow_id}/knowledge",
        json={"title": "Local", "text": "workflow local note"},
    )
    assert doc.status_code == 200, doc.text
    db = SessionLocal()
    workflow = db.get(models.Workflow, UUID(workflow_id))
    assert workflow.active_knowledge_revision_id is not None
    db.close()
