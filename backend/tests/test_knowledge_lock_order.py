"""PostgreSQL lock order for knowledge writers.

Inserting a knowledge row takes FOR KEY SHARE on its library or workflow.
FOR UPDATE conflicts with that share lock, so a writer that flushes the child
first can deadlock with another writer. The owner lock statement has to run
before the first child insert, and two overlapping writes have to both commit.
"""

import threading
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal, engine
from app.main import app
from app.services.drive_sync import RemoteFile, sync_files
from app.services.knowledge_jobs import _bulk_import_sync
from app.services.knowledge_library import add_text
from tests.conftest import valid_graph

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="FOR UPDATE versus FOR KEY SHARE is a PostgreSQL lock-order rule",
)

client = TestClient(app)


def _workflow() -> str:
    created = client.post(
        "/api/workflows",
        json={
            "name": "Lock order",
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
    assert created.status_code == 200, created.text
    return created.json()["id"]


def _library() -> str:
    created = client.post("/api/knowledge", json={"name": "Lock order"})
    assert created.status_code == 201, created.text
    return created.json()["id"]


class _FakeDrive:
    def list_children(self, folder_id: str) -> list[RemoteFile]:
        return []

    def get_file(self, file_id: str) -> RemoteFile:
        raise NotImplementedError

    def export_text(self, remote: RemoteFile) -> str:
        return remote.text


def _assert_lock_precedes_insert(write) -> None:
    order: list[str] = []
    writer = threading.get_ident()

    def _before(conn, cursor, statement, parameters, context, executemany):  # noqa: ARG001
        if threading.get_ident() != writer:
            return
        sql = " ".join(statement.lower().split())
        if "for update" in sql and ("knowledge_bases" in sql or "workflows" in sql):
            order.append("lock")
        elif "insert into knowledge_documents" in sql:
            order.append("insert")

    event.listen(engine, "before_cursor_execute", _before)
    try:
        write()
    finally:
        event.remove(engine, "before_cursor_execute", _before)
    assert "lock" in order, order
    assert "insert" in order, order
    assert order.index("lock") < order.index("insert"), order


def test_library_store_locks_the_base_before_inserting():
    base_id = UUID(_library())

    def write() -> None:
        db = SessionLocal()
        try:
            add_text(
                db,
                DEFAULT_DEV_USER_ID,
                base_id,
                title="Locked",
                text="library lock token",
                tags=[],
            )
        finally:
            db.close()

    _assert_lock_precedes_insert(write)


def test_upload_locks_the_workflow_before_inserting():
    from app.api.workflows import _index_uploaded_chunks

    workflow_id = UUID(_workflow())

    def write() -> None:
        _index_uploaded_chunks(
            workflow_id,
            DEFAULT_DEV_USER_ID,
            b"upload lock token",
            "note.txt",
            "text/plain",
            "Upload",
        )

    _assert_lock_precedes_insert(write)


def test_bulk_import_locks_the_workflow_before_inserting():
    workflow_id = UUID(_workflow())

    def write() -> None:
        assert _bulk_import_sync(workflow_id, [{"title": "Bulk", "text": "bulk lock token"}]) == 1

    _assert_lock_precedes_insert(write)


def test_drive_sync_locks_the_base_before_inserting():
    base_id = UUID(_library())

    def write() -> None:
        db = SessionLocal()
        try:
            base = db.get(models.KnowledgeBase, base_id)
            sync_files(
                db,
                user_id=DEFAULT_DEV_USER_ID,
                base=base,
                roots=[
                    RemoteFile(
                        file_id="file-1",
                        name="note.txt",
                        mime="text/plain",
                        text="drive lock token",
                    )
                ],
                provider=_FakeDrive(),
            )
            db.commit()
        finally:
            db.close()

    _assert_lock_precedes_insert(write)


def test_overlapping_writes_both_commit():
    base_id = UUID(_library())
    workflow_id = UUID(_workflow())
    errors: list[BaseException] = []

    def library_write(token: str) -> None:
        db = SessionLocal()
        try:
            add_text(db, DEFAULT_DEV_USER_ID, base_id, title=token, text=token, tags=[])
        except BaseException as exc:  # noqa: BLE001 — reported after the threads join
            errors.append(exc)
        finally:
            db.close()

    def workflow_write(token: str) -> None:
        try:
            _bulk_import_sync(workflow_id, [{"title": token, "text": token}])
        except BaseException as exc:  # noqa: BLE001 — reported after the threads join
            errors.append(exc)

    threads = [
        threading.Thread(target=library_write, args=("alpha overlap",)),
        threading.Thread(target=library_write, args=("beta overlap",)),
        threading.Thread(target=workflow_write, args=("gamma overlap",)),
        threading.Thread(target=workflow_write, args=("delta overlap",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert not errors, errors
    assert all(not thread.is_alive() for thread in threads)

    db = SessionLocal()
    try:
        library_texts = {
            row.text
            for row in db.query(models.KnowledgeDocument)
            .filter(models.KnowledgeDocument.knowledge_base_id == base_id)
            .all()
        }
        workflow_texts = {
            row.text
            for row in db.query(models.KnowledgeDocument)
            .filter(models.KnowledgeDocument.workflow_id == workflow_id)
            .all()
        }
    finally:
        db.close()
    assert {"alpha overlap", "beta overlap"} <= library_texts
    assert {"gamma overlap", "delta overlap"} <= workflow_texts
