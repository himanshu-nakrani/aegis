"""Vector-store-backed knowledge retrieval with JSON embedding fallback.

Resolution: ``vector_stores.get_vector_store(db)`` (settings.vector_store →
pgvector / sqlite_vec / auto / none). When a store is present, reads go
through its KNN index joined back to ``knowledge_documents`` for the
workflow filter + fields; when not, retrieval falls back to scoring the JSON
``embedding`` column in Python. Writes always land in the JSON column and
are mirrored into the active store (and the legacy ``embedding_vector``
column for pgvector deployments).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import SessionLocal
from app.services.embeddings import embed_text, retrieve_by_embedding

log = logging.getLogger(__name__)


def _pgvector_available(db: Session) -> bool:
    from app.services.vector_stores import pgvector_available

    return pgvector_available(db)



def store_embedding_vector(db: Session, document_id: UUID, embedding: list[float]) -> None:
    """Mirror an embedding into the active vector index (best effort)."""
    if not embedding:
        return
    from app.services.vector_stores import get_vector_store

    try:
        store = get_vector_store(db)
        if store is not None:
            store.store(db, document_id, embedding)
    except Exception:  # noqa: BLE001 — the JSON column is the source of truth
        log.warning("vector store write failed for %s", document_id, exc_info=True)


def delete_embedding_vector(db: Session, document_id: UUID) -> None:
    """Drop a document from the active vector index (best effort)."""
    from app.services.vector_stores import get_vector_store

    try:
        store = get_vector_store(db)
        if store is not None:
            store.delete(db, document_id)
    except Exception:  # noqa: BLE001
        log.warning("vector store delete failed for %s", document_id, exc_info=True)


def _search_via_store(
    db: Session,
    store: Any,
    workflow_id: UUID,
    query_vec: list[float],
    *,
    top_k: int,
) -> list[dict[str, Any]]:
    hits = store.search(db, query_vec, workflow_id, top_k)
    if not hits:
        return []
    from app.db import models

    by_id: dict[str, float] = {}
    for h in hits:
        doc_id = str(h.get("document_id") or "")
        try:
            UUID(doc_id)
        except (ValueError, AttributeError):
            continue
        by_id[doc_id] = float(h.get("distance") or 0.0)
    # L2-norm distances can exceed 1 for far docs (1-distance <= 0): the JSON
    # cosine leg filters score <= 0, so drop store deadweight the same way
    # instead of citing irrelevant chunks.
    by_id = {doc_id: dist for doc_id, dist in by_id.items() if 1.0 - dist > 0}
    if not by_id:
        return []
    # Fetch only the hit rows — never the whole KB (texts+embeddings per run).
    rows = (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.workflow_id == workflow_id,
            models.KnowledgeDocument.id.in_([UUID(doc_id) for doc_id in by_id]),
        )
        .all()
    )
    results: list[dict[str, Any]] = []
    for row in rows:
        doc_id = str(row.id)
        if doc_id not in by_id:
            continue
        distance = by_id[doc_id]
        results.append(
            {
                "id": doc_id,
                "title": row.title,
                "text": row.text,
                "score": round(1.0 - distance, 4),
                "source_name": row.source_name,
                "source_document_id": (
                    str(row.source_document_id) if row.source_document_id else None
                ),
                "chunk_index": row.chunk_index,
                "char_start": row.chunk_start,
                "char_end": row.chunk_end,
            }
        )
    results.sort(key=lambda r: by_id[r["id"]])
    return results[: max(1, top_k)]



def retrieve_by_pgvector(
    db: Session,
    workflow_id: UUID,
    query: str,
    *,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Deprecated alias: pgvector search through the store abstraction."""
    from app.services.vector_stores import PgVectorStore

    if not _pgvector_available(db):
        return []
    query_vec = embed_text(query)
    if not query_vec:
        return []
    return _search_via_store(
        db, PgVectorStore(), workflow_id, query_vec, top_k=top_k
    )


def retrieve_documents(
    workflow_id: UUID | None,
    query: str,
    documents: list[dict[str, Any]],
    *,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """KNN via the vector store, merged with JSON-scored unindexed docs.

    The store only indexes docs written through it, so a database upgraded to
    a vector store serves pre-upgrade docs from the JSON ``embedding`` column
    alone. Returning only store hits hid that legacy corpus. We therefore
    merge: store hits (indexed) ∪ JSON cosine scores for docs the store did
    NOT return, then take ``top_k`` overall. Store score is ``1 - distance``,
    the same scale as ``cosine_similarity_vectors``, so the ranks compose.
    This is read-only — no writes to the index on a retrieval path (``documents``
    may be inline, non-KB embeddings that must never pollute the shared table).
    With ``workflow_id=None`` (inline docs, ad-hoc contexts) the store leg is
    skipped and retrieval is pure JSON-cosine over the given documents.
    """
    if workflow_id is None:
        return retrieve_by_embedding(query, documents, top_k=top_k)
    db = SessionLocal()
    try:
        from app.services.vector_stores import get_vector_store

        store = get_vector_store(db)
        if store is not None:
            query_vec = embed_text(query)
            if query_vec:
                store_hits = _search_via_store(
                    db, store, workflow_id, query_vec, top_k=top_k
                )
                if store_hits:
                    hit_ids = {str(h["id"]) for h in store_hits}
                    # Score only the docs the store did not return. An indexed
                    # loser ranked below the kth hit under the same metric, so
                    # it cannot displace a real hit; the only docs that can
                    # legitimately enter top_k are unindexed (legacy) ones.
                    remaining = [
                        d for d in (documents or []) if str(d.get("id")) not in hit_ids
                    ]
                    json_hits = (
                        retrieve_by_embedding(query, remaining, top_k=top_k)
                        if remaining
                        else []
                    )
                    merged = store_hits + json_hits
                    merged.sort(key=lambda r: r.get("score") or 0.0, reverse=True)
                    return merged[: max(1, top_k)]
    except Exception:  # noqa: BLE001 — fall back to JSON embeddings
        log.warning("vector store search failed; using JSON fallback", exc_info=True)
    finally:
        db.close()
    return retrieve_by_embedding(query, documents, top_k=top_k)
