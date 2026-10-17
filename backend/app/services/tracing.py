"""OpenTelemetry tracing for workflow execution, HTTP requests and model calls.

One TracerProvider per process, up to two export destinations:

* the generic OTLP endpoint (``otel_exporter_endpoint``), exporting spans as-is;
* LangSmith (``langsmith_enabled``), exporting through :class:`LangSmithSpanExporter`
  which sanitizes every span *on the export path* — content (prompts, outputs,
  tool arguments, retrieved text, error messages) is dropped unless
  ``langsmith_capture_content`` is set, secrets/credentials are always dropped,
  and spans are mapped onto LangSmith run types.

Each persisted execution attempt is its own trace root (``workflow_run_span``)
linked — not parented — to whatever request initiated it, so a long run never
outlives, or nests inside, an HTTP request trace.
"""

from __future__ import annotations

import json
import logging
import re
from contextlib import contextmanager
from typing import Any, Generator, Iterable, Sequence

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
from opentelemetry.trace import Link, Span, SpanContext, Status, StatusCode, TraceFlags

logger = logging.getLogger("aegis.tracing")

_tracer: trace.Tracer | None = None
_provider: TracerProvider | None = None
_enabled = False
_langsmith_export = False
# False when another provider already owned OTel's set-once global: ADK's own spans
# (agent/model/tool) then never reach our exporters. Surfaced on /health.
_global_provider_owned = True

# Attempts retained on run.metrics_json["trace_attempts"] (oldest dropped first).
MAX_TRACE_ATTEMPTS = 20
_MAX_CONTENT_CHARS = 8000


def is_tracing_enabled() -> bool:
    return _enabled


def is_langsmith_export_enabled() -> bool:
    return _langsmith_export


def adk_spans_exported() -> bool:
    """Whether ADK-native spans reach our exporters (needs ownership of the global)."""
    return _enabled and _global_provider_owned


def _content_capture_enabled() -> bool:
    from app.config import settings

    return bool(settings.langsmith_capture_content)


