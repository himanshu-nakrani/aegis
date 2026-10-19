"""P3-C workflow-slice fixes: upload cap enforcement, workflow-delete vector
cleanup, and endpoint-side write bounds."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.embeddings import _hashing_vector

from conftest import valid_graph

client = TestClient(app)


def _vec_supported() -> bool:
    """sqlite-vec needs a Python whose sqlite3 exposes loadable extensions —
    absent on some Linux/CI builds. Skip rather than error there."""
    import sqlite3

    if not hasattr(sqlite3.Connection, "enable_load_extension"):
        return False
    try:
        import sqlite_vec

        conn = sqlite3.connect(":memory:")
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.close()
        return True
    except Exception:
        return False


vec_required = pytest.mark.skipif(
    not _vec_supported(),
    reason="sqlite3 loadable extensions unavailable on this Python build",
)


def _create_workflow(name: str = "p3c") -> str:
    response = client.post(
        "/api/workflows",
        json={
            "name": name,
            "graph_json": valid_graph(
                [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Calc", "nodeType": "tool", "toolType": "calculator"},
                    }
                ],
            ),
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


# ---------------------------------------------------------------------------
# M6: upload cap is enforced before/without trusting Content-Length
# ---------------------------------------------------------------------------


def test_upload_happy_path_small_file():
    workflow_id = _create_workflow("upload-ok")
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/upload",
        files={"file": ("notes.md", b"alpha beta gamma " * 20, "text/markdown")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["chunks_created"] >= 1


def test_upload_requires_file_field():
    workflow_id = _create_workflow("upload-nofile")
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/upload",
        data={"title": "no file attached"},
    )
    assert response.status_code == 422


def test_upload_bounded_read_enforces_cap(monkeypatch):
    """A lying/absent Content-Length must not bypass the cap: the endpoint
    accumulates bounded reads and rejects the moment the total exceeds it."""
    import app.api.workflows as workflows_api

    monkeypatch.setattr(workflows_api, "MAX_UPLOAD_BYTES", 100)
    workflow_id = _create_workflow("upload-bounded")
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/upload",
        files={"file": ("big.txt", b"x" * 250, "text/plain")},
    )
    assert response.status_code == 413


def test_upload_real_cap_rejects_oversized():
    workflow_id = _create_workflow("upload-8mb")
    big = b"a" * (8 * 1024 * 1024 + 1)
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/upload",
        files={"file": ("big.txt", big, "text/plain")},
    )
    assert response.status_code == 413


def test_upload_title_and_filename_bounded():
    """title → String(255), source_name → String(512): the multipart fields
    bypass pydantic, so the endpoint must keep writes inside the columns."""
    workflow_id = _create_workflow("upload-bounds")
    long_name = "n" * 600 + ".md"
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/upload",
        files={"file": (long_name, b"alpha beta gamma " * 200, "text/markdown")},
        data={"title": "t" * 500},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["filename"]) <= 512
    assert payload["chunks_created"] > 1  # multi-chunk appends #N titles
    for doc in client.get(f"/api/workflows/{workflow_id}/knowledge").json():
        assert len(doc["title"]) <= 255
        assert doc["title"].endswith(f"#{doc['chunk_index'] + 1}")
        assert len(doc["source_name"]) <= 512


# ---------------------------------------------------------------------------
# M7: workflow delete removes sqlite-vec index rows
# ---------------------------------------------------------------------------


@vec_required
def test_delete_workflow_removes_vec_rows(monkeypatch):
    """Bulk KnowledgeDocument delete must not leave orphaned vec_knowledge
    rows on the deleting connection's vtable."""
    monkeypatch.setattr("app.config.settings.vector_store", "sqlite_vec")
    from app.services.vector_stores import VEC_TABLE, delete_document_vectors, get_vector_store

    workflow_id = _create_workflow("vec-cleanup")
    wf_uuid = uuid.UUID(workflow_id)
    other_wf_id = uuid.UUID(_create_workflow("vec-keep"))

    db = SessionLocal()
    try:
        doc = models.KnowledgeDocument(
            workflow_id=wf_uuid, title="doomed", text="orphan me not"
        )
        keep = models.KnowledgeDocument(
            workflow_id=other_wf_id, title="kept", text="stay indexed"
        )
        db.add_all([doc, keep])
        db.flush()
        store = get_vector_store(db)
        store.store(db, doc.id, _hashing_vector("alpha beta gamma"))
        store.store(db, keep.id, _hashing_vector("zebra yak xylophone"))
        db.commit()
        doc_id, keep_id = str(doc.id), str(keep.id)
        raw = store._table(db)
        indexed = {
            row[0]
            for row in raw.execute(f"SELECT document_id FROM {VEC_TABLE}").fetchall()
        }
        assert {doc_id, keep_id} <= indexed
    finally:
        db.close()

    response = client.delete(f"/api/workflows/{workflow_id}")
    assert response.status_code == 204, response.text

    db = SessionLocal()
    try:
        store = get_vector_store(db)
        raw = store._table(db)
        remaining = {
            row[0]
            for row in raw.execute(f"SELECT document_id FROM {VEC_TABLE}").fetchall()
        }
        assert doc_id not in remaining, "deleted workflow's vec row was orphaned"
        assert keep_id in remaining, "other workflow's vec row must survive"
    finally:
        db.close()


