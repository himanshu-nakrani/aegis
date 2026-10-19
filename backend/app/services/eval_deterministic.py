"""Fast deterministic evaluation strategies (exact, substring, regex, embedding)."""

from __future__ import annotations

import re
from typing import Any

from app.services.embeddings import cosine_similarity_vectors, embed_text

DEFAULT_SIMILARITY_THRESHOLD = 0.75

# L11: two-layer defense for caller-supplied regexes. `re` has no match
# timeout, so a fast structural scan (_has_nested_quantifier) rejects the
# classic catastrophic shapes — quantified groups containing quantified atoms
# (`(a+)+`, `(a?)*`, `((a)+)+`) and quantified alternations that can match
# empty or overlap (`(|a)*`, `(a|ab)*`) — while the `regex` module's match
# timeout bounds whatever the scan misses. `regex` is a declared dep; the
# `re` fallback keeps the module importable without it (heuristic only).
_REGEX_MATCH_TIMEOUT_SECONDS = 2.0

try:
    import regex as _regex_mod
except ImportError:  # pragma: no cover
    _regex_mod = None

# Skeleton sentinels: group bodies and literals are replaced so the scan sees
# structure, not characters. Char classes keep per-text identity so branch
# overlap checks can tell [0-9] from [a-z].
_QGROUP_ATOM = "\ue000"   # quantified group, collapsed
_GROUP_ATOM = "\ue001"    # unquantified group, collapsed
_ESC_ATOM = "\ue002"      # escape sequence / comment / bare flags

_CHAR_CLASS_RE = re.compile(r"\[(?:\\.|[^\]\\])*\]")
_INNERMOST_GROUP_RE = re.compile(r"\(([^()]*)\)([+*?]|\{\d+(?:,\d*)?\}|\{,\d+\})?")
_INNER_QUANTIFIER_RE = re.compile(r"[+*?{]|" + _QGROUP_ATOM)


def _regex_skeleton(expr: str) -> str:
    """Normalize a pattern to its structure: escapes and character classes
    become marker atoms and every group opener becomes a plain ``(``."""
    s = re.sub(r"\\.", _ESC_ATOM, expr)
    classes: dict[str, str] = {}

    def _class_atom(m: re.Match) -> str:
        cls = m.group(0)
        if cls not in classes:
            classes[cls] = chr(0xE010 + len(classes))
        return classes[cls]

    s = _CHAR_CLASS_RE.sub(_class_atom, s)
    s = re.sub(r"\(\?#[^)]*\)", _ESC_ATOM, s)
    s = re.sub(r"\(\?[aiLmsux-]*\)", _ESC_ATOM, s)
    s = re.sub(r"\(\?[aiLmsux-]*:", "(", s)
    s = re.sub(r"\(\?P<[A-Za-z_]\w*>", "(", s)
    s = re.sub(r"\(\?P=[A-Za-z_]\w*\)", _ESC_ATOM, s)
    s = re.sub(r"\(\?<?[=!>]", "(", s)
    return s


def _alternation_risks_backtracking(content: str) -> bool:
    """A quantified alternation backtracks catastrophically when a branch can
    match empty or branches share a leading literal (`(a|a)*`, `(a|ab)+`).
    Marker-atom heads (classes, nested groups) can't be compared cheaply and
    are allowed through — the match timeout bounds them."""
    branches = content.split("|")
    if any(b == "" for b in branches):
        return True
    heads: set[str] = set()
    for branch in branches:
        head = branch[0]
        if head >= _QGROUP_ATOM:
            continue
        if head == "." or head in heads:
            return True
        heads.add(head)
    return False


