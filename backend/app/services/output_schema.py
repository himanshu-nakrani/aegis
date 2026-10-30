"""JSON object schemas for agent final answers.

The schema is a small subset: one object, scalar fields, scalar arrays, and
one level of nested objects. Agents that set ``outputSchema`` must return
that object. One repair call is optional; the caller supplies it.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

_SCALAR = frozenset({"string", "number", "integer", "boolean"})
_TYPES = _SCALAR | {"array", "object"}
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def normalize_output_schema(raw: Any) -> dict[str, Any]:
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            raise ValueError("output schema is empty")
        try:
            raw = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError("output schema is not valid JSON") from exc
    if not isinstance(raw, dict):
        raise ValueError("output schema must be a JSON object")
    if raw.get("type") != "object":
        raise ValueError("output schema type must be object")
    props = raw.get("properties")
    if not isinstance(props, dict) or not props:
        raise ValueError("output schema needs at least one property")
    if len(props) > 32:
        raise ValueError("output schema allows at most 32 properties")
    cleaned: dict[str, Any] = {}
    for name, spec in props.items():
        key = str(name).strip()
        if not key:
            raise ValueError("output schema property names must be non-empty")
        cleaned[key] = _normalize_property(key, spec, depth=0)
    required_raw = raw.get("required") or []
    if not isinstance(required_raw, list):
        raise ValueError("output schema required must be a list")
    required = []
    for name in required_raw:
        key = str(name)
        if key not in cleaned:
            raise ValueError(f"required property {key!r} is not in properties")
        required.append(key)
    return {
        "type": "object",
        "properties": cleaned,
        "required": required,
        "additionalProperties": False,
    }


def schema_clause(schema: Any) -> str:
    normalized = normalize_output_schema(schema)
    return (
        "Respond with one JSON object and no other text. "
        "The object must match this schema:\n"
        + json.dumps(normalized, ensure_ascii=False)
    )


def enforce_output_schema(
    text: str,
    schema: Any,
    repair: Callable[[str, list[str], dict[str, Any]], str] | None = None,
) -> str:
    """Return canonical JSON for ``text``, or raise ValueError."""
    normalized = normalize_output_schema(schema)
    value, errors = _parse_and_check(text, normalized)
    if not errors and value is not None:
        return json.dumps(value, ensure_ascii=False)
    if repair is None:
        raise ValueError("; ".join(errors) or "output is not valid JSON")
    try:
        repaired = repair(text, errors, normalized)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"could not repair output: {exc}") from exc
    value, errors = _parse_and_check(repaired, normalized)
    if errors or value is None:
        raise ValueError("; ".join(errors) or "repaired output is not valid JSON")
    return json.dumps(value, ensure_ascii=False)


def _normalize_property(name: str, spec: Any, *, depth: int) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ValueError(f"{name} must be a schema object")
    typ = spec.get("type")
    if typ not in _TYPES:
        raise ValueError(f"{name} type must be string, number, integer, boolean, array, or object")
    if typ == "array":
        items = spec.get("items") or {"type": "string"}
        if not isinstance(items, dict) or items.get("type") not in _SCALAR:
            raise ValueError(f"{name} array items must be a scalar type")
        return {"type": "array", "items": {"type": items["type"]}}
    if typ == "object":
        if depth >= 1:
            raise ValueError(f"{name} nests objects more than one level")
        nested = spec.get("properties") or {}
        if not isinstance(nested, dict):
            raise ValueError(f"{name} properties must be an object")
        if len(nested) > 16:
            raise ValueError(f"{name} allows at most 16 nested properties")
        cleaned = {
            str(key): _normalize_property(f"{name}.{key}", value, depth=depth + 1)
            for key, value in nested.items()
        }
        return {"type": "object", "properties": cleaned, "additionalProperties": False}
    return {"type": typ}


def _parse_and_check(text: str, schema: dict[str, Any]) -> tuple[dict | None, list[str]]:
    stripped = (text or "").strip()
    stripped = _FENCE.sub("", stripped).strip()
    try:
        value = json.loads(stripped)
    except json.JSONDecodeError:
        return None, ["output is not valid JSON"]
    if not isinstance(value, dict):
        return None, ["output must be a JSON object"]
    return value, _check_object(value, schema)


def _check_object(value: dict, schema: dict[str, Any]) -> list[str]:
    props: dict[str, Any] = schema.get("properties") or {}
    errors: list[str] = []
    extra = [key for key in value if key not in props]
    if extra:
        errors.append("unexpected properties: " + ", ".join(sorted(extra)))
    for name in schema.get("required") or []:
        if name not in value or value[name] is None:
            errors.append(f"{name} is required")
    for name, spec in props.items():
        if name not in value or value[name] is None:
            continue
        errors.extend(_check_value(name, value[name], spec))
    return errors


def _check_value(name: str, value: Any, spec: dict[str, Any]) -> list[str]:
    typ = spec["type"]
    if typ == "string":
        return [] if isinstance(value, str) else [f"{name} must be a string"]
    if typ == "boolean":
        return [] if isinstance(value, bool) else [f"{name} must be a boolean"]
    if typ == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            return [f"{name} must be an integer"]
        return []
    if typ == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return [f"{name} must be a number"]
        return []
    if typ == "array":
        if not isinstance(value, list):
            return [f"{name} must be an array"]
        item_type = spec["items"]["type"]
        errors = []
        for index, item in enumerate(value):
            errors.extend(_check_value(f"{name}[{index}]", item, {"type": item_type}))
        return errors
    if typ == "object":
        if not isinstance(value, dict):
            return [f"{name} must be an object"]
        return _check_object(value, spec)
    return [f"{name} has an unsupported type"]