def _parse_headers(raw: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for part in raw.split(","):
        piece = part.strip()
        if not piece or "=" not in piece:
            continue
        key, value = piece.split("=", 1)
        headers[key.strip()] = value.strip()
    return headers


# ---------------------------------------------------------------------------
# LangSmith export: endpoint, sanitization, run-type mapping
# ---------------------------------------------------------------------------

_CONTENT_KEYS = frozenset(
    {
        "gcp.vertex.agent.llm_request",
        "gcp.vertex.agent.llm_response",
        "gcp.vertex.agent.tool_call_args",
        "gcp.vertex.agent.tool_response",
        "gcp.vertex.agent.data",
        "input.value",
        "output.value",
        "gen_ai.input.messages",
        "gen_ai.output.messages",
        "gen_ai.system_instructions",
        "gen_ai.tool.call.arguments",
        "gen_ai.tool.call.result",
        "http.request.body.content",
        "http.response.body.content",
    }
)
_CONTENT_PREFIXES = (
    "gen_ai.prompt",
    "gen_ai.completion",
    "gen_ai.content.",
    "gen_ai.input.",
    "gen_ai.output.",
    "gen_ai.system_instructions",
    "gen_ai.tool.call.",
    "llm.input_messages",
    "llm.output_messages",
    "llm.invocation_parameters",
    "llm.request.functions",
    "traceloop.entity.input",
    "traceloop.entity.output",
    "retrieval.documents",
    "tool_arguments",
    "tools",
    "prompt",
    "all_messages_events",
    "events",
    "metadata",
)
_SECRET_KEY_PARTS = (
    "api_key",
    "api-key",
    "apikey",
    "authorization",
    "password",
    "passwd",
    "secret",
    "cookie",
    "credential",
)
_HEADER_PREFIXES = ("http.request.header.", "http.response.header.")
# Bare "token" needs boundary-aware matching: usage keys like
# gen_ai.usage.input_tokens / token_count must not redact, while auth_token /
# access_token / api-token / a bare "token" key must. Mirrors the exclusions
# in _SECRET_KV_PATTERN.
_SECRET_TOKEN_RE = re.compile(
    r"(?i)(?<![a-z0-9_])(?:auth[_-]?|access[_-]?|refresh[_-]?|api[_-]?)?token(?![a-z0-9_]|s\b)"
)
_SECRET_KV_PATTERN = re.compile(
    r"""(?ix)
    (["']?(?:[\w.-]*?(?:password|passwd|secret|api[_-]?key|apikey|(?<!max_)(?<!prompt_)(?<!completion_)(?<!total_)(?<!input_)(?<!output_)token(?!s|_count|_limit)|authorization|credential|cookie))["']?
     \s*[:=]\s*)
    (?:\[REDACTED\]|"[^"]*"|'[^']*'|[^\s,;&}\]]+)
    """
)
_SECRET_VALUE_PATTERNS = (
    re.compile(r"(?i)bearer\s+[a-z0-9._~+/=-]{8,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"\baegis_(?:inv|wh|chat)_[A-Za-z0-9_-]{8,}"),
    re.compile(r"\blsv2_[A-Za-z0-9_]{8,}"),
)
_SUMMARY_USAGE_KEYS = (
    "gen_ai.request.model",
    "gen_ai.response.model",
    "gen_ai.usage.input_tokens",
    "gen_ai.usage.output_tokens",
    "gen_ai.usage.cost_usd",
)


def langsmith_traces_endpoint(base: str) -> str:
    """Full OTLP traces URL for a LangSmith API base.

    ``base`` is the LangSmith *API* base: ``https://api.smith.langchain.com`` for
    SaaS (or the eu./aws./apac. host), ``https://<host>/api/v1`` self-hosted. The
    OTLP base is ``<base>/otel`` and the traces signal path is ``/v1/traces``.

    ``OTLPSpanExporter(endpoint=...)`` uses the URL verbatim — only the
    ``OTEL_EXPORTER_OTLP_ENDPOINT`` env fallback appends the signal path — so the
    full URL must be built here.
    """
    url = base.strip().rstrip("/")
    if url.endswith("/otel/v1/traces"):
        return url
    if url.endswith("/otel"):
        return f"{url}/v1/traces"
    return f"{url}/otel/v1/traces"


# Bounds recursion on adversarial/deeply nested captured input; past this depth a
# subtree is replaced wholesale rather than walked (safe over exact).
_MAX_SCRUB_DEPTH = 12


def _redact_structure(value: Any, depth: int = 0) -> Any:
    """Recursively replace the value of any secret-named field.

    Captured content (workflow input, tool args/results) is arbitrary JSON; an
    attribute-name check never sees a ``password`` field nested inside it.
    """
    if depth > _MAX_SCRUB_DEPTH:
        return "[REDACTED]"
    if isinstance(value, str):
        return _scrub_text(value)
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if isinstance(key, str) and _is_secret_key(key) else _redact_structure(item, depth + 1)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_redact_structure(item, depth + 1) for item in value]
    return value


def _scrub_text(value: str) -> str:
    """Redact token shapes and key=value secrets in free text (never JSON-parses)."""
    for pattern in _SECRET_VALUE_PATTERNS:
        value = pattern.sub("[REDACTED]", value)
    return _SECRET_KV_PATTERN.sub(r"\1[REDACTED]", value)


def _scrub_string(value: str) -> str:
    stripped = value.lstrip()
    if stripped[:1] in ("{", "["):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            parsed = None
        if isinstance(parsed, (dict, list)):
            # Redact per leaf, then serialize: the structure is never regex-edited,
            # so the output is always valid JSON.
            return json.dumps(_redact_structure(parsed), ensure_ascii=False)
    # Token shapes first ("Bearer <token>" must be consumed whole), then
    # key=value / key: value forms that aren't JSON (logs, form bodies).
    return _scrub_text(value)


def _scrub_value(value: Any) -> Any:
    if isinstance(value, str):
        return _scrub_string(value)
    if isinstance(value, (list, tuple)):
        return [_scrub_value(item) for item in value]
    return value


def _is_secret_key(key: str) -> bool:
    lowered = key.lower()
    return (
        lowered.startswith(_HEADER_PREFIXES)
        or any(part in lowered for part in _SECRET_KEY_PARTS)
        or bool(_SECRET_TOKEN_RE.search(key))
    )


# Prefixes that are only content when the key is exactly that word (``tools``,
# ``prompt``, ``events``, ``metadata`` are LangSmith-ingested Logfire/OpenInference
# names); a bare startswith would also eat unrelated keys like ``prompt_tokens``.
_EXACT_CONTENT_KEYS = frozenset(
    {"tools", "prompt", "events", "metadata", "tool_arguments", "all_messages_events"}
)


def _is_content_key(key: str) -> bool:
    if key in _CONTENT_KEYS or key in _EXACT_CONTENT_KEYS:
        return True
    return key.startswith(tuple(p for p in _CONTENT_PREFIXES if p not in _EXACT_CONTENT_KEYS))


def _truncate(text: str) -> str:
    return text if len(text) <= _MAX_CONTENT_CHARS else text[:_MAX_CONTENT_CHARS] + "…"


def _llm_messages(raw: str, *, prefix: str, response: bool) -> dict[str, str]:
    """Flatten ADK's JSON ``llm_request``/``llm_response`` into gen_ai.* messages."""
    out: dict[str, str] = {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return out
    contents: list[Any]
    if response:
        content = data.get("content") if isinstance(data, dict) else None
        contents = [content] if isinstance(content, dict) else []
    else:
        contents = data.get("contents") if isinstance(data, dict) else []
        contents = contents if isinstance(contents, list) else []
    for index, content in enumerate(contents):
        if not isinstance(content, dict):
            continue
        parts = content.get("parts") or []
        text = "\n".join(
            str(part["text"]) for part in parts if isinstance(part, dict) and part.get("text")
        )
        if not text:
            continue
        out[f"{prefix}.{index}.role"] = str(content.get("role") or ("assistant" if response else "user"))
        out[f"{prefix}.{index}.content"] = _truncate(text)
    return out


def _run_type(name: str, attrs: dict[str, Any]) -> str:
    operation = str(attrs.get("gen_ai.operation.name") or "")
    if operation in ("generate_content", "chat", "text_completion") or name.startswith(
        ("generate_content", "chat ")
    ):
        return "llm"
    if operation == "embeddings" or name.startswith("embeddings"):
        return "embedding"
    if operation == "execute_tool" or name.startswith("execute_tool") or "gen_ai.tool.name" in attrs:
        return "tool"
    return "chain"


def sanitize_span_attributes(
    name: str, attributes: dict[str, Any], *, capture_content: bool
) -> dict[str, Any]:
    """Return the attributes that may leave the process for LangSmith."""
    attrs = {key: value for key, value in attributes.items() if not _is_secret_key(key)}

    kind = str(attrs.get("langsmith.span.kind") or "") or _run_type(name, attrs)
    attrs["langsmith.span.kind"] = kind

    if kind not in ("llm", "embedding"):
        # Only the span that made the provider request carries billable usage.
        # Node summaries and ADK's wrapper `call_llm` span repeat the same
        # numbers; LangSmith sums usage across a trace, so they would double-count.
        for key in _SUMMARY_USAGE_KEYS:
            if key in attrs:
                attrs[f"aegis.summary.{key.removeprefix('gen_ai.')}"] = attrs.pop(key)

    if capture_content:
        normalized: dict[str, Any] = {}
        request = attrs.pop("gcp.vertex.agent.llm_request", None)
        response = attrs.pop("gcp.vertex.agent.llm_response", None)
        tool_args = attrs.pop("gcp.vertex.agent.tool_call_args", None)
        tool_result = attrs.pop("gcp.vertex.agent.tool_response", None)
        if request and request != "{}":
            normalized.update(_llm_messages(str(request), prefix="gen_ai.prompt", response=False))
        if response and response != "{}":
            normalized.update(_llm_messages(str(response), prefix="gen_ai.completion", response=True))
        if tool_args and tool_args != "{}":
            normalized["input.value"] = _truncate(str(tool_args))
        if tool_result and tool_result != "{}":
            normalized["output.value"] = _truncate(str(tool_result))
        attrs.update(normalized)
        attrs.pop("gcp.vertex.agent.data", None)
    else:
        attrs = {key: value for key, value in attrs.items() if not _is_content_key(key)}

    return {key: _scrub_value(value) for key, value in attrs.items()}


def _sanitize_events(events: Iterable[Event], *, capture_content: bool) -> list[Event]:
    sanitized: list[Event] = []
    for event in events:
        event_attrs = dict(event.attributes or {})
        if event.name.startswith("gen_ai.") and not capture_content:
            # gen_ai.content.prompt/completion, gen_ai.*.message, gen_ai.choice:
            # LangSmith ingests these as inputs/outputs. Drop the whole event.
            continue
        if event.name == "exception":
            keep = {"exception.type": event_attrs.get("exception.type")}
            if capture_content:
                keep["exception.message"] = event_attrs.get("exception.message")
            event_attrs = {key: value for key, value in keep.items() if value is not None}
        elif not capture_content:
            event_attrs = {}
        else:
            event_attrs = {
                key: value
                for key, value in event_attrs.items()
                if not _is_secret_key(key) and not key.startswith("exception.stacktrace")
            }
        sanitized.append(
            Event(
                event.name,
                {key: _scrub_value(value) for key, value in event_attrs.items()},
                event.timestamp,
            )
        )
    return sanitized


def _sanitize_span(span: ReadableSpan, *, capture_content: bool) -> ReadableSpan:
    status = span.status
    if not capture_content and status.description:
        status = Status(status.status_code)
    elif status.description:
        status = Status(status.status_code, _scrub_value(status.description))
    return ReadableSpan(
        name=span.name,
        context=span.context,
        parent=span.parent,
        resource=span.resource,
        attributes=sanitize_span_attributes(
            span.name, dict(span.attributes or {}), capture_content=capture_content
        ),
        events=_sanitize_events(span.events or (), capture_content=capture_content),
        links=span.links,
        kind=span.kind,
        status=status,
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )


class LangSmithSpanExporter(SpanExporter):
    """Sanitizing wrapper around an OTLP exporter pointed at LangSmith.

    A span that fails sanitization is dropped — raw spans never reach LangSmith.
    """

    def __init__(self, inner: SpanExporter, *, capture_content: bool) -> None:
        self._inner = inner
        self._capture_content = capture_content

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        clean: list[ReadableSpan] = []
        for span in spans:
            if span.kind == trace.SpanKind.SERVER:
                # HTTP request spans are infrastructure noise in LangSmith; run and
                # operation spans are detached roots (linked, never parented) so
                # nothing in LangSmith depends on them.
                continue
            if span.name == "workflow.node":
                # ADK's invoke_node spans already show every node with correct
                # nesting; Aegis's summary would list each node twice, as a flat
                # sibling of the real tree. Status/latency/guardrail detail stays in
                # the DB and the generic OTLP export.
                continue
            try:
                clean.append(_sanitize_span(span, capture_content=self._capture_content))
            except Exception:  # noqa: BLE001 — drop, never forward unsanitized
                logger.warning("Dropped span that failed LangSmith sanitization", exc_info=True)
        if not clean:
            return SpanExportResult.SUCCESS
        return self._inner.export(clean)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)


def _build_langsmith_processor(settings: Any) -> BatchSpanProcessor | None:
    if not settings.langsmith_api_key:
        logger.warning("langsmith_enabled is true but langsmith_api_key is empty; LangSmith export disabled")
        return None
    headers = {"x-api-key": settings.langsmith_api_key}
    if settings.langsmith_project:
        headers["Langsmith-Project"] = settings.langsmith_project
    inner = OTLPSpanExporter(
        endpoint=langsmith_traces_endpoint(settings.langsmith_endpoint),
        headers=headers,
        timeout=10,
    )
    exporter = LangSmithSpanExporter(inner, capture_content=bool(settings.langsmith_capture_content))
    return BatchSpanProcessor(exporter, export_timeout_millis=10000)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def init_tracing() -> None:
    """Idempotent: safe to call from both the API and the worker process."""
    global _tracer, _provider, _enabled, _langsmith_export

    from app.config import settings

    if _provider is not None:
        return

    generic = bool(settings.otel_enabled)
    if generic and not settings.otel_exporter_endpoint:
        logger.warning(
            "otel_enabled is true but otel_exporter_endpoint is empty; generic OTLP export disabled"
        )
        generic = False

    processors: list[BatchSpanProcessor] = []
    langsmith_processor = _build_langsmith_processor(settings) if settings.langsmith_enabled else None
    if generic:
        exporter_kwargs: dict[str, Any] = {"endpoint": settings.otel_exporter_endpoint, "timeout": 10}
        headers = _parse_headers(settings.otel_exporter_headers)
        if headers:
            exporter_kwargs["headers"] = headers
        processors.append(BatchSpanProcessor(OTLPSpanExporter(**exporter_kwargs), export_timeout_millis=10000))
    if langsmith_processor is not None:
        processors.append(langsmith_processor)

    if not processors:
        _enabled = False
        _langsmith_export = False
        return

    # LangSmith export traces every execution; otel_sample_rate only applies to
    # generic-only deployments.
    rate = 1.0 if langsmith_processor is not None else max(0.0, min(1.0, settings.otel_sample_rate))
    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "service.version": "0.4.0",
        }
    )
    provider = TracerProvider(resource=resource, sampler=ParentBased(TraceIdRatioBased(rate)))
    for processor in processors:
        provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    global _global_provider_owned
    _global_provider_owned = trace.get_tracer_provider() is provider
    if not _global_provider_owned:
        # OTel's global provider is set-once. ADK builds its tracer from the global,
        # so its agent/model/tool spans would bypass our exporters entirely.
        logger.error(
            "Another TracerProvider was already installed; ADK spans will not reach "
            "the configured exporters (Aegis-owned spans still do)"
        )

    _provider = provider
    # From our own provider, not the global one: OTel only lets the global be set
    # once per process, and our spans must always go through our processors.
    _tracer = provider.get_tracer("aegis", "0.4.0")
    _enabled = True
    _langsmith_export = langsmith_processor is not None
    logger.info(
        "OpenTelemetry tracing enabled",
        extra={
            "event": "tracing_init",
            "generic_endpoint": settings.otel_exporter_endpoint if generic else None,
            "langsmith": _langsmith_export,
            "langsmith_project": settings.langsmith_project if _langsmith_export else None,
            "service": settings.otel_service_name,
            "capture_content": bool(settings.langsmith_capture_content),
        },
    )


