"""User-owned knowledge libraries: ingest, settings, and retrieval."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, load_only

from app.config import settings
from app.db import models
from app.http_client import get_http_client
from app.services.documents import MAX_UPLOAD_BYTES, chunk_by_strategy, parse_document
from app.services.embeddings import apply_embedding, retrieve_by_embedding
from app.services.knowledge_base import retrieve_documents
from app.services.retrieval import (
    MAX_LIBRARY_CHUNKS,
    apply_min_score,
    fuse_ranked_hits,
    merge_kb_settings,
    normalize_kb_settings,
    normalize_tags,
)
from app.services.url_safety import safe_http_request

_HTML_TAGS = re.compile(r"(?is)<(script|style)[^>]*>.*?</\1>|<[^>]+>")
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_TITLE_MAX = 255


def list_bases(db: Session, user_id: UUID) -> list[dict[str, Any]]:
    rows = (
        db.query(models.KnowledgeBase)
        .filter(models.KnowledgeBase.user_id == user_id)
        .order_by(models.KnowledgeBase.updated_at.desc())
        .all()
    )
    counts = _chunk_counts(db, [row.id for row in rows])
    return [_base_out(row, counts.get(row.id, 0)) for row in rows]


def create_base(
    db: Session,
    user_id: UUID,
    *,
    name: str,
    description: str | None,
    settings: dict[str, Any] | None,
) -> dict[str, Any]:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Library name is required")
    try:
        stored = normalize_kb_settings(settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = models.KnowledgeBase(
        user_id=user_id,
        name=cleaned[:128],
        description=(description or "").strip() or None,
        settings_json=stored,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _base_out(row, 0)


def get_owned(db: Session, user_id: UUID, base_id: UUID) -> models.KnowledgeBase:
    row = (
        db.query(models.KnowledgeBase)
        .filter(models.KnowledgeBase.id == base_id, models.KnowledgeBase.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Knowledge library not found")
    return row


def update_base(
    db: Session,
    user_id: UUID,
    base_id: UUID,
    *,
    name: str | None,
    description: str | None,
    settings: dict[str, Any] | None,
) -> dict[str, Any]:
    row = get_owned(db, user_id, base_id)
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Library name is required")
        row.name = cleaned[:128]
    if description is not None:
        row.description = description.strip() or None
    if settings is not None:
        try:
            row.settings_json = merge_kb_settings(row.settings_json, settings)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    return _base_out(row, _chunk_counts(db, [row.id]).get(row.id, 0))


def delete_base(db: Session, user_id: UUID, base_id: UUID) -> None:
    row = get_owned(db, user_id, base_id)
    doc_ids = [
        item[0]
        for item in db.query(models.KnowledgeDocument.id)
        .filter(models.KnowledgeDocument.knowledge_base_id == row.id)
        .all()
    ]
    from app.services.vector_search import delete_embedding_vector

    for doc_id in doc_ids:
        delete_embedding_vector(db, doc_id)
    db.delete(row)
    db.commit()


def list_sources(db: Session, user_id: UUID, base_id: UUID) -> list[dict[str, Any]]:
    base = get_owned(db, user_id, base_id)
    rows = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.knowledge_base_id == base.id)
        .order_by(models.KnowledgeDocument.created_at.asc(), models.KnowledgeDocument.chunk_index.asc())
        .all()
    )
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.source_document_id or row.id)
        entry = grouped.get(key)
        if entry is None:
            grouped[key] = {
                "source_document_id": key,
                "title": row.title,
                "source_name": row.source_name,
                "source_mime": row.source_mime,
                "source_url": row.source_url,
                "tags": list(row.tags_json or []),
                "chunk_count": 1,
                "created_at": row.created_at,
            }
        else:
            entry["chunk_count"] += 1
    return list(grouped.values())


def add_text(
    db: Session,
    user_id: UUID,
    base_id: UUID,
    *,
    title: str | None,
    text: str,
    tags: list[str] | None,
    source_name: str | None = None,
    source_mime: str | None = None,
    source_url: str | None = None,
) -> dict[str, Any]:
    base = get_owned(db, user_id, base_id)
    body = (text or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Document has no readable text")
    try:
        clean_tags = normalize_tags(tags)
        settings_json = normalize_kb_settings(base.settings_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    chunks = chunk_by_strategy(
        body,
        settings_json["chunk_strategy"],
        settings_json["chunk_size"],
        settings_json["chunk_overlap"],
    )
    if not chunks:
        raise HTTPException(status_code=400, detail="Document has no readable text")
    return _store_chunks(
        db,
        base,
        chunks,
        title=title,
        tags=clean_tags,
        source_name=source_name or (title or "paste.txt"),
        source_mime=source_mime or "text/plain",
        source_url=source_url,
    )


def add_file(
    db: Session,
    user_id: UUID,
    base_id: UUID,
    *,
    filename: str,
    content: bytes,
    mime: str | None,
    title: str | None,
    tags: list[str] | None,
) -> dict[str, Any]:
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 8MB limit")
    try:
        text, truncated = parse_document(filename, content, mime)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result = add_text(
        db,
        user_id,
        base_id,
        title=title or filename,
        text=text,
        tags=tags,
        source_name=filename,
        source_mime=mime,
    )
    result["truncated"] = truncated
    return result


async def fetch_public_document(url: str) -> tuple[bytes, str, str]:
    """GET a public http(s) document. Raises ValueError on SSRF or a bad response."""
    client = get_http_client()
    try:
        response = await safe_http_request(
            client,
            "GET",
            url,
            headers={"Accept": "text/html,application/pdf,text/plain,application/octet-stream"},
            max_body_bytes=MAX_UPLOAD_BYTES + 1,
            timeout=20.0,
        )
    except ValueError:
        raise
    except httpx.HTTPError as exc:
        raise ValueError(f"Could not fetch URL: {exc}") from exc
    if response.status_code >= 400:
        raise ValueError(f"URL returned HTTP {response.status_code}")
    content = response.content
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("URL document exceeds the 8MB limit")
    mime = (response.headers.get("content-type") or "text/plain").split(";")[0].strip().lower()
    name = url.rstrip("/").rsplit("/", 1)[-1] or "document"
    if mime == "text/html" or name.lower().endswith((".html", ".htm")):
        text = _HTML_TAGS.sub(" ", content.decode("utf-8", errors="replace"))
        text = re.sub(r"\s+", " ", text).strip()
        return text.encode("utf-8"), "text/plain", "page.txt"
    return content, mime or "application/octet-stream", name


def delete_source(db: Session, user_id: UUID, base_id: UUID, source_id: UUID) -> int:
    base = get_owned(db, user_id, base_id)
    rows = (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.knowledge_base_id == base.id,
            models.KnowledgeDocument.source_document_id == source_id,
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.services.vector_search import delete_embedding_vector

    for row in rows:
        delete_embedding_vector(db, row.id)
        db.delete(row)
    db.commit()
    return len(rows)


def reindex_base(db: Session, user_id: UUID, base_id: UUID) -> int:
    base = get_owned(db, user_id, base_id)
    rows = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.knowledge_base_id == base.id)
        .all()
    )
    for row in rows:
        apply_embedding(row, db)
    db.commit()
    return len(rows)


def query_base(
    db: Session,
    user_id: UUID,
    base_id: UUID,
    *,
    query: str,
    settings_override: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    top_k: int | None = None,
    method: str | None = None,
) -> dict[str, Any]:
    base = get_owned(db, user_id, base_id)
    try:
        active = merge_kb_settings(base.settings_json, settings_override)
        wanted_tags = normalize_tags(tags)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if method and method != "library":
        if method not in {"keyword", "bm25", "tfidf", "embedding", "hybrid"}:
            raise HTTPException(status_code=400, detail="Unknown retrieval method")
        active["retrieval_method"] = method
    if top_k is not None:
        active["top_k"] = max(1, min(20, int(top_k)))
    docs = _load_chunks(db, base.id, wanted_tags)
    if len(docs) > MAX_LIBRARY_CHUNKS:
        raise HTTPException(
            status_code=400,
            detail=f"Library has {len(docs)} chunks. Narrow it with tags before querying (limit {MAX_LIBRARY_CHUNKS}).",
        )
    asked = (query or "").strip()
    if not asked:
        raise HTTPException(status_code=400, detail="Query is required")
    rewrite_note = {"requested": active["query_rewrite"], "applied": False}
    if active["query_rewrite"] == "llm":
        rewritten = _rewrite_query(asked, str(user_id))
        if rewritten:
            asked = rewritten
            rewrite_note["applied"] = True
        else:
            rewrite_note["reason"] = "model key unavailable or rewrite failed"
    hits, method_used = _retrieve(asked, docs, active)
    # min_score filters the score the retrieval method actually returned, so it
    # runs before reranking: a ranker must not promote hits back over the
    # caller's threshold, and filtered hits should never spend rerank tokens.
    hits = apply_min_score(hits, active["min_score"])
    rerank_note = {"requested": active["reranker"], "applied": False}
    if active["reranker"] == "llm" and hits:
        # The candidate pool bounds what the LLM reads; anything beyond it
        # keeps its retrieval order behind the reranked shortlist.
        head, tail = hits[: active["rerank_candidates"]], hits[active["rerank_candidates"] :]
        reranked = _rerank(asked, head, str(user_id))
        if reranked is not None:
            hits = reranked + tail
            rerank_note["applied"] = True
        else:
            rerank_note["reason"] = "model key unavailable or rerank failed"
    hits = hits[: active["top_k"]]
    citations = [_citation(rank, hit) for rank, hit in enumerate(hits, start=1)]
    return {
        "query": asked,
        "method": method_used,
        "settings": active,
        "rewrite": rewrite_note,
        "rerank": rerank_note,
        "results": hits,
        "citations": citations,
    }


def query_library_for_node(
    context_ref: dict[str, Any] | None,
    knowledge_base_id: str | None,
    query: str,
    top_k: int | None,
    method: str | None,
) -> dict[str, Any]:
    from app.db.database import SessionLocal
    from app.services.node_handlers import NodeExecutionError

    if not knowledge_base_id:
        raise NodeExecutionError("KB retrieve error: knowledge library is required")
    user_raw = (context_ref or {}).get("_user_id")
    try:
        user_id = UUID(str(user_raw))
        base_id = UUID(str(knowledge_base_id))
    except (ValueError, TypeError) as exc:
        raise NodeExecutionError("KB retrieve error: knowledge library is invalid") from exc
    db = SessionLocal()
    try:
        try:
            return query_base(
                db,
                user_id,
                base_id,
                query=query,
                top_k=top_k,
                method=None if method in (None, "", "library") else method,
            )
        except HTTPException as exc:
            raise NodeExecutionError(f"KB retrieve error: {exc.detail}") from exc
    finally:
        db.close()


def _store_chunks(
    db: Session,
    base: models.KnowledgeBase,
    chunks: list[dict[str, Any]],
    *,
    title: str | None,
    tags: list[str],
    source_name: str | None,
    source_mime: str | None,
    source_url: str | None,
) -> dict[str, Any]:
    existing = (
        db.query(func.count(models.KnowledgeDocument.id))
        .filter(models.KnowledgeDocument.knowledge_base_id == base.id)
        .scalar()
        or 0
    )
    if existing + len(chunks) > MAX_LIBRARY_CHUNKS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Library cap is {MAX_LIBRARY_CHUNKS} chunks; it holds {existing} "
                f"and this document would add {len(chunks)}."
            ),
        )
    source_id = uuid.uuid4()
    base_title = ((title or "").strip() or source_name or "Document")[:_TITLE_MAX]
    multi = len(chunks) > 1
    for index, chunk in enumerate(chunks):
        title_text = base_title
        if multi:
            suffix = f"#{index + 1}"
            title_text = base_title[: _TITLE_MAX - len(suffix)] + suffix
        row = models.KnowledgeDocument(
            knowledge_base_id=base.id,
            title=title_text,
            text=chunk["text"],
            tags_json=tags,
            source_url=(source_url or None),
            source_document_id=source_id,
            source_name=(source_name or None),
            source_mime=(source_mime or None),
            chunk_index=index,
            chunk_start=chunk["start"],
            chunk_end=chunk["end"],
        )
        db.add(row)
        db.flush()
        apply_embedding(row, db)
    db.commit()
    return {
        "source_document_id": str(source_id),
        "chunks_created": len(chunks),
        "title": base_title,
        "tags": tags,
    }


def _load_chunks(db: Session, base_id: UUID, tags: list[str]) -> list[dict[str, Any]]:
    rows = (
        db.query(models.KnowledgeDocument)
        .options(
            load_only(
                models.KnowledgeDocument.id,
                models.KnowledgeDocument.title,
                models.KnowledgeDocument.text,
                models.KnowledgeDocument.embedding,
                models.KnowledgeDocument.source_name,
                models.KnowledgeDocument.source_document_id,
                models.KnowledgeDocument.source_url,
                models.KnowledgeDocument.chunk_index,
                models.KnowledgeDocument.chunk_start,
                models.KnowledgeDocument.chunk_end,
                models.KnowledgeDocument.tags_json,
            )
        )
        .filter(models.KnowledgeDocument.knowledge_base_id == base_id)
        .all()
    )
    docs = []
    for row in rows:
        row_tags = list(row.tags_json or [])
        if tags and any(tag not in row_tags for tag in tags):
            continue
        docs.append(
            {
                "id": str(row.id),
                "title": row.title,
                "text": row.text,
                "embedding": row.embedding,
                "source_name": row.source_name,
                "source_document_id": str(row.source_document_id) if row.source_document_id else None,
                "source_url": row.source_url,
                "chunk_index": row.chunk_index,
                "char_start": row.chunk_start,
                "char_end": row.chunk_end,
                "tags": row_tags,
            }
        )
    return docs


def _retrieve(query: str, docs: list[dict[str, Any]], active: dict[str, Any]) -> tuple[list[dict], str]:
    method = active["retrieval_method"]
    pool = max(active["top_k"], active["rerank_candidates"])
    if method == "hybrid":
        lexical = retrieve_documents(query, docs, top_k=pool, method="bm25")
        vector = retrieve_by_embedding(query, docs, top_k=pool)
        return fuse_ranked_hits([lexical, vector], k=active["rrf_k"], top_n=pool), "hybrid"
    if method == "embedding":
        return retrieve_by_embedding(query, docs, top_k=pool), "embedding"
    lexical_method = "keyword" if method == "keyword" else method
    return retrieve_documents(query, docs, top_k=pool, method=lexical_method), method


def _rewrite_query(query: str, user_id: str) -> str | None:
    pm = _library_model(user_id)
    if pm is None:
        return None
    from app.services.llm_providers import generate_text

    try:
        text = generate_text(
            pm,
            system_instruction="Rewrite the search query into one concise retrieval query. Return only the query.",
            contents=query,
        )
    except Exception:
        return None
    cleaned = (text or "").strip().strip('"')
    return cleaned[:500] or None


def _rerank(query: str, hits: list[dict[str, Any]], user_id: str) -> list[dict[str, Any]] | None:
    pm = _library_model(user_id)
    if pm is None:
        return None
    from app.services.llm_providers import generate_text

    catalog = [{"id": hit.get("id"), "text": str(hit.get("text") or "")[:500]} for hit in hits]
    try:
        raw = generate_text(
            pm,
            system_instruction="Order passage ids from most relevant to least. Return a JSON array of id strings and nothing else.",
            contents=json.dumps({"query": query, "passages": catalog}),
        )
        ordered = json.loads(_FENCE.sub("", raw.strip()).strip())
    except Exception:
        return None
    if not isinstance(ordered, list):
        return None
    by_id = {str(hit.get("id")): hit for hit in hits}
    reranked = []
    for item in ordered:
        hit = by_id.pop(str(item), None)
        if hit is not None:
            reranked.append(hit)
    reranked.extend(by_id.values())
    return reranked


def _library_model(user_id: str):
    if not settings.google_api_key:
        return None
    from app.services.llm_providers import resolve_provider_model

    try:
        return resolve_provider_model(
            {"provider": "google", "model": settings.gemini_model},
            {"_user_id": user_id},
        )
    except Exception:
        return None


def _citation(rank: int, hit: dict[str, Any]) -> dict[str, Any]:
    return {
        "rank": rank,
        "document_id": hit.get("id"),
        "title": hit.get("title"),
        "source_name": hit.get("source_name"),
        "source_document_id": hit.get("source_document_id"),
        "source_url": hit.get("source_url"),
        "chunk_index": hit.get("chunk_index"),
        "char_start": hit.get("char_start"),
        "char_end": hit.get("char_end"),
        "score": hit.get("score"),
        "tags": hit.get("tags") or [],
    }


def _chunk_counts(db: Session, base_ids: list[UUID]) -> dict[UUID, int]:
    if not base_ids:
        return {}
    rows = (
        db.query(models.KnowledgeDocument.knowledge_base_id, func.count())
        .filter(models.KnowledgeDocument.knowledge_base_id.in_(base_ids))
        .group_by(models.KnowledgeDocument.knowledge_base_id)
        .all()
    )
    return {base_id: count for base_id, count in rows}


def _base_out(row: models.KnowledgeBase, chunk_count: int) -> dict[str, Any]:
    try:
        stored = normalize_kb_settings(row.settings_json)
    except ValueError:
        stored = normalize_kb_settings(None)
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "settings": stored,
        "chunk_count": chunk_count,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }
