"""Guardrails against catastrophic backtracking in user-supplied regex patterns."""

from __future__ import annotations

import re

MAX_REGEX_LENGTH = 200
_NESTED_QUANTIFIER = re.compile(r"\([^)]*[+*][^)]*\)[+*]")


def validate_safe_regex(pattern: str) -> None:
    stripped = (pattern or "").strip()
    if not stripped:
        raise ValueError("Regex pattern is empty")
    if len(stripped) > MAX_REGEX_LENGTH:
        raise ValueError(f"Regex pattern exceeds {MAX_REGEX_LENGTH} characters")
    if _NESTED_QUANTIFIER.search(stripped):
        raise ValueError("Nested quantifiers are not allowed in regex patterns")
    re.compile(stripped)