def shutdown_tracing() -> None:
    global _tracer, _provider, _enabled, _langsmith_export

    if _provider is not None:
        _provider.shutdown()
    _provider = None
    _tracer = None
    _enabled = False
    _langsmith_export = False


def _exported_context() -> SpanContext | None:
    """Context of the current span, only if it will actually be exported.

    An unsampled span still has a valid context but is non-recording; persisting
    its id would point users at a trace that was never sent.
    """
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if not ctx.is_valid or not ctx.trace_flags.sampled or not span.is_recording():
        return None
    return ctx


def get_trace_id() -> str | None:
    ctx = _exported_context()
    return format(ctx.trace_id, "032x") if ctx else None


def get_span_id() -> str | None:
    ctx = _exported_context()
    return format(ctx.span_id, "016x") if ctx else None


def span_link_from_ids(trace_id_hex: str | None, span_id_hex: str | None) -> Link | None:
    """Link to a previously recorded span (e.g. the prior attempt of a run)."""
    try:
        context = SpanContext(
            trace_id=int(trace_id_hex or "", 16),
            span_id=int(span_id_hex or "", 16),
            is_remote=True,
            trace_flags=TraceFlags(TraceFlags.SAMPLED),
        )
    except (TypeError, ValueError):
        return None
    return Link(context) if context.is_valid else None


