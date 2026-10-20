"""Pluggable vector stores for knowledge retrieval (Phase 4 RAG).

``get_vector_store`` picks a store from ``settings.vector_store``:

- ``pgvector``   — Postgres ``pgvector`` on ``knowledge_documents.embedding_vector``
- ``sqlite_vec`` — sqlite-vec virtual table ``vec_knowledge`` (per database)
- ``auto``       — pgvector on Postgres (when enabled + extension present),
                   else sqlite-vec on SQLite, else JSON-embedding fallback
- ``none``       — always use the JSON-embedding fallback

Stores return ``{document_id, distance}`` hits; ``vector_search`` joins back
to ``knowledge_documents`` for the workflow filter + fields, so the JSON
``embedding`` column stays the universal source of truth.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.services.embeddings import EMBEDDING_DIM

log = logging.getLogger(__name__)

VEC_TABLE = "vec_knowledge"


def _validate_embedding(embedding: list[float]) -> list[float]:
    """Coerce to floats and reject non-finite values — NaN/inf would poison
    SQL literals and the vec index alike (restores the check dropped when the
    store layer was extracted)."""
    values = [float(v) for v in embedding]
    if not values or any(not math.isfinite(v) for v in values):
        raise ValueError("Embedding must be non-empty and contain no non-finite values")
    return values


def _embedding_literal(embedding: list[float]) -> str:
    values = _validate_embedding(embedding)
    return "[" + ",".join(str(v) for v in values) + "]"
def _uuid_str(value: UUID | str) -> str:
    """Canonical dashed UUID string (SQLite stores bare hex via sa.Uuid)."""
    if isinstance(value, UUID):
        return str(value)
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError):
        return str(value)


def pgvector_available(db: Session) -> bool:
    if not settings.pgvector_enabled:
        return False
    try:
        if db.bind is None or db.bind.dialect.name != "postgresql":
            return False
        row = db.execute(
            text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
        ).first()
        return row is not None
    except Exception:
        return False


class PgVectorStore:
    """pgvector over the ``embedding_vector`` column on knowledge_documents."""

    name = "pgvector"

    def store(self, db: Session, document_id: UUID, embedding: list[float]) -> None:
        if not embedding:
            return
        db.execute(
            text(
                "UPDATE knowledge_documents SET embedding_vector = :vec::vector "
                "WHERE id = :id"
            ),
            {"vec": _embedding_literal(embedding), "id": str(document_id)},
        )

    def delete(self, db: Session, document_id: UUID) -> None:
        db.execute(
            text(
                "UPDATE knowledge_documents SET embedding_vector = NULL "
                "WHERE id = :id"
            ),
            {"id": str(document_id)},
        )

    def search(
        self,
        db: Session,
        query_vec: list[float],
        workflow_id: UUID,
        top_k: int,
    ) -> list[dict[str, Any]]:
        rows = (
            db.execute(
                text(
                    """
                    SELECT id, embedding_vector <=> :query_vec::vector AS distance
                    FROM knowledge_documents
                    WHERE workflow_id = :workflow_id
                      AND embedding_vector IS NOT NULL
                    ORDER BY embedding_vector <=> :query_vec::vector
                    LIMIT :limit
                    """
                ),
                {
                    "query_vec": _embedding_literal(query_vec),
                    "workflow_id": str(workflow_id),
                    "limit": max(1, top_k),
                },
            )
            .mappings()
            .all()
        )
        return [
            {"document_id": str(row["id"]), "distance": float(row["distance"] or 0)}
            for row in rows
        ]

    def unindexed_document_ids(self, db: Session, workflow_id: UUID) -> set[str]:
        """Workflow documents with no ``embedding_vector`` — i.e. absent from
        the index and therefore only reachable through JSON cosine scoring."""
        rows = (
            db.execute(
                text(
                    "SELECT id FROM knowledge_documents "
                    "WHERE workflow_id = :workflow_id AND embedding_vector IS NULL"
                ),
                {"workflow_id": str(workflow_id)},
            )
            .scalars()
            .all()
        )
        return {str(row) for row in rows}


class SqliteVecStore:
    """sqlite-vec ``vec0`` index over a per-database ``vec_knowledge`` vtable.

    The virtual table lives on the same SQLite database (via the session's raw
    connection) and stores one row per knowledge document, keyed by the
    document id string. Rows are joined back to ``knowledge_documents`` by id
    for the workflow-scoped filter, so stale vec rows can't leak results.
    """

    name = "sqlite_vec"

    def _sqlite3(self, db: Session):
        """Raw sqlite3 connection for the session's current transaction."""
        conn = db.connection().connection  # SQLAlchemy Connection → DBAPI proxy
        return getattr(conn, "driver_connection", None) or conn

    def _load(self, db: Session):
        if db.bind is None or db.bind.dialect.name != "sqlite":
            raise RuntimeError("sqlite_vec store requires a SQLite database")
        import sqlite_vec

        raw = self._sqlite3(db)
        raw.enable_load_extension(True)
        try:
            sqlite_vec.load(raw)
        finally:
            raw.enable_load_extension(False)
        return raw

    def _table(self, db: Session):
        raw = self._load(db)
        raw.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS {VEC_TABLE} USING vec0("
            f"document_id TEXT PRIMARY KEY, embedding FLOAT[{EMBEDDING_DIM}]"
            " distance_metric=cosine)"
        )
        return raw

    def store(self, db: Session, document_id: UUID, embedding: list[float]) -> None:
        if not embedding:
            return
        import sqlite_vec

        values = _validate_embedding(embedding)
        raw = self._table(db)
        raw.execute(
            f"INSERT OR REPLACE INTO {VEC_TABLE}(document_id, embedding) "
            "VALUES (?, ?)",
            [str(document_id), sqlite_vec.serialize_float32(values)],
        )

    def delete(self, db: Session, document_id: UUID) -> None:
        try:
            raw = self._table(db)
        except RuntimeError:
            return
        raw.execute(
            f"DELETE FROM {VEC_TABLE} WHERE document_id = ?",
            [str(document_id)],
        )

    def search(
        self,
        db: Session,
        query_vec: list[float],
        workflow_id: UUID,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """KNN over the vec table, restricted to this workflow's documents.

        vec0 only filters on its own columns, so we rank the whole index
        (k = index size — knowledge corpora are small) then filter by the
        workflow's document id set. Exact, and bounded by corpus size.
        """
        import sqlite_vec

        if not query_vec:
            return []
        from app.db import models

        doc_ids = {
            _uuid_str(row[0])
            for row in db.query(models.KnowledgeDocument.id)
            .filter(models.KnowledgeDocument.workflow_id == workflow_id)
            .all()
        }
        if not doc_ids:
            return []
        raw = self._table(db)
        index_size = raw.execute(f"SELECT COUNT(*) FROM {VEC_TABLE}").fetchone()[0]
        if index_size == 0:
            return []
        rows = raw.execute(
            f"SELECT document_id, distance FROM {VEC_TABLE} "
            "WHERE embedding MATCH ? AND k = ? ORDER BY distance",
            [sqlite_vec.serialize_float32(_validate_embedding(query_vec)), index_size],
        ).fetchall()
        hits = [
            {"document_id": document_id, "distance": float(distance)}
            for document_id, distance in rows
            if _uuid_str(document_id) in doc_ids
        ]
        return hits[: max(1, top_k)]

    def unindexed_document_ids(self, db: Session, workflow_id: UUID) -> set[str]:
        """Workflow documents with no row in ``vec_knowledge`` — absent from
        the vec0 index, served only by the JSON cosine leg."""
        from app.db import models

        doc_ids = {
            _uuid_str(row[0])
            for row in db.query(models.KnowledgeDocument.id)
            .filter(models.KnowledgeDocument.workflow_id == workflow_id)
            .all()
        }
        if not doc_ids:
            return set()
        try:
            raw = self._table(db)
        except RuntimeError:
            return doc_ids
        indexed = {
            _uuid_str(row[0])
            for row in raw.execute(
                f"SELECT document_id FROM {VEC_TABLE} WHERE document_id IN "
                f"({','.join('?' for _ in doc_ids)})",
                list(doc_ids),
            ).fetchall()
        }
        return doc_ids - indexed


def get_vector_store(db: Session) -> PgVectorStore | SqliteVecStore | None:
    """Resolve the configured vector store for this database, or None."""
    mode = (settings.vector_store or "auto").strip().lower()
    dialect = db.bind.dialect.name if db.bind is not None else ""

    if mode == "none":
        return None
    if mode == "pgvector":
        return PgVectorStore() if pgvector_available(db) else None
    if mode == "sqlite_vec":
        return SqliteVecStore() if dialect == "sqlite" else None
    if mode != "auto":
        log.warning("unknown vector_store=%r; falling back to auto", mode)

    if dialect == "postgresql" and pgvector_available(db):
        return PgVectorStore()
    if dialect == "sqlite":
        return SqliteVecStore()
    return None


def delete_document_vectors(db: Session, document_ids: Iterable[UUID]) -> None:
    """Drop a set of documents from the active vector index (best effort).

    Bulk counterpart of ``vector_search.delete_embedding_vector`` for deletes
    that bypass per-document cleanup (e.g. whole-workflow deletion). Only the
    sqlite-vec side table needs explicit rows removed — pgvector stores the
    embedding on the document row itself, so deleting the row clears it.
    """
    ids = [str(document_id) for document_id in document_ids]
    if not ids:
        return
    try:
        store = get_vector_store(db)
        if isinstance(store, SqliteVecStore):
            raw = store._table(db)
            raw.executemany(
                f"DELETE FROM {VEC_TABLE} WHERE document_id = ?",
                [(doc_id,) for doc_id in ids],
            )
    except Exception:  # noqa: BLE001 — index maintenance is best-effort
        log.warning("bulk vector delete failed", exc_info=True)
