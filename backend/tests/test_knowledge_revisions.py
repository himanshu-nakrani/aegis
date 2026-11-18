"""Sealed knowledge revisions hide chunks that are not members."""

import json
import threading
import traceback
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.knowledge_revisions import deny_document, seal_scope
from app.services.node_handlers import NodeExecutionError, _make_kb_retrieve_fn
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


def test_cached_workflow_retrieval_rechecks_access():
    created = client.post(
        "/api/workflows",
        json={
            "name": "Cached KB",
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
    added = client.post(
        f"/api/workflows/{workflow_id}/knowledge",
        json={"title": "Local", "text": "delta token in the cached note"},
    )
    assert added.status_code == 200, added.text
    context = {
        "_workflow_id": workflow_id,
        "input": {"text": "delta token"},
        "steps": {},
        "last_output": "delta token",
        "memory": {},
    }
    retrieve = _make_kb_retrieve_fn(
        "kb",
        "{{last_output}}",
        [],
        3,
        "kb_retrieve",
        context,
        kb_source="workflow",
        retrieval_method="bm25",
    )
    first = retrieve("delta token")
    assert "delta token" in first
    assert context["_kb_documents"]
    db = SessionLocal()
    logical = (
        db.query(models.KnowledgeSourceDocument)
        .filter(models.KnowledgeSourceDocument.workflow_id == UUID(workflow_id))
        .one()
    )
    deny_document(
        db,
        user_id=DEFAULT_DEV_USER_ID,
        source_document_id=logical.id,
        reason="removed",
        workflow_id=UUID(workflow_id),
    )
    db.commit()
    db.close()
    with pytest.raises(NodeExecutionError, match="knowledge_access_denied"):
        retrieve("delta token")
    assert "_kb_documents" not in context


def test_cached_retrieval_drops_revoked_text_after_the_revision_is_emptied():
    created = client.post(
        "/api/workflows",
        json={
            "name": "Cached revoke",
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
    added = client.post(
        f"/api/workflows/{workflow_id}/knowledge",
        json={"title": "Local", "text": "revoked token in the cached note"},
    )
    assert added.status_code == 200, added.text
    listed = client.get(f"/api/workflows/{workflow_id}/knowledge")
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1
    context = {
        "_workflow_id": workflow_id,
        "input": {"text": "revoked token"},
        "steps": {},
        "last_output": "revoked token",
        "memory": {},
    }
    retrieve = _make_kb_retrieve_fn(
        "kb",
        "{{last_output}}",
        [],
        3,
        "kb_retrieve",
        context,
        kb_source="workflow",
        retrieval_method="bm25",
    )
    warmed = json.loads(retrieve("revoked token"))
    assert warmed["results"]
    assert "in the cached note" in warmed["results"][0]["text"]
    db = SessionLocal()
    logical = (
        db.query(models.KnowledgeSourceDocument)
        .filter(models.KnowledgeSourceDocument.workflow_id == UUID(workflow_id))
        .one()
    )
    deny_document(
        db,
        user_id=DEFAULT_DEV_USER_ID,
        source_document_id=logical.id,
        reason="removed",
        workflow_id=UUID(workflow_id),
    )
    db.commit()
    db.close()
    deleted = client.delete(f"/api/workflows/{workflow_id}/knowledge/{listed.json()[0]['id']}")
    assert deleted.status_code == 200, deleted.text
    again = json.loads(retrieve("revoked token"))
    assert again["results"] == []
    fresh = {
        "_workflow_id": workflow_id,
        "input": {"text": "revoked token"},
        "steps": {},
        "last_output": "revoked token",
        "memory": {},
    }
    fresh_retrieve = _make_kb_retrieve_fn(
        "kb",
        "{{last_output}}",
        [],
        3,
        "kb_retrieve",
        fresh,
        kb_source="workflow",
        retrieval_method="bm25",
    )
    assert json.loads(fresh_retrieve("revoked token"))["results"] == []


def test_pasted_document_listed_id_deletes_it_and_a_second_paste_does_not_duplicate():
    created = client.post(
        "/api/workflows",
        json={
            "name": "Pasted docs",
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
    first = client.post(
        f"/api/workflows/{workflow_id}/knowledge",
        json={"title": "First", "text": "alpha pasted token"},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        f"/api/workflows/{workflow_id}/knowledge",
        json={"title": "Second", "text": "beta pasted token"},
    )
    assert second.status_code == 200, second.text
    listed = client.get(f"/api/workflows/{workflow_id}/knowledge")
    texts = [row["text"] for row in listed.json()]
    assert texts.count("alpha pasted token") == 1
    assert texts.count("beta pasted token") == 1
    alpha = next(row for row in listed.json() if row["text"] == "alpha pasted token")
    deleted = client.delete(f"/api/workflows/{workflow_id}/knowledge/{alpha['id']}")
    assert deleted.status_code == 200, deleted.text
    after_alpha = client.get(f"/api/workflows/{workflow_id}/knowledge").json()
    assert [row["text"] for row in after_alpha] == ["beta pasted token"]
    deleted_last = client.delete(
        f"/api/workflows/{workflow_id}/knowledge/{after_alpha[0]['id']}"
    )
    assert deleted_last.status_code == 200, deleted_last.text
    assert client.get(f"/api/workflows/{workflow_id}/knowledge").json() == []
    db = SessionLocal()
    workflow = db.get(models.Workflow, UUID(workflow_id))
    revision = db.get(models.KnowledgeRevision, workflow.active_knowledge_revision_id)
    assert revision.member_count == 0
    db.close()


def test_delete_seals_the_membership_after_pending_deletes():
    base_id = _library()
    added = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Manual", "text": "alpha token lives in the sealed revision"},
    )
    assert added.status_code == 201, added.text
    source_id = UUID(added.json()["source_document_id"])
    db = SessionLocal()
    base = db.get(models.KnowledgeBase, UUID(base_id))
    original_id = base.active_revision_id
    working = (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.knowledge_base_id == base.id,
            models.KnowledgeDocument.source_document_id == source_id,
            models.KnowledgeDocument.document_version_id.is_(None),
        )
        .all()
    )
    assert working
    for row in working:
        db.delete(row)
    revision = seal_scope(
        db,
        knowledge_base_id=base.id,
        origin="delete",
        omit_source_ids={source_id},
    )
    db.commit()
    assert revision is not None
    assert revision.id != original_id
    assert revision.member_count == 0
    assert revision.chunk_count == 0
    db.close()
    queried = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "alpha token", "method": "keyword"},
    )
    assert queried.status_code == 200, queried.text
    assert queried.json()["results"] == []


def test_historical_versions_keep_their_chunks_after_reseal_and_delete():
    base_id = _library()
    added = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Manual", "text": "alpha token lives in the sealed revision"},
    )
    source_id = UUID(added.json()["source_document_id"])
    db = SessionLocal()
    base = db.get(models.KnowledgeBase, UUID(base_id))
    first = db.get(models.KnowledgeRevision, base.active_revision_id)
    member = (
        db.query(models.KnowledgeRevisionMember)
        .filter(models.KnowledgeRevisionMember.revision_id == first.id)
        .one()
    )
    historical_version_id = member.document_version_id
    working = (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.knowledge_base_id == base.id,
            models.KnowledgeDocument.document_version_id.is_(None),
        )
        .one()
    )
    working.text = "beta token replaces the editable copy"
    later = seal_scope(db, knowledge_base_id=base.id, origin="manual")
    db.commit()
    historical = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.document_version_id == historical_version_id)
        .all()
    )
    assert historical
    assert any("alpha token" in row.text for row in historical)
    assert later.id != first.id
    for row in (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.knowledge_base_id == base.id,
            models.KnowledgeDocument.source_document_id == source_id,
            models.KnowledgeDocument.document_version_id.is_(None),
        )
        .all()
    ):
        db.delete(row)
    emptied = seal_scope(db, knowledge_base_id=base.id, origin="delete", omit_source_ids={source_id})
    db.commit()
    kept = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.document_version_id == historical_version_id)
        .all()
    )
    assert any("alpha token" in row.text for row in kept)
    assert emptied.member_count == 0
    db.close()