def _has_nested_quantifier(expr: str) -> bool:
    """Iterative innermost-group scan: a quantified group whose content holds
    a quantified atom or a risky alternation is the catastrophic shape. Each
    resolved group collapses to a marker atom so nesting like ``((a)+)+``
    surfaces one level per pass."""
    s = _regex_skeleton(expr)
    for _ in range(len(s)):
        m = _INNERMOST_GROUP_RE.search(s)
        if not m:
            return False
        content, quantified = m.group(1), bool(m.group(2))
        if quantified and (
            _INNER_QUANTIFIER_RE.search(content) is not None
            or ("|" in content and _alternation_risks_backtracking(content))
        ):
            return True
        s = s[: m.start()] + (_QGROUP_ATOM if quantified else _GROUP_ATOM) + s[m.end():]
    return False


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
        # Deterministic evals do not score toxicity; leave null so averages
        # are not polluted by a synthetic "3" on every failure.
        "toxicity": None,
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
    # L11: Python re has no match timeout — reject the classic catastrophic-
    # backtracking shapes (quantified groups over quantified atoms or risky
    # alternations) and cap length before compiling a caller-supplied pattern.
    if len(expr) > 500:
        return _score_dict(
            eval_type="regex",
            passed=False,
            match_score=0.0,
            reasoning="Regex pattern exceeds 500 characters",
            extra={"pattern": expr[:80]},
        )
    if _has_nested_quantifier(expr):
        return _score_dict(
            eval_type="regex",
            passed=False,
            match_score=0.0,
            reasoning="Regex pattern rejected: nested quantifiers risk catastrophic backtracking",
            extra={"pattern": expr[:80]},
        )
    pattern_errors = (re.error,) if _regex_mod is None else (_regex_mod.error,)
    try:
        if _regex_mod is not None:
            # Hard bound: a shape the scan misses degrades to a failed eval,
            # not a hung run.
            matched = _regex_mod.search(
                expr,
                content or "",
                _regex_mod.IGNORECASE | _regex_mod.MULTILINE,
                timeout=_REGEX_MATCH_TIMEOUT_SECONDS,
            )
        else:
            matched = re.search(expr, content or "", re.IGNORECASE | re.MULTILINE)
    except TimeoutError:
        return _score_dict(
            eval_type="regex",
            passed=False,
            match_score=0.0,
            reasoning="Regex evaluation timed out — pattern likely backtracks catastrophically",
            extra={"pattern": expr[:80]},
        )
    except pattern_errors as exc:
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


def evaluate_json_schema(content: str) -> dict[str, Any]:
    """Pass when the output parses as JSON (schema-shaped correctness gate)."""
    import json as _json

    try:
        _json.loads(content)
        passed = True
        reason = "Output is valid JSON"
    except Exception as exc:  # noqa: BLE001
        passed = False
        reason = f"Invalid JSON: {exc}"
    score = 5 if passed else 1
    return {
        "eval_type": "json_schema",
        "passed": passed,
        "aggregate_score": float(score),
        "faithfulness": score,
        "helpfulness": score,
        "relevance": score,
        "toxicity": 1,
        "reasoning": reason,
    }


def evaluate_numeric(content: str, expected: str, *, tolerance: float = 0.0) -> dict[str, Any]:
    """Compare the first number in the output against an expected value."""
    import re as _re

    match = _re.search(r"-?\d+(?:\.\d+)?", content or "")
    try:
        expected_value = float(expected)
    except (TypeError, ValueError):
        expected_value = None
    actual = float(match.group(0)) if match else None
    passed = (
        actual is not None
        and expected_value is not None
        and abs(actual - expected_value) <= tolerance
    )
    score = 5 if passed else 1
    return {
        "eval_type": "numeric",
        "passed": passed,
        "aggregate_score": float(score),
        "faithfulness": score,
        "helpfulness": score,
        "relevance": score,
        "toxicity": 1,
        "reasoning": (
            f"actual={actual} expected={expected_value} tolerance={tolerance}"
        ),
    }


def run_deterministic_evaluation(eval_type: str, content: str, meta: dict[str, Any]) -> dict[str, Any]:
    normalized = (eval_type or "exact").lower()
    if normalized == "exact":
        return evaluate_exact(content, str(meta.get("eval_expected") or ""))
    if normalized == "substring":
        return evaluate_substring(content, str(meta.get("eval_expected") or ""))
    if normalized == "regex":
        return evaluate_regex(content, str(meta.get("eval_pattern") or ""))
    if normalized == "json_schema":
        return evaluate_json_schema(content)
    if normalized == "numeric":
        tolerance = meta.get("eval_tolerance")
        return evaluate_numeric(
            content,
            str(meta.get("eval_expected") or ""),
            tolerance=float(tolerance) if tolerance is not None else 0.0,
        )
    if normalized == "embedding":
        threshold = meta.get("eval_similarity_threshold")
        return evaluate_embedding_similarity(
            content,
            str(meta.get("eval_baseline") or ""),
            threshold=float(threshold) if threshold is not None else DEFAULT_SIMILARITY_THRESHOLD,
        )
    raise ValueError(f"Unsupported deterministic eval type: {eval_type}")