@vec_required
def test_delete_document_vectors_helper(monkeypatch):
    """Unit coverage for the bulk delete helper itself."""
    monkeypatch.setattr("app.config.settings.vector_store", "sqlite_vec")
    from app.services.vector_stores import VEC_TABLE, delete_document_vectors, get_vector_store

    db = SessionLocal()
    try:
        wf = models.Workflow(user_id=uuid.uuid4(), name=f"vec-{uuid.uuid4()}")
        db.add(wf)
        db.flush()
        a = models.KnowledgeDocument(workflow_id=wf.id, title="a", text="a")
        b = models.KnowledgeDocument(workflow_id=wf.id, title="b", text="b")
        db.add_all([a, b])
        db.flush()
        store = get_vector_store(db)
        store.store(db, a.id, _hashing_vector("alpha beta"))
        store.store(db, b.id, _hashing_vector("gamma delta"))
        db.commit()

        delete_document_vectors(db, [a.id])
        raw = store._table(db)
        remaining = {
            row[0]
            for row in raw.execute(f"SELECT document_id FROM {VEC_TABLE}").fetchall()
        }
        assert str(a.id) not in remaining
        assert str(b.id) in remaining
        delete_document_vectors(db, [])  # empty set is a no-op
    finally:
        db.close()


# ---------------------------------------------------------------------------
# M8: endpoint-side write bounds
# ---------------------------------------------------------------------------


def test_create_workflow_graph_json_capped(monkeypatch):
    import app.api.workflows as workflows_api

    monkeypatch.setattr(workflows_api, "_MAX_GRAPH_JSON_BYTES", 256)
    response = client.post(
        "/api/workflows",
        json={
            "name": "big-graph",
            "graph_json": valid_graph(
                [{"id": "n1", "data": {"nodeType": "tool", "toolType": "calculator"}}]
            ),
        },
    )
    assert response.status_code == 413


def test_save_version_graph_json_capped(monkeypatch):
    import app.api.workflows as workflows_api

    workflow_id = _create_workflow("big-save")
    monkeypatch.setattr(workflows_api, "_MAX_GRAPH_JSON_BYTES", 256)
    response = client.post(
        f"/api/workflows/{workflow_id}/versions",
        json={
            "graph_json": valid_graph(
                [{"id": "n1", "data": {"nodeType": "tool", "toolType": "calculator"}}]
            )
        },
    )
    assert response.status_code == 413


def test_import_workflow_graph_json_capped(monkeypatch):
    import app.api.workflows as workflows_api

    monkeypatch.setattr(workflows_api, "_MAX_GRAPH_JSON_BYTES", 256)
    response = client.post(
        "/api/workflows/import",
        json={
            "format": "aegis-workflow-v1",
            "name": "big-import",
            "graph_json": valid_graph(
                [{"id": "n1", "data": {"nodeType": "tool", "toolType": "calculator"}}]
            ),
        },
    )
    assert response.status_code == 413


def test_bulk_import_job_payload_capped(monkeypatch):
    """The staged payload lands whole in background_jobs.payload_json — the
    endpoint caps it independently of the schema's per-doc text cap."""
    import app.api.workflows as workflows_api

    workflow_id = _create_workflow("bulk-cap")
    monkeypatch.setattr(workflows_api, "_MAX_BULK_JOB_PAYLOAD_BYTES", 64)
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/bulk",
        json={"documents": [{"title": "t", "text": "x" * 200}]},
    )
    assert response.status_code == 413


def test_bulk_import_small_payload_still_queues():
    workflow_id = _create_workflow("bulk-ok")
    response = client.post(
        f"/api/workflows/{workflow_id}/knowledge/bulk",
        json={"documents": [{"title": "t", "text": "hello world"}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "queued"


def test_duplicate_workflow_name_bounded():
    workflow_id = _create_workflow("dup-name")
    db = SessionLocal()
    try:
        db.query(models.Workflow).filter(models.Workflow.id == uuid.UUID(workflow_id)).update(
            {"name": "x" * 255}
        )
        db.commit()
    finally:
        db.close()
    response = client.post(f"/api/workflows/{workflow_id}/duplicate")
    assert response.status_code == 200, response.text
    assert len(response.json()["name"]) <= 255


def test_import_name_suffix_bounded():
    response = client.post(
        "/api/workflows/import",
        params={"name_suffix": "z" * 100},
        json={
            "format": "aegis-workflow-v1",
            "name": "n" * 250,
            "graph_json": valid_graph(
                [{"id": "n1", "data": {"nodeType": "tool", "toolType": "calculator"}}]
            ),
        },
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["name"]) <= 255
