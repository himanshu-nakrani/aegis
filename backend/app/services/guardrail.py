from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

PII_PATTERNS = {
    "email": re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    "phone": re.compile(r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
}


class GuardrailBlockedError(Exception):
    def __init__(self, message: str, node_id: str):
        super().__init__(message)
        self.node_id = node_id


class GuardrailResult(BaseModel):
    passed: bool
    message: str
    severity: str = "ok"


def validate_content(text: str, rules: dict[str, Any]) -> GuardrailResult:
    lowered = text.lower()
    blocked_keywords = [k.lower() for k in rules.get("blocked_keywords", []) if k]

    for keyword in blocked_keywords:
        if keyword in lowered:
            return GuardrailResult(
                passed=False,
                message=f"Blocked keyword detected: {keyword}",
                severity="error",
            )

    for raw_pattern in rules.get("blocked_patterns", []) or []:
        pattern = str(raw_pattern).strip()
        if not pattern:
            continue
        try:
            if re.search(pattern, text):
                return GuardrailResult(
                    passed=False,
                    message=f"Blocked pattern matched: {pattern}",
                    severity="error",
                )
        except re.error:
            return GuardrailResult(
                passed=False,
                message=f"Invalid blocked pattern: {pattern}",
                severity="error",
            )

    required_keywords = [k.lower() for k in rules.get("required_keywords", []) if k]
    for keyword in required_keywords:
        if keyword not in lowered:
            return GuardrailResult(
                passed=False,
                message=f"Required keyword missing: {keyword}",
                severity="error",
            )

    pattern = rules.get("pattern", "")
    if pattern:
        try:
            if not re.search(pattern, text):
                return GuardrailResult(
                    passed=False,
                    message=f"Text did not match required pattern: {pattern}",
                    severity="error",
                )
        except re.error:
            return GuardrailResult(
                passed=False,
                message=f"Invalid required pattern: {pattern}",
                severity="error",
            )

    min_length = rules.get("min_length")
    if min_length is not None and len(text) < int(min_length):
        return GuardrailResult(
            passed=False,
            message=f"Text is shorter than minimum length of {min_length} characters",
            severity="error",
        )

    max_length = rules.get("max_length")
    if max_length and len(text) > int(max_length):
        return GuardrailResult(
            passed=False,
            message=f"Text exceeds max length of {max_length} characters",
            severity="error",
        )

    if rules.get("detect_pii", False):
        for pii_type, regex in PII_PATTERNS.items():
            if regex.search(text):
                return GuardrailResult(
                    passed=False,
                    message=f"PII detected ({pii_type})",
                    severity="error",
                )

    return GuardrailResult(passed=True, message="Guardrail passed", severity="ok")


def apply_fail_behavior(result: GuardrailResult, fail_behavior: str, node_id: str) -> GuardrailResult:
    if result.passed:
        return result
    if fail_behavior == "warn":
        return GuardrailResult(
            passed=True,
            message=f"[WARN] {result.message}",
            severity="warn",
        )
    raise GuardrailBlockedError(result.message, node_id)