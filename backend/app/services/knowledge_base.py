"""Simple keyword-based knowledge retrieval (Lyzr RAG-lite)."""

from __future__ import annotations

import re
from typing import Any


def _tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2}


def score_document(query: str, document_text: str) -> float:
    query_tokens = _tokenize(query)
    if not query_tokens:
        return 0.0
    doc_tokens = _tokenize(document_text)
    if not doc_tokens:
        return 0.0
    overlap = query_tokens & doc_tokens
    return len(overlap) / len(query_tokens)


def retrieve_documents(
    query: str,
    documents: list[dict[str, Any]],
    *,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for doc in documents or []:
        text = str(doc.get("text") or "")
        if not text.strip():
            continue
        score = score_document(query, text)
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "id": doc.get("id"),
                    "title": doc.get("title"),
                    "text": text,
                    "score": round(score, 3),
                },
            )
        )
    scored.sort(key=lambda row: row[0], reverse=True)
    return [row[1] for row in scored[: max(1, top_k)]]