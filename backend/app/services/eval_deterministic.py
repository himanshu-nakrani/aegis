"""Fast deterministic evaluation strategies (exact, substring, regex, embedding)."""

from __future__ import annotations

import re
from typing import Any

from app.services.embeddings import cosine_similarity_vectors, embed_text

DEFAULT_SIMILARITY_THRESHOLD = 0.75


def _score_dict(
    *,
    eval_type: str,
    passed: bool,
    match_score: float,
    reasoning: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    aggregate = round(1.0 + match_score * 4.0, 2)
    payload: dict[str, Any] = {
        "eval_type": eval_type,
        "deterministic": True,
        "passed": passed,
        "match_score": round(match_score, 4),
        "aggregate_score": aggregate,
        "faithfulness": aggregate,
        "helpfulness": aggregate,
        "relevance": aggregate,
        "toxicity": 1 if passed else 3,
        "reasoning": reasoning,
    }
    if extra:
        payload.update(extra)
    return payload


def evaluate_exact(content: str, expected: str) -> dict[str, Any]:
    actual = (content or "").strip()
    target = (expected or "").strip()
    passed = actual == target
    return _score_dict(
        eval_type="exact",
        passed=passed,
        match_score=1.0 if passed else 0.0,
        reasoning="Exact match" if passed else f"Expected '{target[:120]}', got '{actual[:120]}'",
        extra={"expected": target},
    )


def evaluate_substring(content: str, expected: str) -> dict[str, Any]:
    actual = content or ""
    needle = (expected or "").strip()
    if not needle:
        return _score_dict(
            eval_type="substring",
            passed=False,
            match_score=0.0,
            reasoning="Substring check requires a non-empty expected value",
        )
    passed = needle.lower() in actual.lower()
    return _score_dict(
        eval_type="substring",
        passed=passed,
        match_score=1.0 if passed else 0.0,
        reasoning=f"Substring '{needle[:80]}' found" if passed else f"Substring '{needle[:80]}' not found",
        extra={"expected_substring": needle},
    )


def evaluate_regex(content: str, pattern: str) -> dict[str, Any]:
    expr = (pattern or "").strip()
    if not expr:
        return _score_dict(
            eval_type="regex",
            passed=False,
            match_score=0.0,
            reasoning="Regex check requires a pattern",
        )
    try:
        matched = re.search(expr, content or "", re.IGNORECASE | re.MULTILINE)
    except re.error as exc:
        return _score_dict(
            eval_type="regex",
            passed=False,
            match_score=0.0,
            reasoning=f"Invalid regex pattern: {exc}",
            extra={"pattern": expr},
        )
    passed = matched is not None
    return _score_dict(
        eval_type="regex",
        passed=passed,
        match_score=1.0 if passed else 0.0,
        reasoning=f"Pattern '{expr[:80]}' matched" if passed else f"Pattern '{expr[:80]}' did not match",
        extra={"pattern": expr, "match": matched.group(0)[:120] if matched else None},
    )


def evaluate_embedding_similarity(
    content: str,
    baseline: str,
    *,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> dict[str, Any]:
    reference = (baseline or "").strip()
    if not reference:
        return _score_dict(
            eval_type="embedding",
            passed=False,
            match_score=0.0,
            reasoning="Embedding similarity requires a baseline answer",
        )
    similarity = cosine_similarity_vectors(embed_text(content or ""), embed_text(reference))
    passed = similarity >= threshold
    return _score_dict(
        eval_type="embedding",
        passed=passed,
        match_score=max(0.0, min(1.0, similarity)),
        reasoning=(
            f"Cosine similarity {similarity:.3f} ≥ threshold {threshold:.3f}"
            if passed
            else f"Cosine similarity {similarity:.3f} < threshold {threshold:.3f}"
        ),
        extra={
            "similarity": round(similarity, 4),
            "threshold": threshold,
            "baseline_preview": reference[:160],
        },
    )


def run_deterministic_evaluation(eval_type: str, content: str, meta: dict[str, Any]) -> dict[str, Any]:
    normalized = (eval_type or "exact").lower()
    if normalized == "exact":
        return evaluate_exact(content, str(meta.get("eval_expected") or ""))
    if normalized == "substring":
        return evaluate_substring(content, str(meta.get("eval_expected") or ""))
    if normalized == "regex":
        return evaluate_regex(content, str(meta.get("eval_pattern") or ""))
    if normalized == "embedding":
        threshold = meta.get("eval_similarity_threshold")
        return evaluate_embedding_similarity(
            content,
            str(meta.get("eval_baseline") or ""),
            threshold=float(threshold) if threshold is not None else DEFAULT_SIMILARITY_THRESHOLD,
        )
    raise ValueError(f"Unsupported deterministic eval type: {eval_type}")