# ---------------------------------------------------------------------------
# Spans
# ---------------------------------------------------------------------------


@contextmanager
def workflow_run_span(
    run_id: str,
    workflow_id: str | None,
    workflow_name: str | None,
    *,
    attempt: int = 1,
    attributes: dict[str, Any] | None = None,
    links: list[Link] | None = None,
) -> Generator[Span | None, None, None]:
    """Independent trace root for one execution attempt of a persisted run."""
    if not _enabled or _tracer is None:
        yield None
        return

    all_links = list(links or [])
    initiator = trace.get_current_span().get_span_context()
    if initiator.is_valid:
        # The request/scheduler span that started this run: linked, not parent.
        all_links.append(Link(initiator))

    span_attributes: dict[str, Any] = {
        "run.id": run_id,
        "workflow.id": workflow_id or "",
        "workflow.name": workflow_name or "",
        "langsmith.trace.name": workflow_name or "workflow.run",
        "langsmith.span.kind": "chain",
        "langsmith.metadata.aegis_run_id": run_id,
        "langsmith.metadata.aegis_workflow_id": workflow_id or "",
        "langsmith.metadata.aegis_execution_attempt": attempt,
    }
    for key, value in (attributes or {}).items():
        if value is None:
            continue
        span_attributes[f"langsmith.metadata.{key}"] = value
        span_attributes[f"aegis.{key}"] = value

    with _tracer.start_as_current_span(
        "workflow.run",
        context=otel_context.Context(),
        attributes=span_attributes,
        links=all_links,
    ) as span:
        yield span


