"""Inbound OTLP/JSON trace ingestion: external OTel exports → Aegis rows.

Accepts an OTLP/JSON ``resourceSpans`` envelope (the shape an OpenTelemetry
collector's ``otlphttp``/``otlp`` exporter or a ``logging`` exporter emits)
plus the GenAI semantic-convention attributes, and lands them as the same
trace primitives the executor writes: ``WorkflowRun`` + ``NodeResult`` (one
per root span) + ``RunSpan`` (descendants) + ``LlmCall`` (model invocations).

Attribute mapping (OTLP/GenAI → Aegis):

    resource.attributes.service.name        → workflow_name (unless overridden)
    span.name                               → RunSpan.name / NodeResult.node_label
    span.startTimeUnixNano/endTimeUnixNano  → duration_ms (+ run started/completed)
    span.status.code == STATUS_CODE_ERROR   → status "failed" (else "completed")
    span.trace_id/span_id/parent_span_id    → attributes (provenance)
    gen_ai.operation.name ∈ {chat, generate_content, text_completion, embeddings}
      or gen_ai.request.model present       → kind "llm_call" (+ LlmCall row)
    gen_ai.tool.name present                → kind "tool_call"
    gen_ai.agent.name present               → kind "agent_step"
    otherwise                               → kind "agent_step" (generic external span)
    gen_ai.response.model or .request.model → attributes.model / LlmCall.model
    gen_ai.system / gen_ai.provider.name    → attributes.system
    gen_ai.usage.input_tokens               → tokens.prompt / LlmCall.prompt_tokens
    gen_ai.usage.output_tokens              → tokens.completion / LlmCall.completion_tokens
    gen_ai.usage.total_tokens (or in+out)   → tokens.total / LlmCall.total_tokens
    gen_ai.prompt / gen_ai.completion       → LlmCall.prompt_text / completion_text
    gen_ai.cost_usd or aegis.cost_usd       → RunSpan.cost_usd / LlmCall.cost_usd
    any other attribute                     → preserved verbatim in attributes_json

Hierarchy: spans without a parent (or whose parent is absent from the batch)
become the run's NodeResults; every descendant inherits its root ancestor's
name as ``node_id`` so the per-run /trace waterfall groups them the same way
executor-captured spans do.
"""

from __future__ import annotations

from collections import defaultdict
import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models

LLM_OPERATIONS = {"chat", "generate_content", "text_completion", "embeddings"}
TOKEN_ALIASES = {
    "prompt": ("gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens"),
    "completion": ("gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens"),
    "thinking": ("gen_ai.usage.thinking_tokens",),
    "total": ("gen_ai.usage.total_tokens",),
}
STATUS_ERROR_CODES = {"STATUS_CODE_ERROR", "ERROR", 2}


def is_otlp_payload(payload: dict) -> bool:
    """Auto-detect an OTLP-shaped ingest body.

    A payload is OTLP when it carries a ``resourceSpans`` (or snake_case
    ``resource_spans``) tree, or when it explicitly declares ``format: otlp``.
    """
    if not isinstance(payload, dict):
        return False
    fmt = str(payload.get("format") or "").strip().lower()
    if fmt == "otlp":
        return True
    if fmt:
        return False
    return "resourceSpans" in payload or "resource_spans" in payload


def _decode_anyvalue(value) -> object:
    """Decode an OTLP AnyValue to a plain Python scalar/list/dict."""
    if not isinstance(value, dict):
        return value
    for key in ("stringValue", "string_value"):
        if key in value:
            return value[key]
    for key in ("intValue", "int_value"):
        if key in value:
            try:
                return int(value[key])
            except (TypeError, ValueError):
                return value[key]
    for key in ("doubleValue", "double_value"):
        if key in value:
            try:
                return float(value[key])
            except (TypeError, ValueError):
                return value[key]
    for key in ("boolValue", "bool_value"):
        if key in value:
            return bool(value[key])
    for key in ("arrayValue", "array_value"):
        if key in value:
            inner = value[key] or {}
            return [_decode_anyvalue(v) for v in inner.get("values", [])]
    for key in ("kvlistValue", "kvlist_value"):
        if key in value:
            inner = value[key] or {}
            return {
                str(item.get("key")): _decode_anyvalue(item.get("value"))
                for item in inner.get("values", [])
                if isinstance(item, dict)
            }
    for key in ("bytesValue", "bytes_value"):
        if key in value:
            return value[key]
    return value


