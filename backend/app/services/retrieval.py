"""Retrieval options shared by the knowledge library and kb_retrieve."""

from __future__ import annotations

from typing import Any

CHUNK_STRATEGIES = frozenset({"sentence", "paragraph", "fixed"})
RETRIEVAL_METHODS = frozenset({"keyword", "bm25", "tfidf", "embedding", "hybrid"})
RERANKERS = frozenset({"none", "llm"})
QUERY_REWRITES = frozenset({"none", "llm"})

DEFAULT_KB_SETTINGS: dict[str, Any] = {
    "chunk_strategy": "sentence",
    "chunk_size": 800,
    "chunk_overlap": 120,
    "retrieval_method": "hybrid",
    "rrf_k": 60,
    "reranker": "none",
    "rerank_candidates": 20,
    "top_k": 5,
    "min_score": None,
    "query_rewrite": "none",
}

MAX_LIBRARY_CHUNKS = 5000


def reciprocal_rank_fusion(
    rankings: list[list[str]],
    *,
    k: int = 60,
) -> list[tuple[str, float]]:
    """Fuse ranked id lists. Rank 0 is the best hit in each list."""
    if k < 1:
        raise ValueError("rrf_k must be >= 1")
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            if not doc_id:
                continue
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


def fuse_ranked_hits(
    legs: list[list[dict[str, Any]]],
    *,
    k: int,
    top_n: int,
) -> list[dict[str, Any]]:
    rankings = [[str(hit.get("id")) for hit in leg if hit.get("id")] for leg in legs]
    fused = reciprocal_rank_fusion(rankings, k=k)
    by_id: dict[str, dict[str, Any]] = {}
    for leg in legs:
        for hit in leg:
            doc_id = str(hit.get("id") or "")
            if doc_id and doc_id not in by_id:
                by_id[doc_id] = hit
    merged: list[dict[str, Any]] = []
    for doc_id, score in fused[: max(1, top_n)]:
        hit = dict(by_id[doc_id])
        hit["score"] = round(score, 6)
        merged.append(hit)
    return merged


def normalize_kb_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    src = raw or {}
    strategy = str(src.get("chunk_strategy") or DEFAULT_KB_SETTINGS["chunk_strategy"])
    if strategy not in CHUNK_STRATEGIES:
        raise ValueError("chunk_strategy must be sentence, paragraph, or fixed")
    try:
        size = int(src.get("chunk_size") if src.get("chunk_size") is not None else DEFAULT_KB_SETTINGS["chunk_size"])
        overlap = int(
            src.get("chunk_overlap")
            if src.get("chunk_overlap") is not None
            else DEFAULT_KB_SETTINGS["chunk_overlap"]
        )
        rrf_k = int(src.get("rrf_k") if src.get("rrf_k") is not None else DEFAULT_KB_SETTINGS["rrf_k"])
        candidates = int(
            src.get("rerank_candidates")
            if src.get("rerank_candidates") is not None
            else DEFAULT_KB_SETTINGS["rerank_candidates"]
        )
        top_k = int(src.get("top_k") if src.get("top_k") is not None else DEFAULT_KB_SETTINGS["top_k"])
    except (TypeError, ValueError) as exc:
        raise ValueError("retrieval settings must be numbers") from exc
    if size < 200 or size > 4000:
        raise ValueError("chunk_size must be between 200 and 4000")
    if overlap < 0 or overlap >= size:
        raise ValueError("chunk_overlap must be >= 0 and smaller than chunk_size")
    method = str(src.get("retrieval_method") or DEFAULT_KB_SETTINGS["retrieval_method"])
    if method not in RETRIEVAL_METHODS:
        raise ValueError("retrieval_method must be keyword, bm25, tfidf, embedding, or hybrid")
    if rrf_k < 1 or rrf_k > 200:
        raise ValueError("rrf_k must be between 1 and 200")
    reranker = str(src.get("reranker") or "none")
    if reranker not in RERANKERS:
        raise ValueError("reranker must be none or llm")
    if candidates < 1 or candidates > 50:
        raise ValueError("rerank_candidates must be between 1 and 50")
    if top_k < 1 or top_k > 20:
        raise ValueError("top_k must be between 1 and 20")
    rewrite = str(src.get("query_rewrite") or "none")
    if rewrite not in QUERY_REWRITES:
        raise ValueError("query_rewrite must be none or llm")
    min_score = src.get("min_score")
    if min_score in (None, ""):
        min_score_value = None
    else:
        try:
            min_score_value = float(min_score)
        except (TypeError, ValueError) as exc:
            raise ValueError("min_score must be a number") from exc
        if min_score_value < 0:
            raise ValueError("min_score must be >= 0")
    return {
        "chunk_strategy": strategy,
        "chunk_size": size,
        "chunk_overlap": overlap,
        "retrieval_method": method,
        "rrf_k": rrf_k,
        "reranker": reranker,
        "rerank_candidates": candidates,
        "top_k": top_k,
        "min_score": min_score_value,
        "query_rewrite": rewrite,
    }


def merge_kb_settings(current: dict[str, Any] | None, patch: dict[str, Any] | None) -> dict[str, Any]:
    base = normalize_kb_settings(current)
    if not patch:
        return base
    return normalize_kb_settings({**base, **patch})


def apply_min_score(hits: list[dict[str, Any]], min_score: float | None) -> list[dict[str, Any]]:
    if min_score is None:
        return hits
    return [hit for hit in hits if float(hit.get("score") or 0) >= min_score]


def normalize_tags(raw: list[str] | None) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for item in raw or []:
        tag = str(item).strip().lower()
        if not tag or tag in seen:
            continue
        if len(tag) > 40:
            raise ValueError("tags must be 40 characters or shorter")
        seen.add(tag)
        tags.append(tag)
        if len(tags) > 12:
            raise ValueError("a document can have at most 12 tags")
    return tags