def finalize_workflow_span(
    span: Span | None,
    *,
    status: str | None,
    input_text: str | None = None,
    output_text: str | None = None,
) -> None:
    """Record the terminal run outcome; failed/cancelled runs mark the span ERROR.

    ``_run_workflow`` converts failures into run status instead of raising, so the
    span would otherwise read as healthy.
    """
    if span is None or not span.is_recording():
        return
    if status:
        span.set_attribute("aegis.run_status", status)
        span.set_attribute("langsmith.metadata.aegis_run_status", status)
        if status in ("failed", "cancelled"):
            span.set_status(StatusCode.ERROR, f"run {status}")
        elif status == "completed":
            span.set_status(StatusCode.OK)
    if _content_capture_enabled():
        if input_text:
            span.set_attribute("input.value", _truncate(input_text))
        if output_text:
            span.set_attribute("output.value", _truncate(output_text))


def record_admission_failure(
    run_id: str, workflow_id: str | None, reason: str, *, attempt: int = 1
) -> None:
    """A run that never reached execution still leaves an error root span."""
    with workflow_run_span(run_id, workflow_id, None, attempt=attempt) as span:
        if span is not None:
            span.set_attribute("aegis.admission_failure", reason)
            span.set_status(StatusCode.ERROR, reason)


def _detached_context() -> tuple[otel_context.Context | None, list[Link]]:
    """Fresh root context (+link) when the active span is an HTTP request span."""
    current = trace.get_current_span()
    if getattr(current, "kind", None) == trace.SpanKind.SERVER:
        context = current.get_span_context()
        return otel_context.Context(), [Link(context)] if context.is_valid else []
    return None, []