def _attrs(raw) -> dict:
    """Normalize span/resource attributes to a flat dict.

    Accepts the OTLP KeyValue list (``[{"key": k, "value": AnyValue}]``) and
    plain dicts — hand-rolled exporters often send the simple form.
    """
    if isinstance(raw, dict):
        return {str(k): _decode_anyvalue(v) for k, v in raw.items()}
    out: dict = {}
    for item in raw or []:
        if isinstance(item, dict) and "key" in item:
            out[str(item["key"])] = _decode_anyvalue(item.get("value"))
    return out


def _nano(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _nano_to_dt(ns: int | None) -> datetime | None:
    if ns is None:
        return None
    if ns < 0 or ns > 253_402_300_799_000_000_000:  # L6: year 0001..9999 bound
        return None
    try:
        return datetime.fromtimestamp(ns / 1e9, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        # Far-future/malformed nanos from broken emitters must not 500 ingest;
        # the span keeps its duration but loses absolute placement.
        return None


# NodeResult.latency_ms, RunSpan.duration_ms, and LlmCall.latency_ms are
# Integer columns. Two timestamps inside the year-9999 window can still be
# far enough apart to overflow int32 and 500 the insert.
_INT32_MAX = 2_147_483_647


def _bounded_duration_ms(start_ns: int | None, end_ns: int | None) -> int | None:
    if start_ns is None or end_ns is None:
        return None
    raw = int((end_ns - start_ns) / 1e6)
    if raw < 0:
        return 0
    if raw > _INT32_MAX:
        return _INT32_MAX
    return raw


def _coerce_output_text(value: Any) -> str | None:
    """L6: GenAI envelopes may carry structured output (dict/list). Text
    columns reject those on Postgres — serialize deterministically so both
    dialects store the same value."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(value)


def _span_status(span: dict) -> str:
    status = span.get("status") or {}
    if not isinstance(status, dict):
        return "completed"
    code = status.get("code", "STATUS_CODE_UNSET")
    if code in STATUS_ERROR_CODES or str(code).upper() in {
        "STATUS_CODE_ERROR",
        "ERROR",
        "2",
    }:
        return "failed"
    return "completed"


def _span_kind(span: dict, attrs: dict) -> str:
    op = str(attrs.get("gen_ai.operation.name") or "").lower()
    if op in LLM_OPERATIONS or attrs.get("gen_ai.request.model") or attrs.get(
        "gen_ai.response.model"
    ):
        return "llm_call"
    if attrs.get("gen_ai.tool.name"):
        return "tool_call"
    if op in {"invoke_agent", "create_agent", "execute_tool"}:
        return "tool_call" if op == "execute_tool" else "agent_step"
    return "agent_step"


def _tokens(attrs: dict) -> dict:
    out: dict = {}
    for target, aliases in TOKEN_ALIASES.items():
        for alias in aliases:
            value = attrs.get(alias)
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                out[target] = int(value)
                break
    if "total" not in out:
        parts = out.get("prompt", 0) + out.get("completion", 0)
        if parts:
            out["total"] = parts
    return out


def _model(attrs: dict) -> str | None:
    for key in ("gen_ai.response.model", "gen_ai.request.model", "model"):
        value = attrs.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _collect_spans(payload: dict) -> list[tuple[dict, dict]]:
    """Flatten resourceSpans → [(span, resource_attrs)]."""
    resource_spans = (
        payload.get("resourceSpans") or payload.get("resource_spans") or []
    )
    collected: list[tuple[dict, dict]] = []
    for rs in resource_spans:
        if not isinstance(rs, dict):
            continue
        resource_attrs = _attrs((rs.get("resource") or {}).get("attributes"))
        scope_spans = (
            rs.get("scopeSpans")
            or rs.get("scope_spans")
            or rs.get("instrumentationLibrarySpans")
            or []
        )
        for ss in scope_spans:
            for span in (ss.get("spans") or []) if isinstance(ss, dict) else []:
                if isinstance(span, dict):
                    collected.append((span, resource_attrs))
    return collected


def _service_name(spans_with_resource: list[tuple[dict, dict]]) -> str | None:
    for _, res_attrs in spans_with_resource:
        name = res_attrs.get("service.name")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return None


def resolve_external_workflow(
    db: Session, user_id: UUID, workflow_name: str
) -> tuple[models.Workflow, models.WorkflowVersion]:
    """Find-or-create the external workflow + version for ingested traces.

    M10: external workflows live in a reserved "[external]" namespace so an
    ingested service name can never resolve to (and pollute the eval history
    of) a user's real workflow. L6: two batches racing a new name converge
    via savepoint + reselect instead of 500ing — the API layer commits, so
    rescue with begin_nested here and let the caller's commit persist.
    """
    raw = (workflow_name or "").strip() or "otlp-agent"
    name = raw if raw.startswith("[external] ") else f"[external] {raw}"
    name = name[:255]
    workflow = (
        db.query(models.Workflow)
        .filter(
            models.Workflow.user_id == user_id,
            models.Workflow.name == name,
        )
        .first()
    )
    if workflow is None:
        from sqlalchemy.exc import IntegrityError

        try:
            with db.begin_nested():
                workflow = models.Workflow(
                    user_id=user_id,
                    name=name,
                    description="External agent (ingested traces)",
                )
                db.add(workflow)
                db.flush()
        except IntegrityError:
            # Lost the create race (or hit a legacy duplicate): reselect.
            workflow = (
                db.query(models.Workflow)
                .filter(
                    models.Workflow.user_id == user_id,
                    models.Workflow.name == name,
                )
                .order_by(models.Workflow.created_at.asc())
                .first()
            )
            assert workflow is not None
    version = (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow.id)
        .order_by(models.WorkflowVersion.version_number.desc())
        .first()
    )
    if version is None:
        version = models.WorkflowVersion(
            workflow_id=workflow.id,
            version_number=1,
            graph_json={"nodes": [], "edges": [], "external": True},
        )
        db.add(version)
        db.flush()
    return workflow, version


def ingest_otlp_run(
    db: Session, user_id: UUID, payload: dict
) -> dict:
    """Land an OTLP/GenAI envelope as a WorkflowRun with spans + llm calls.

    Returns summary counters; raises ValueError on un-ingestable payloads
    (empty span list, missing times) so the API layer can answer 400.
    """
    spans_with_resource = _collect_spans(payload)
    if not spans_with_resource:
        raise ValueError("no spans found in resourceSpans payload")

    workflow_name = (
        str(payload.get("workflow_name") or "").strip()
        or _service_name(spans_with_resource)
        or "otlp-agent"
    )[:255]
    workflow, version = resolve_external_workflow(db, user_id, workflow_name)

    # Flatten + normalize each span once.
    normalized: list[dict] = []
    id_map: dict[str, dict] = {}
    for span, res_attrs in spans_with_resource:
        attrs = _attrs(span.get("attributes"))
        for key, value in res_attrs.items():
            attrs.setdefault(f"resource.{key}", value)
        start_ns = _nano(
            span.get("startTimeUnixNano") or span.get("start_time_unix_nano")
        )
        end_ns = _nano(
            span.get("endTimeUnixNano") or span.get("end_time_unix_nano")
        )
        duration_ms = _bounded_duration_ms(start_ns, end_ns)
        span_id = str(
            span.get("spanId") or span.get("span_id") or ""
        ) or None
        parent_id = str(
            span.get("parentSpanId") or span.get("parent_span_id") or ""
        ) or None
        entry = {
            "name": str(span.get("name") or "span")[:255],
            "span_id": span_id,
            "parent_id": parent_id,
            "trace_id": str(
                span.get("traceId") or span.get("trace_id") or ""
            ) or None,
            "status": _span_status(span),
            "start": _nano_to_dt(start_ns),
            "end": _nano_to_dt(end_ns),
            "duration_ms": duration_ms,
            "kind": _span_kind(span, attrs),
            "model": _model(attrs),
            "tokens": _tokens(attrs),
            "cost_usd": attrs.get("gen_ai.cost_usd")
            or attrs.get("aegis.cost_usd"),
            "attributes": attrs,
        }
        normalized.append(entry)
        if span_id:
            id_map[span_id] = entry

    # Group spans by trace id so a collector batch carrying several traces
    # lands as one run PER trace — otherwise a failure in one request would
    # mark unrelated requests failed and merge their timing, tokens, and cost.
    # Spans without a trace id share a single synthetic group.
    groups: dict[str, list[dict]] = defaultdict(list)
    for entry in normalized:
        groups[entry.get("trace_id") or ""].append(entry)

    total_spans = 0
    total_node_results = 0
    total_llm_calls = 0
    runs: list[models.WorkflowRun] = []

    for trace_key, group in groups.items():
        # Parent resolution is scoped to the trace: a parent in another trace
        # must not pull a span across run boundaries.
        group_id_map = {e["span_id"]: e for e in group if e.get("span_id")}

        def _root_of(entry: dict, _map=group_id_map) -> dict:
            seen: set[int] = set()
            node = entry
            while (
                node.get("parent_id")
                and node["parent_id"] in _map
                and id(node) not in seen
            ):
                seen.add(id(node))
                node = _map[node["parent_id"]]
            return node

        roots = [e for e in group if _root_of(e) is e]
        started = [e["start"] for e in group if e["start"]]
        completed = [e["end"] for e in group if e["end"]]
        run_status = (
            "failed" if any(e["status"] == "failed" for e in group) else "completed"
        )
        group_tokens = sum(e["tokens"].get("total") or 0 for e in group)
        group_cost = sum(
            float(e["cost_usd"]) for e in group
            if isinstance(e["cost_usd"], (int, float))
        )
        trace_id = trace_key or None

        metrics: dict = {
            "ingested": True,
            "format": "otlp",
            "spans": len(group),
        }
        if group_tokens:
            metrics["total_tokens"] = group_tokens
        if group_cost:
            metrics["total_cost_usd"] = group_cost

        run = models.WorkflowRun(
            workflow_version_id=version.id,
            status=run_status,
            input_text=str(payload.get("input") or ""),
            final_output=_coerce_output_text(payload.get("output")),
            metrics_json=metrics,
            started_at=min(started) if started else datetime.now(timezone.utc),
            completed_at=max(completed) if completed else None,
            session_id=(trace_id or "")[:128] or None,
        )
        db.add(run)
        db.flush()
        runs.append(run)

        group_llm_calls = 0
        for entry in group:
            root = _root_of(entry)
            root_id = str(root["name"])[:128]
            if entry is root:
                # Root spans are the run's "nodes": they keep the per-run trace
                # waterfall rendering (parent spans synthesize from NodeResults).
                db.add(
                    models.NodeResult(
                        run_id=run.id,
                        node_id=root_id,
                        node_type="external",
                        node_label=entry["name"],
                        status=entry["status"],
                        output=None,
                        latency_ms=entry["duration_ms"],
                        created_at=entry["end"] or datetime.now(timezone.utc),
                    )
                )
            else:
                db.add(
                    models.RunSpan(
                        run_id=run.id,
                        node_id=root_id,
                        kind=entry["kind"],
                        name=entry["name"],
                        status=entry["status"],
                        duration_ms=entry["duration_ms"],
                        attributes_json={
                            **entry["attributes"],
                            "otlp_span_id": entry["span_id"],
                            "otlp_parent_span_id": entry["parent_id"],
                        },
                        tokens_json=entry["tokens"] or None,
                        cost_usd=entry["cost_usd"]
                        if isinstance(entry["cost_usd"], (int, float))
                        else None,
                        created_at=entry["end"] or datetime.now(timezone.utc),
                    )
                )
            if entry["kind"] == "llm_call":
                group_llm_calls += 1
                db.add(
                    models.LlmCall(
                        run_id=run.id,
                        node_id=root_id,
                        model=str(entry.get("model") or "")[:128] or None,
                        prompt_text=(
                            str(entry["attributes"].get("gen_ai.prompt"))
                            if entry["attributes"].get("gen_ai.prompt")
                            is not None
                            else None
                        ),
                        completion_text=(
                            str(entry["attributes"].get("gen_ai.completion"))
                            if entry["attributes"].get("gen_ai.completion")
                            is not None
                            else None
                        ),
                        prompt_tokens=entry["tokens"].get("prompt"),
                        completion_tokens=entry["tokens"].get("completion"),
                        thinking_tokens=entry["tokens"].get("thinking"),
                        total_tokens=entry["tokens"].get("total"),
                        cost_usd=entry["cost_usd"]
                        if isinstance(entry["cost_usd"], (int, float))
                        else None,
                        latency_ms=entry["duration_ms"],
                        created_at=entry["end"] or datetime.now(timezone.utc),
                    )
                )
        total_spans += len(group)
        total_node_results += len(roots)
        total_llm_calls += group_llm_calls

    return {
        "run": runs[0],
        "runs": runs,
        "workflow": workflow,
        "spans": total_spans,
        "node_results": total_node_results,
        "llm_calls": total_llm_calls,
    }
