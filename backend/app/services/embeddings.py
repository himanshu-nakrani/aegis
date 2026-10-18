"""Text embeddings for vector RAG (Gemini with TF-IDF fallback)."""

from __future__ import annotations

import hashlib
import math
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.db import models
from app.services.knowledge_base import _tokenize

EMBEDDING_DIM = 768
DEFAULT_EMBED_MODEL = "text-embedding-004"


def _hashing_vector(text: str, *, dim: int = EMBEDDING_DIM) -> list[float]:
    tokens = _tokenize(text)
    if not tokens:
        return [0.0] * dim
    vec = [0.0] * dim
    for token in tokens:
        digest = hashlib.sha256(token.encode()).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def embed_text(text: str) -> list[float]:
    stripped = (text or "").strip()
    if not stripped:
        return [0.0] * EMBEDDING_DIM

    if settings.google_api_key:
        try:
            from google import genai

            from app.services.tracing import model_call_span

            client = genai.Client(api_key=settings.google_api_key)
            with model_call_span("google", settings.embedding_model, operation="embeddings"):
                response = client.models.embed_content(
                    model=settings.embedding_model,
                    contents=stripped[:8000],
                )
            values = response.embeddings[0].values
            if values:
                if len(values) != EMBEDDING_DIM:
                    import logging as _logging

                    _logging.getLogger("aegis.embeddings").warning(
                        "Embedding dim %d != %d — falling back to hashing vector",
                        len(values), EMBEDDING_DIM,
                        extra={"event": "embedding_dim_mismatch"},
                    )
                else:
                    return [float(v) for v in values]
        except Exception as exc:
            import logging as _logging

            _logging.getLogger("aegis.embeddings").warning(
                "Gemini embedding failed (%s); using hashing fallback",
                type(exc).__name__,
                extra={"event": "embedding_fallback"},
            )

    return _hashing_vector(stripped)


def cosine_similarity_vectors(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    if len(a) != len(b):
        # One legacy row must not 500 the whole retrieval: skip the doc.
        import logging as _logging

        _logging.getLogger("aegis.embeddings").warning(
            "Skipping doc with dim %d (query dim %d)",
            len(b), len(a),
            extra={"event": "embedding_dim_mismatch"},
        )
        return 0.0
    length = len(a)
    dot = sum(a[i] * b[i] for i in range(length))
    norm_a = math.sqrt(sum(a[i] * a[i] for i in range(length)))
    norm_b = math.sqrt(sum(b[i] * b[i] for i in range(length)))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def retrieve_by_embedding(
    query: str,
    documents: list[dict[str, Any]],
    *,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    query_vec = embed_text(query)
    scored: list[tuple[float, dict[str, Any]]] = []
    for doc in documents or []:
        embedding = doc.get("embedding")
        if not embedding:
            embedding = embed_text(str(doc.get("text") or ""))
        score = cosine_similarity_vectors(query_vec, embedding)
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "id": doc.get("id"),
                    "title": doc.get("title"),
                    "text": doc.get("text"),
                    "score": round(score, 4),
                    "source_name": doc.get("source_name"),
                    "source_document_id": doc.get("source_document_id"),
                    "chunk_index": doc.get("chunk_index"),
                    "char_start": doc.get("char_start"),
                    "char_end": doc.get("char_end"),
                },
            )
        )
    scored.sort(key=lambda row: row[0], reverse=True)
    return [row[1] for row in scored[: max(1, top_k)]]


def apply_embedding(row: models.KnowledgeDocument, db: Session | None = None) -> None:
    row.embedding = embed_text(row.text)
    if db is not None and row.id:
        from app.services.vector_search import store_embedding_vector

        store_embedding_vector(db, row.id, row.embedding or [])