@contextmanager
def operation_span(
    name: str, attributes: dict[str, Any] | None = None
) -> Generator[Span | None, None, None]:
    """Span for a standalone operation (playground, node test, assist, eval…).

    Nests under the active span when there is one, otherwise starts its own trace.
    """
    if not _enabled or _tracer is None:
        yield None
        return
    span_attributes: dict[str, Any] = {"langsmith.span.kind": "chain"}
    span_attributes.update({k: v for k, v in (attributes or {}).items() if v is not None})
    context, links = _detached_context()
    with _tracer.start_as_current_span(
        name, context=context, attributes=span_attributes, links=links
    ) as span:
        yield span


class ModelCallRecorder:
    """Handle yielded by :func:`model_call_span`."""

    def __init__(self, span: Span | None) -> None:
        self._span = span

    def set_usage(self, prompt: int | None, completion: int | None, total: int | None = None) -> None:
        if self._span is None:
            return
        if prompt is not None:
            self._span.set_attribute("gen_ai.usage.input_tokens", int(prompt))
        if completion is not None:
            self._span.set_attribute("gen_ai.usage.output_tokens", int(completion))
        if total is None and prompt is not None and completion is not None:
            total = int(prompt) + int(completion)
        if total is not None:
            self._span.set_attribute("gen_ai.usage.total_tokens", int(total))

    def set_usage_from(self, response: Any) -> None:
        """Duck-typed usage extraction for google-genai and litellm responses."""
        usage = getattr(response, "usage_metadata", None)
        if usage is not None:
            self.set_usage(
                getattr(usage, "prompt_token_count", None),
                getattr(usage, "candidates_token_count", None),
                getattr(usage, "total_token_count", None),
            )
            return
        usage = getattr(response, "usage", None)
        if usage is not None:
            self.set_usage(
                getattr(usage, "prompt_tokens", None),
                getattr(usage, "completion_tokens", None),
                getattr(usage, "total_tokens", None),
            )

    def set_io(self, prompt: str | None = None, completion: str | None = None) -> None:
        """Attach content only when capture is on — never built otherwise."""
        if self._span is None or not _content_capture_enabled():
            return
        if prompt:
            self._span.set_attribute("gen_ai.prompt.0.role", "user")
            self._span.set_attribute("gen_ai.prompt.0.content", _truncate(str(prompt)))
        if completion:
            self._span.set_attribute("gen_ai.completion.0.role", "assistant")
            self._span.set_attribute("gen_ai.completion.0.content", _truncate(str(completion)))