def test_seal_retries_a_revision_sequence_collision(monkeypatch):
    from sqlalchemy.exc import IntegrityError

    from app.services import knowledge_revisions

    base_id = _library()
    real = knowledge_revisions._insert_revision
    attempts = {"n": 0}

    def collide(*args, **kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed"))
        return real(*args, **kwargs)

    monkeypatch.setattr(knowledge_revisions, "_insert_revision", collide)
    db = SessionLocal()
    db.add(
        models.KnowledgeDocument(
            knowledge_base_id=UUID(base_id),
            title="Upload",
            text="alpha upload token",
            source_document_id=uuid4(),
        )
    )
    seal_scope(db, knowledge_base_id=UUID(base_id), origin="manual")
    db.commit()
    db.close()
    assert attempts["n"] >= 2
    queried = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "alpha upload token", "method": "keyword"},
    )
    assert queried.status_code == 200, queried.text
    assert any("alpha upload token" in row["text"] for row in queried.json()["results"])


def test_overlapping_uploads_both_remain_searchable():
    base_id = _library()
    errors: list[str] = []

    def _upload(text: str) -> None:
        db = SessionLocal()
        try:
            db.add(
                models.KnowledgeDocument(
                    knowledge_base_id=UUID(base_id),
                    title=text,
                    text=text,
                    source_document_id=uuid4(),
                )
            )
            seal_scope(db, knowledge_base_id=UUID(base_id), origin="manual")
            db.commit()
        except Exception as exc:  # noqa: BLE001 — the test records the collision
            errors.append(f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}")
            db.rollback()
        finally:
            db.close()

    threads = [
        threading.Thread(target=_upload, args=("alpha upload token",)),
        threading.Thread(target=_upload, args=("beta upload token",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    assert [thread.is_alive() for thread in threads] == [False, False]
    assert errors == []
    for text in ("alpha upload token", "beta upload token"):
        queried = client.post(
            f"/api/knowledge/{base_id}/query",
            json={"query": text, "method": "keyword"},
        )
        assert queried.status_code == 200, queried.text
        assert any(text in row["text"] for row in queried.json()["results"])
