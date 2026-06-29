"""Keyword and BM25 knowledge retrieval (Lyzr RAG-lite)."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any


def _tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2]


def score_document(query: str, document_text: str) -> float:
    query_tokens = set(_tokenize(query))
    if not query_tokens:
        return 0.0
    doc_tokens = set(_tokenize(document_text))
    if not doc_tokens:
        return 0.0
    overlap = query_tokens & doc_tokens
    return len(overlap) / len(query_tokens)


def score_document_bm25(query: str, document_text: str, *, avg_dl: float = 120.0, k1: float = 1.5, b: float = 0.75) -> float:
    query_tokens = _tokenize(query)
    if not query_tokens:
        return 0.0
    doc_tokens = _tokenize(document_text)
    if not doc_tokens:
        return 0.0
    doc_len = len(doc_tokens)
    freqs = Counter(doc_tokens)
    score = 0.0
    for term in set(query_tokens):
        tf = freqs.get(term, 0)
        if tf == 0:
            continue
        idf = math.log(1 + (1.0 / (tf + 0.5)))
        denom = tf + k1 * (1 - b + b * (doc_len / max(avg_dl, 1.0)))
        score += idf * ((tf * (k1 + 1)) / max(denom, 1e-9))
    return score


def retrieve_documents(
    query: str,
    documents: list[dict[str, Any]],
    *,
    top_k: int = 3,
    method: str = "bm25",
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    texts = [str(doc.get("text") or "") for doc in documents or []]
    avg_dl = sum(len(_tokenize(t)) for t in texts) / max(len(texts), 1)

    for doc in documents or []:
        text = str(doc.get("text") or "")
        if not text.strip():
            continue
        if method == "bm25":
            score = score_document_bm25(query, text, avg_dl=avg_dl)
        else:
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