@contextmanager
def model_call_span(
    provider: str | None,
    model: str | None,
    *,
    operation: str = "chat",
) -> Generator[ModelCallRecorder, None, None]:
    """One span per provider request made outside the ADK runner."""
    if not _enabled or _tracer is None:
        yield ModelCallRecorder(None)
        return
    attributes: dict[str, Any] = {
        "langsmith.span.kind": "embedding" if operation == "embeddings" else "llm",
        "gen_ai.operation.name": operation,
        "gen_ai.request.model": model or "",
    }
    if provider:
        attributes["gen_ai.system"] = provider
    context, links = _detached_context()
    with _tracer.start_as_current_span(
        f"{operation} {model or 'model'}", context=context, attributes=attributes, links=links
    ) as span:
        yield ModelCallRecorder(span)


class NodeSpanTracker:
    """Tracks in-flight ADK node spans for a single workflow run."""

    def __init__(self) -> None:
        self._spans: dict[str, Span] = {}

    def start(self, node_id: str, node_type: str, node_label: str) -> None:
        from app.config import settings

        if not _enabled or _tracer is None or not settings.otel_node_spans:
            return
        span = _tracer.start_span(
            "workflow.node",
            attributes={
                "node.id": node_id,
                "node.type": node_type,
                "node.label": node_label,
                "langsmith.span.kind": "chain",
                "langsmith.trace.name": node_label or node_id,
            },
        )
        self._spans[node_id] = span

    def set_gen_ai_usage(self, node_id: str, usage: dict) -> None:
        """Attach OTel gen_ai semantic-convention attributes to a node span."""
        span = self._spans.get(node_id)
        if span is None:
            return
        model = usage.get("model")
        if model:
            span.set_attribute("gen_ai.request.model", str(model))
            span.set_attribute("gen_ai.response.model", str(model))
        if usage.get("prompt_tokens") is not None:
            span.set_attribute("gen_ai.usage.input_tokens", int(usage["prompt_tokens"]))
        if usage.get("completion_tokens") is not None:
            span.set_attribute("gen_ai.usage.output_tokens", int(usage["completion_tokens"]))
        if usage.get("cost_usd") is not None:
            span.set_attribute("gen_ai.usage.cost_usd", float(usage["cost_usd"]))

    def end(
        self,
        node_id: str,
        *,
        status: str,
        latency_ms: int,
        guardrail_status: str | None = None,
        error: str | None = None,
    ) -> None:
        span = self._spans.pop(node_id, None)
        if span is None:
            return

        span.set_attribute("node.status", status)
        span.set_attribute("node.latency_ms", latency_ms)
        if guardrail_status:
            span.set_attribute("node.guardrail_status", guardrail_status)
        if error:
            span.set_status(StatusCode.ERROR, error)
        elif status == "failed":
            span.set_status(StatusCode.ERROR, f"node {node_id} failed")
        else:
            span.set_status(StatusCode.OK)
        span.end()


def install_http_middleware(app: Any) -> None:
    from starlette.requests import Request

    @app.middleware("http")
    async def otel_http_middleware(request: Request, call_next):
        if not _enabled or _tracer is None:
            return await call_next(request)

        route = request.scope.get("route")
        route_path = getattr(route, "path", request.url.path)
        span_name = f"{request.method} {route_path}"

        with _tracer.start_as_current_span(
            span_name,
            kind=trace.SpanKind.SERVER,
            attributes={
                "http.method": request.method,
                "http.route": route_path,
                "http.target": request.url.path,
            },
        ) as span:
            response = await call_next(request)
            span.set_attribute("http.status_code", response.status_code)
            if response.status_code >= 500:
                span.set_status(StatusCode.ERROR)
            return response
