from __future__ import annotations

import asyncio
import json
from collections import deque
from contextlib import suppress
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Callable

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from sqlalchemy import update as _sa_update
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.approval_service import HumanApprovalDenied, clear_approval_state
from app.services.async_tasks import schedule_task
from app.services.compiler import compile_workflow
from app.services.event_bus import (
    delete_run_events,
    fetch_run_events,
    publish_run_event,
    set_active_run_ids_provider,
    set_run_event_dispatcher,
)
from app.services.persistent_memory import flush_memory_writes, load_workflow_memory, merge_memory_into_context
from app.services.workflow_context import WorkflowContext
from app.services.eval import EvalThresholdBlockedError, compute_aggregate_score
from app.services.eval_preset_service import enrich_graph_eval_presets
from app.services.prompt_service import resolve_prompt_refs
from app.services.eval_runner import run_parallel_evaluations
from app.services.llm_providers import resolve_provider_model
from app.services.observability_events import broadcast_observability_event
from app.services.quality_alerts import quality_webhook_for_run
from app.services.observability_rollups import record_run_rollup
from app.services.token_tracker import TokenTrackerPlugin
from app.services.trace_plugin import TracePlugin
from app.services.guardrail_policy_plugin import GuardrailPolicyPlugin
from app.services.quality_metrics import apply_eval_threshold
from app.services.guardrail import GuardrailBlockedError, GuardrailJudgeUnavailableError, GuardrailResult
from app.services.tracing import (
    MAX_TRACE_ATTEMPTS,
    NodeSpanTracker,
    finalize_workflow_span,
    get_span_id,
    get_trace_id,
    record_admission_failure,
    span_link_from_ids,
    workflow_run_span,
)
from app.services.webhook import dispatch_webhook

import logging

logger = logging.getLogger("aegis.executor")

class _RunEventBroker:
    """Fan out run events to every SSE subscriber of a single run.

    Each subscriber gets its own queue (mirroring
    app/services/observability_events.py) so concurrent stream clients no longer
    steal events from one another. The broker also retains the terminal event
    (stream_end / run_*) so a subscriber that attaches just before cleanup still
    observes stream termination.

    ``delivered`` tracks persisted seqs already broadcast locally (FIFO-bounded)
    so the same event arriving again via the Postgres NOTIFY listener — published
    by this process or a remote one — is deduped instead of double-delivered.
    """

    __slots__ = ("subscribers", "terminated", "delivered", "_delivered_order")

    _DELIVERED_CAP = 512

    def __init__(self) -> None:
        self.subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self.terminated = False
        self.delivered: set[int] = set()
        self._delivered_order: deque[int] = deque()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        self.subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self.subscribers.discard(queue)

    def mark_delivered(self, seq: int) -> bool:
        """Record ``seq`` as delivered; False when it was already delivered."""
        if seq in self.delivered:
            return False
        self.delivered.add(seq)
        self._delivered_order.append(seq)
        while len(self._delivered_order) > self._DELIVERED_CAP:
            self.delivered.discard(self._delivered_order.popleft())
        return True

    def broadcast(self, event: dict[str, Any]) -> None:
        if event.get("type") == "stream_end":
            self.terminated = True
        seq = event.get("seq")
        if isinstance(seq, int) and not self.mark_delivered(seq):
            return
        for queue in list(self.subscribers):
            _enqueue_event(queue, event)


_run_events: dict[str, _RunEventBroker] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}
_cleanup_tasks: set[asyncio.Task[None]] = set()
_STREAM_EVENT_TTL_SECONDS = 120

# Authoring-only run overrides (pin outputs + run-from-here), keyed by run id.
# Populated ONLY by the authenticated run-create path and consumed once by
# execute_run. Never populated by the published invoke path — guarding pin/
# run-from-here to the builder. Kept in memory so it never reaches the DB.
_authoring_overrides: dict[str, dict[str, Any]] = {}


def register_authoring_overrides(
    run_id: uuid.UUID,
    *,
    pinned_outputs: dict[str, Any] | None,
    start_node_id: str | None,
    model_override: dict[str, Any] | None = None,
) -> None:
    """Attach authoring-only pin/run-from-here/model params to a pending run."""
    if not pinned_outputs and not start_node_id and not model_override:
        return
    _authoring_overrides[str(run_id)] = {
        "pinned_outputs": pinned_outputs or {},
        "start_node_id": start_node_id,
        "model_override": model_override,
    }


def _as_utc(dt: datetime) -> datetime:
    """Normalize DB-loaded (possibly naive) datetimes to aware UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _enqueue_event(event_queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
    """Enqueue an event on a single subscriber queue; drop oldest when full."""
    try:
        event_queue.put_nowait(event)
    except asyncio.QueueFull:
        try:
            event_queue.get_nowait()
        except asyncio.QueueEmpty:
            pass
        try:
            event_queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning(
                "Dropped run event because queue is full",
                extra={"event_type": event.get("type")},
            )


async def _put_run_event(broker: _RunEventBroker, event: dict[str, Any]) -> None:
    """Persist a run event to the replay log, then broadcast to subscribers.

    ``publish_run_event`` (sync, run via to_thread) stamps the per-run ``seq``
    and emits the Postgres NOTIFY for remote processes. Persistence failures are
    logged and the event still fans out locally without a seq — durability must
    never stall a run. Events without ``run_id`` (client-side heartbeats etc.)
    skip persistence entirely.
    """
    run_id = event.get("run_id")
    if not run_id:
        broker.broadcast(event)
        return
    try:
        published = await asyncio.to_thread(publish_run_event, run_id, event)
    except Exception:
        logger.exception(
            "Failed to persist run event; broadcasting without seq",
            extra={"run_id": str(run_id), "event_type": event.get("type")},
        )
        broker.broadcast(event)
        return
    broker.broadcast(published)


def _ensure_api_key() -> None:
    from app.config import configure_runtime_env

    configure_runtime_env()


def _json_default(value: Any) -> Any:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="replace")
    return str(value)


def _normalize_text_part(text: str) -> str:
    stripped = text.strip()
    if len(stripped) >= 2 and stripped[0] == stripped[-1] == '"':
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, str):
                return parsed
        except json.JSONDecodeError:
            pass
    return stripped


def _extract_text_parts(value: Any) -> str | None:
    if not hasattr(value, "parts"):
        return None

    texts: list[str] = []
    for part in value.parts:
        text = getattr(part, "text", None)
        if text:
            texts.append(_normalize_text_part(str(text)))
            continue

        function_call = getattr(part, "function_call", None)
        if not function_call:
            continue
        args = getattr(function_call, "args", None) or {}
        if isinstance(args, dict) and args.get("response") is not None:
            texts.append(str(args["response"]))

    return "\n".join(texts) if texts else None


def _stringify_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, bytes):
        return _json_default(value)

    part_text = _extract_text_parts(value)
    if part_text:
        return part_text

    if hasattr(value, "text") and value.text:
        return str(value.text)

    if hasattr(value, "model_dump_json"):
        try:
            return value.model_dump_json()
        except Exception:
            pass

    if hasattr(value, "model_dump"):
        try:
            return json.dumps(value.model_dump(mode="json"), default=_json_default)
        except TypeError:
            return json.dumps(value.model_dump(), default=_json_default)

    if isinstance(value, (dict, list)):
        return json.dumps(value, default=_json_default)

    text = str(value)
    if text.startswith("parts=[Part(") and "text=" in text:
        match = re.search(r"text='([^']*)'|text=\"([^\"]*)\"", text)
        if match:
            return match.group(1) or match.group(2)
    return text


def _extract_text_from_event(event: Any) -> str | None:
    output = _stringify_value(getattr(event, "output", None))
    if output:
        return output
    if hasattr(event, "message") and event.message:
        return _stringify_value(event.message)
    return _stringify_value(getattr(event, "content", None))

def _extract_delta_text(event: Any) -> str | None:
    """Raw text of a partial (streaming) event.

    Unlike ``_extract_text_from_event`` this does NOT normalize or strip:
    streamed chunks must reach subscribers byte-for-byte or whitespace and
    quoting inside tokens get mangled.
    """
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None)
    if parts:
        delta = "".join(str(getattr(part, "text") or "") for part in parts)
        if delta:
            return delta
    return _extract_text_from_event(event)


def _extract_token_usage(event: Any) -> dict | None:
    usage = getattr(event, "usage_metadata", None)
    if not usage:
        return None
    return {
        "prompt_tokens": getattr(usage, "prompt_token_count", None),
        "completion_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    }


def _resolve_node_id(
    author: str | None,
    metadata: dict[str, dict],
    author_lookup: dict[str, str],
    node_path: str | None = None,
) -> str | None:
    # ADK 2.x attributes child events to the root workflow (event.author is
    # always the workflow name); the executing node lives in
    # event.node_info.path, formatted "wf@1/node_name@2". Try path segments
    # leaf-first, then fall back to the author for older event shapes.
    candidates: list[str] = []
    if node_path:
        for segment in reversed(node_path.split("/")):
            name = segment.split("@", 1)[0]
            if name:
                candidates.append(name)
    if author:
        candidates.append(author)
    for name in candidates:
        if name in author_lookup:
            return author_lookup[name]
        for node_id, meta in metadata.items():
            adk_name = meta.get("adk_name", "")
            if name == adk_name or name.endswith(f"_{node_id}"):
                return node_id
    return None


async def _commit_db(db: Session) -> None:
    await asyncio.to_thread(db.commit)


def _run_session() -> Session:
    # expire_on_commit=False: run objects (with joinedloaded version/workflow)
    # are read after commit+close; expiring them would trigger detached-instance
    # lazy loads.
    return SessionLocal(expire_on_commit=False)


def _load_run(session: Session, run_id: uuid.UUID) -> models.WorkflowRun | None:
    return (
        session.query(models.WorkflowRun)
        .options(
            joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow)
        )
        .filter(models.WorkflowRun.id == run_id)
        .first()
    )


async def _with_run_session(
    run_id: uuid.UUID,
    fn: Callable[[Session, models.WorkflowRun], Any],
    *,
    commit: bool = True,
) -> Any:
    def _work() -> Any:
        session = _run_session()
        try:
            run = _load_run(session, run_id)
            if not run:
                return None
            result = fn(session, run)
            if commit:
                session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return await asyncio.to_thread(_work)


async def _read_run_status(run_id: uuid.UUID) -> str | None:
    def _read() -> str | None:
        session = SessionLocal()
        try:
            row = (
                session.query(models.WorkflowRun.status)
                .filter(models.WorkflowRun.id == run_id)
                .first()
            )
            return row[0] if row else None
        finally:
            session.close()

    return await asyncio.to_thread(_read)


async def _consume_with_timeout(run_id: uuid.UUID, coro: Any) -> None:
    """Run the event-consumption coroutine under the run timeout, but do NOT
    count time spent paused at a human-approval node against that budget.

    A run parked in ``awaiting_approval`` may legitimately wait up to
    ``approval_timeout_seconds`` (>> ``run_timeout_seconds``); the previous
    single ``asyncio.wait_for`` killed it after ``run_timeout_seconds``. Here we
    accumulate only "active" (non-awaiting) elapsed time and re-arm the deadline
    while the run is awaiting approval, raising ``asyncio.TimeoutError`` only
    when active work exceeds the budget.
    """
    budget = float(settings.run_timeout_seconds)
    poll = 1.0
    task = asyncio.ensure_future(coro)
    active_elapsed = 0.0
    try:
        while True:
            done, _pending = await asyncio.wait({task}, timeout=poll)
            if task in done:
                task.result()  # re-raise any exception from _consume_events
                return
            # Task still running: only charge this interval if the run is not
            # currently paused awaiting human approval.
            status = await _read_run_status(run_id)
            if status != "awaiting_approval":
                active_elapsed += poll
            if active_elapsed >= budget:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                raise asyncio.TimeoutError()
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


async def _notify_observability(
    run: models.WorkflowRun,
    event_type: str,
    *,
    trace_id: str | None = None,
) -> None:
    workflow = run.version.workflow if run.version else None
    if not workflow:
        return
    metrics = run.metrics_json or {}
    payload: dict[str, Any] = {
        "type": event_type,
        "run_id": str(run.id),
        "workflow_id": str(workflow.id),
        "workflow_name": workflow.name,
        "status": run.status,
        "eval_aggregate": metrics.get("eval_aggregate"),
        "eval_passed": metrics.get("eval_passed"),
        "guardrail_blocked": bool(metrics.get("guardrail_blocked")),
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "input_text": (run.input_text or "")[:200],
    }
    resolved_trace_id = trace_id or metrics.get("trace_id")
    if resolved_trace_id:
        payload["trace_id"] = resolved_trace_id
    if run.started_at:
        end = _as_utc(run.completed_at or datetime.now(timezone.utc))
        payload["latency_ms"] = max(0, int((end - _as_utc(run.started_at)).total_seconds() * 1000))
    await broadcast_observability_event(str(workflow.user_id), payload)


def _parse_evaluation_scores(text: str | None, weights: dict | None = None) -> dict | None:
    if not text:
        return None
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            scores = {
                "faithfulness": parsed.get("faithfulness"),
                "helpfulness": parsed.get("helpfulness"),
                "relevance": parsed.get("relevance"),
                "toxicity": parsed.get("toxicity"),
                "reasoning": parsed.get("reasoning", ""),
            }
            aggregate = compute_aggregate_score(scores, weights)
            if aggregate is not None:
                scores["aggregate_score"] = aggregate
            return scores
    except json.JSONDecodeError:
        return {"raw": text}
    return None


def _parse_guardrail_status(
    node_id: str,
    text: str | None,
    guardrail_results: dict[str, GuardrailResult],
) -> tuple[str | None, str | None]:
    gr = guardrail_results.get(node_id)
    if gr:
        output = gr.output_override or gr.message
        if gr.severity == "warn":
            return ("warned", output)
        return ("passed" if gr.passed else "failed", output)
    if not text:
        return None, None
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "passed" in parsed:
            return ("passed" if parsed["passed"] else "failed", parsed.get("message", text))
    except json.JSONDecodeError:
        pass
    lowered = text.lower()
    if "blocked" in lowered or "failed" in lowered:
        return "failed", text
    if "passed" in lowered:
        return "passed", text
    return None, text

def _merge_run_metrics(run: models.WorkflowRun, updates: dict[str, Any]) -> dict[str, Any]:
    """Merge into existing metrics_json so keys like trace_id survive terminal writes."""
    metrics = dict(run.metrics_json or {})
    metrics.update(updates)
    run.metrics_json = metrics
    return metrics


_TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})


def _cas_terminal_write(
    session: Session,
    run_id: uuid.UUID,
    new_status: str,
    updates: dict[str, Any],
) -> bool:
    """Single-winner terminal write: UPDATE … WHERE status non-terminal.

    Every terminal writer funnels here so a `stop_run` landing between
    another writer's read and commit cannot be silently overwritten (and
    vice versa). Returns True for the winner; losers must skip their stale
    terminal event so subscribers never see a resurrected/overwritten fate.
    SQLite-safe (no row locks; the status predicate is the guard).
    """
    values = dict(updates)
    values["status"] = new_status
    result = session.execute(
        _sa_update(models.WorkflowRun)
        .where(
            models.WorkflowRun.id == run_id,
            ~models.WorkflowRun.status.in_(_TERMINAL_STATUSES),
        )
        .values(**values)
    )
    return int(result.rowcount or 0) == 1


def _is_cancel_requested(run: models.WorkflowRun) -> bool:
    if run.status == "cancelled":
        return True
    metrics = run.metrics_json or {}
    return bool(metrics.get("cancel_requested") or metrics.get("cancelled"))


async def _schedule_run_event_cleanup(run_key: str, run_id: uuid.UUID | None = None) -> None:
    # Hold the terminal events (incl. stream_end) for a retention window so a
    # reconnecting stream — in worker mode, served by a DIFFERENT process than
    # the one that ran the workflow — can still fetch the final result and
    # stream_end. Deleting immediately after publishing stream_end raced that
    # fetch and left the stream on heartbeats only.
    broker_at_schedule = _run_events.get(run_key)
    await asyncio.sleep(_STREAM_EVENT_TTL_SECONDS)
    # Generation guard: a resumed/retried run re-executing within the TTL
    # window reuses the same broker key. Only delete when the broker is still
    # the one we were scheduled for; otherwise the new attempt owns it.
    if _run_events.get(run_key) is not broker_at_schedule:
        return
    _run_events.pop(run_key, None)
    if run_id is not None:
        try:
            await asyncio.to_thread(delete_run_events, run_id)
        except Exception:
            logger.exception("Failed to delete run events", extra={"run_id": run_key})

async def _run_workflow(
    run_id: uuid.UUID,
    graph_json: dict,
    event_queue: _RunEventBroker,
    *,
    input_text: str,
    workflow_user_id: uuid.UUID | None,
    workflow_id: uuid.UUID | None,
    error_context: dict[str, Any] | None = None,
    authoring_overrides: dict[str, Any] | None = None,
    resume_plan: dict[str, Any] | None = None,
    session_history: list[dict[str, Any]] | None = None,
) -> None:
    guardrail_results: dict[str, GuardrailResult] = {}

    def on_guardrail(node_id: str, result: GuardrailResult) -> None:
        guardrail_results[node_id] = result

    workflow_context = WorkflowContext.from_input(input_text)
    # Deployment-scoped session reuse: prior turns are staged on the run row
    # by the invoke path and seed the context before any node runs. This is
    # independent of resume_plan — pins/checkpoints restore intra-run state;
    # session_history restores cross-run conversational state.
    if session_history:
        workflow_context.set_session_history(session_history)

    # Durable resume (from run_checkpoints): seed completed/skipped outputs
    # into the context and prune the graph so execution starts at the crash
    # frontier. Takes precedence over authoring overrides — a resumed run
    # uses its recorded checkpoints (authored pins are 'skipped' rows, so
    # they are already folded into resume_plan["pinned_outputs"]).
    if resume_plan:
        from app.services.run_authoring import (
            prune_graph_for_resume,
            seed_pinned_outputs,
        )

        pinned = resume_plan.get("pinned_outputs") or {}
        if pinned:
            seed_pinned_outputs(workflow_context, graph_json, pinned)
        # Restore the mutable INPUT captured at the last checkpoint so
        # state-mutating nodes (set_fields → input.*) that ran before the crash
        # are not lost — their output is pinned, but the side effects on shared
        # input are only in the patch. The MEMORY half is overlaid later, AFTER
        # the DB-persisted memory merge, so in-run writes win over stale rows
        # (a crash before flush never persisted them).
        _patch = resume_plan.get("context_patch") or {}
        if isinstance(_patch, dict):
            ctx = workflow_context.to_dict()
            patched_input = _patch.get("input")
            if isinstance(patched_input, dict):
                base_input = ctx.get("input")
                if isinstance(base_input, dict):
                    base_input.update(patched_input)
                else:
                    ctx["input"] = patched_input
            # Re-queue the persistent-memory writes captured before the crash so
            # end-of-run flush_memory_writes re-persists them — the nodes that
            # queued them are pinned/pruned and never re-run, so the DB would
            # otherwise keep its stale pre-crash values after resume.
            pending_memory = _patch.get("pending_memory")
            if isinstance(pending_memory, list) and pending_memory:
                ctx["_memory_pending_writes"] = list(pending_memory)
        if resume_plan.get("prune_needed"):
            graph_json = prune_graph_for_resume(
                graph_json,
                resume_plan.get("completed_ids") or set(),
                resume_plan.get("frontier_ids") or set(),
            )

    # Authoring-only pin/run-from-here: seed pinned upstream outputs into the
    # context and prune the graph to begin at start_node_id. Never reached from
    # the published invoke path (overrides are only registered on run-create).
    if authoring_overrides and not resume_plan:
        from app.services.run_authoring import (
            prune_graph_for_start,
            seed_pinned_outputs,
        )

        pinned_outputs = authoring_overrides.get("pinned_outputs") or {}
        start_node_id = authoring_overrides.get("start_node_id")
        if pinned_outputs:
            seed_pinned_outputs(workflow_context, graph_json, pinned_outputs)
        if start_node_id:
            graph_json = prune_graph_for_start(graph_json, start_node_id, pinned_outputs)

    # Experiment model-matrix runs carry a {provider, model} pair per run —
    # rewrite LLM node targets so every pair measures the same workflow logic
    # on a different model. Deliberately independent of pin/run-from-here.
    model_override = (authoring_overrides or {}).get("model_override")
    if model_override:
        from app.services.run_authoring import apply_model_override

        graph_json = apply_model_override(graph_json, model_override)

    context_ref = workflow_context.to_dict()
    # Preserve pinned last_output across the trigger passthrough so rewired
    # frontier/start nodes receive the pinned seed (not raw input) as their
    # node_input and {{last_output}} stays the latest pinned output.
    if (resume_plan and (resume_plan.get("pinned_outputs") or {})) or (
        authoring_overrides and (authoring_overrides.get("pinned_outputs") or {})
    ):
        last = context_ref.get("last_output")
        if last is not None:
            context_ref["_seeded_last_output"] = last
    run_key = str(run_id)
    context_ref["_run_id"] = run_key
    if workflow_id is not None:
        context_ref["_user_id"] = str(workflow_user_id) if workflow_user_id else None
        context_ref["_workflow_id"] = str(workflow_id)

        def _load_memory() -> Any:
            # Whole session unit of work stays inside one thread; only plain
            # values escape (SQLAlchemy sessions are not thread-safe to share).
            setup_db = _run_session()
            try:
                return load_workflow_memory(setup_db, workflow_id)
            finally:
                setup_db.close()

        persisted = await asyncio.to_thread(_load_memory)
        merge_memory_into_context(context_ref, persisted)
        # KB documents are lazy-loaded (and cached in context_ref) by the first
        # workflow-sourced kb_retrieve node that runs; see _make_kb_retrieve_fn.

    # Overlay the resume memory patch AFTER any DB merge (and also when there is
    # no workflow id, hence no merge): in-run memory writes captured at the last
    # checkpoint must win over persisted rows, since a crash before flush never
    # persisted them and the DB merge would otherwise reinstate stale values.
    if resume_plan:
        _mem_patch = (resume_plan.get("context_patch") or {}).get("memory")
        if isinstance(_mem_patch, dict):
            base_memory = context_ref.get("memory")
            if not isinstance(base_memory, dict):
                base_memory = {}
                context_ref["memory"] = base_memory
            for ns, bucket in _mem_patch.items():
                if not isinstance(bucket, dict):
                    continue
                existing = base_memory.setdefault(ns, {})
                if isinstance(existing, dict):
                    existing.update(bucket)
                else:
                    base_memory[ns] = dict(bucket)

    async def _emit(event: dict[str, Any]) -> None:
        # Node handlers emit without a run_id; inject it so every run event is
        # persisted to the replay log and carries an id for SSE resume.
        event.setdefault("run_id", run_key)
        await _put_run_event(event_queue, event)

    async def _mark_awaiting_approval(
        run_id: str, node_id: str, review: str, approval_metadata: dict[str, Any] | None = None,
    ) -> None:
        def _update() -> dict[str, Any] | None:
            session = SessionLocal()
            try:
                db_run = (
                    session.query(models.WorkflowRun)
                    .filter(models.WorkflowRun.id == uuid.UUID(run_id))
                    .first()
                )
                if not db_run:
                    return None
                if db_run.status in _TERMINAL_STATUSES:
                    # A concurrent stop_run won the terminal race; parking an
                    # approval now would resurrect a dead run. The parked row
                    # (already created) is cancelled by recovery; skip the mark.
                    return None
                metrics = dict(db_run.metrics_json or {})
                metrics["pending_approval"] = {
                    "node_id": node_id,
                    "review": review,
                    **(approval_metadata or {}),
                }
                won = _cas_terminal_write(
                    session, db_run.id, "awaiting_approval",
                    {"metrics_json": metrics},
                )
                if not won:
                    return None
                session.commit()
                # Payload for the observability stream (triage should not stay "running").
                wf = (
                    session.query(models.Workflow)
                    .join(models.WorkflowVersion)
                    .filter(models.WorkflowVersion.id == db_run.workflow_version_id)
                    .first()
                )
                return {
                    "type": "run_updated",
                    "run_id": str(db_run.id),
                    "workflow_id": str(wf.id) if wf else None,
                    "workflow_name": wf.name if wf else None,
                    "status": "awaiting_approval",
                    "created_at": db_run.created_at.isoformat() if db_run.created_at else None,
                    "input_text": (db_run.input_text or "")[:200],
                }
            finally:
                session.close()

        payload = await asyncio.to_thread(_update)
        if payload:
            try:
                user_id = workflow_user_id
                if user_id is not None:
                    await broadcast_observability_event(str(user_id), payload)
            except Exception:  # noqa: BLE001 — never block approval on SSE fanout
                logger.exception("Failed to broadcast awaiting_approval observability event")

    context_ref["_emit"] = _emit
    context_ref["_mark_awaiting_approval"] = _mark_awaiting_approval

    async def _resume_after_tool_approval(run_id: str, approval_key: str) -> None:
        def resume(session: Session, run: models.WorkflowRun) -> None:
            metrics = dict(run.metrics_json or {})
            pending = metrics.get("pending_approval") or {}
            if pending.get("node_id") != approval_key:
                return
            if run.status != "awaiting_approval":
                # A concurrent stop_run already resolved the wait; do not
                # resurrect the row to running from a stale read.
                return
            metrics.pop("pending_approval", None)
            claimed = session.execute(
                _sa_update(models.WorkflowRun)
                .where(
                    models.WorkflowRun.id == run.id,
                    models.WorkflowRun.status == "awaiting_approval",
                )
                .values(status="running", metrics_json=metrics)
            ).rowcount
            if claimed != 1:
                session.rollback()
        await _with_run_session(uuid.UUID(run_id), resume)

    context_ref["_resume_after_tool_approval"] = _resume_after_tool_approval

    if workflow_user_id is not None:

        def _enrich_graph(current_graph: dict) -> dict:
            # Single-thread unit of work; returns a plain enriched graph dict.
            preset_db = _run_session()
            try:
                enriched = enrich_graph_eval_presets(current_graph, preset_db, workflow_user_id)
                enriched = resolve_prompt_refs(enriched, preset_db, workflow_user_id)
                from app.api.guardrail_policies import enrich_graph_guardrail_policies

                return enrich_graph_guardrail_policies(enriched, preset_db, workflow_user_id)
            finally:
                preset_db.close()

        graph_json = await asyncio.to_thread(_enrich_graph, graph_json)

    guardrail_policy_plugin = await asyncio.to_thread(
        _resolve_workflow_guardrail_plugin, graph_json, workflow_user_id
    )
    if guardrail_policy_plugin is not None:
        context_ref["_guardrail_policy_plugin"] = guardrail_policy_plugin

    # Shared execution-boundary endpoint gate: every run path (inline, worker,
    # invoke, schedule, resume) funnels through here before compile, so the
    # ADK-Agent path (LiteLlm, which never calls generate_*) is covered even
    # when the API admission gate was bypassed or the graph changed after
    # admission. Blocking DNS runs in a thread; failures mark the run failed.
    def _gate_endpoints() -> None:
        from app.services.llm_providers import validate_provider_endpoints

        validate_provider_endpoints(graph_json, context_ref)

    await asyncio.to_thread(_gate_endpoints)

    workflow, metadata, author_lookup = compile_workflow(
        graph_json,
        on_guardrail_result=on_guardrail,
        context_ref=context_ref,
    )

    session_service = InMemorySessionService()
    model_targets = {
        meta["adk_name"]: meta["pricing_target"]
        for meta in metadata.values() if "pricing_target" in meta
    }
    for meta in metadata.values():
        model_targets.update(meta.get("tool_agent_aliases", {}))
    token_tracker = TokenTrackerPlugin(model_targets=model_targets)
    trace_plugin = TracePlugin(
        tool_guard=guardrail_policy_plugin.tool_guard
        if guardrail_policy_plugin is not None else None
    )
    plugins: list[Any] = [token_tracker, trace_plugin]
    if guardrail_policy_plugin is not None:
        plugins.append(guardrail_policy_plugin)
    runner = Runner(
        app_name="aegis",
        node=workflow,
        session_service=session_service,
        auto_create_session=True,
        plugins=plugins,
    )

    try:
        await _run_workflow_body(
            run_id,
            event_queue,
            guardrail_results=guardrail_results,
            workflow_context=workflow_context,
            context_ref=context_ref,
            run_key=run_key,
            metadata=metadata,
            author_lookup=author_lookup,
            runner=runner,
            input_text=input_text,
            token_tracker=token_tracker,
            trace_plugin=trace_plugin,
            guardrail_policy_plugin=guardrail_policy_plugin,
            error_context=error_context,
        )
    except BaseException as failure:
        trace_plugin.finish_pending()
        def capture_failure_usage(session: Session, run: models.WorkflowRun) -> None:
            usages = token_tracker.usage_with_cost(settings.gemini_model)
            totals = {key: sum(int(row.get(key) or 0) for row in usages.values())
                for key in ("prompt_tokens", "completion_tokens", "thinking_tokens", "total_tokens", "calls")}
            _merge_run_metrics(run, {"total_tokens": totals["total_tokens"]})
            failed_id = (error_context or {}).get("last_node_id")
            if failed_id and not session.query(models.NodeResult).filter_by(run_id=run.id, node_id=failed_id).first():
                usage = {key: sum(int(row.get(key) or 0) for agent, row in usages.items()
                    if _resolve_node_id(agent, metadata, author_lookup) == failed_id) for key in totals}
                session.add(models.NodeResult(run_id=run.id, node_id=failed_id,
                    node_type=metadata[failed_id]["type"], node_label=metadata[failed_id]["label"],
                    status="failed", output=str(failure), token_usage=usage))
        await asyncio.shield(_with_run_session(run_id, capture_failure_usage))
        # Hard failures and cancellation bypass the normal run rollup; captured
        # tool/model child spans must still show what actually happened.
        await asyncio.shield(_persist_captured_spans(run_id, metadata, author_lookup, token_tracker, trace_plugin, list((context_ref or {}).get("_direct_llm_calls") or [])))
        raise
    finally:
        memory_db = _run_session()
        try:
            flush = asyncio.ensure_future(
                asyncio.to_thread(flush_memory_writes, memory_db, context_ref)
            )
            try:
                await asyncio.shield(flush)
            except asyncio.CancelledError:
                # The thread is not cancellable — drain it before the finally
                # closes memory_db, or the worker is still writing on a closed
                # session and the queued writes are silently lost.
                with suppress(Exception):
                    await flush
                raise
            except Exception:
                logger.exception(
                    "Failed to flush workflow memory",
                    extra={"run_id": run_key},
                )

                def _mark_memory_flush_failed() -> None:
                    session = SessionLocal()
                    try:
                        db_run = session.query(models.WorkflowRun).filter(
                            models.WorkflowRun.id == run_id
                        ).first()
                        if not db_run:
                            return
                        metrics = dict(db_run.metrics_json or {})
                        metrics["memory_flush_failed"] = True
                        db_run.metrics_json = metrics
                        session.commit()
                    finally:
                        session.close()

                await asyncio.to_thread(_mark_memory_flush_failed)
        finally:
            memory_db.close()


def _resolve_workflow_guardrail_plugin(
    graph_json: dict, user_id: uuid.UUID | None
) -> GuardrailPolicyPlugin | None:
    """Build a workflow-level guardrail plugin from the trigger node's config.

    The workflow-wide policy lives on the trigger node's data
    (``workflowGuardrailPolicyId`` + ``workflowGuardrailMode``) so it round-trips
    with the graph and needs no schema change. An unresolved configured policy
    hard-fails production; only an unset policy is intentionally absent.
    """
    policy_id: Any = None
    mode = "both"
    for node in graph_json.get("nodes", []) or []:
        data = node.get("data") or {}
        if data.get("nodeType") == "trigger":
            policy_id = data.get("workflowGuardrailPolicyId")
            mode = data.get("workflowGuardrailMode") or "both"
            break
    if not policy_id:
        return None

    def unavailable() -> None:
        if settings.deployment_environment == "production":
            raise GuardrailJudgeUnavailableError("Configured workflow safety policy is unavailable", "workflow-policy")

    if user_id is None:
        unavailable()
        return None
    try:
        pid = uuid.UUID(str(policy_id))
    except (ValueError, TypeError):
        unavailable()
        return None

    db = SessionLocal()
    try:
        policy = (
            db.query(models.GuardrailPolicy)
            .filter(
                models.GuardrailPolicy.id == pid,
                models.GuardrailPolicy.user_id == user_id,
            )
            .first()
        )
        if not policy or not policy.rules_json:
            unavailable()
            return None
        return GuardrailPolicyPlugin(policy.rules_json, mode=mode, policy_name=policy.name)
    finally:
        db.close()


async def _persist_captured_spans(run_id, metadata, author_lookup, token_tracker, trace_plugin, direct_calls: list | None = None) -> None:
    if getattr(trace_plugin, "_aegis_persisted", False):
        return
    # Trust-layer nested trace: persist llm/tool child spans keyed to their node
    # (via the agent→node map). Node parent spans + geometry are synthesized at
    # read time from NodeResults (timeline pattern) in GET /runs/{id}/trace.
    # Direct (non-ADK) model calls arrive via the generate_* sink with the
    # node's adk_name as agent, so they resolve and persist identically.
    all_calls = list(token_tracker.calls if token_tracker else []) + list(direct_calls or [])
    trace_children: list[dict[str, Any]] = []
    for call in all_calls:
        nid = _resolve_node_id(call.get("agent"), metadata, author_lookup)
        if not nid:
            continue
        trace_children.append(
            {
                "kind": "llm_call",
                "node_id": nid,
                "name": call.get("model") or "llm call",
                "status": "completed",
                "duration_ms": call.get("latency_ms"),
                "started_wall": call.get("started_wall"),
                "attributes": {
                    "prompt": call.get("prompt_text"),
                    "completion": call.get("completion_text"),
                },
                "tokens": {
                    "prompt": call.get("prompt_tokens"),
                    "completion": call.get("completion_tokens"),
                    "thinking": call.get("thinking_tokens"),
                    "total": call.get("total_tokens"),
                },
                "cost_usd": call.get("cost_usd"),
            }
        )
    for tool_call in (trace_plugin.tool_calls if trace_plugin else []):
        nid = _resolve_node_id(tool_call.get("agent"), metadata, author_lookup)
        if not nid:
            continue
        trace_children.append(
            {
                "kind": "tool_call",
                "node_id": nid,
                "name": tool_call.get("name") or "tool",
                "status": tool_call.get("status") or "completed",
                "duration_ms": tool_call.get("latency_ms"),
                "started_wall": tool_call.get("started_wall"),
                "attributes": {
                    "call_id": tool_call.get("call_id"),
                    "args": tool_call.get("args"),
                    "result": tool_call.get("result"),
                    "error": tool_call.get("error"),
                },
                "tokens": None,
                "cost_usd": None,
            }
        )

    if trace_children:
        trace_children.sort(key=lambda c: c.get("started_wall") or 0)

        def _apply_spans(session: Session, run: models.WorkflowRun) -> None:
            # Trace primitives for the waterfall view.
            for call in all_calls:
                session.add(
                    models.LlmCall(
                        run_id=run.id,
                        node_id=_resolve_node_id(call.get("agent"), metadata, author_lookup),
                        model=call.get("model"),
                        prompt_text=call.get("prompt_text"),
                        completion_text=call.get("completion_text"),
                        prompt_tokens=call.get("prompt_tokens"),
                        completion_tokens=call.get("completion_tokens"),
                        thinking_tokens=call.get("thinking_tokens"),
                        total_tokens=call.get("total_tokens"),
                        cost_usd=call.get("cost_usd"),
                        latency_ms=call.get("latency_ms"),
                    )
                )
            for child in trace_children:
                attrs = dict(child["attributes"] or {})
                if child.get("started_wall") is not None:
                    attrs["started_wall"] = child["started_wall"]
                session.add(
                    models.RunSpan(
                        run_id=run.id,
                        parent_span_id=None,
                        node_id=child["node_id"],
                        kind=child["kind"],
                        name=str(child["name"])[:255],
                        status=child["status"],
                        offset_ms=None,
                        duration_ms=child.get("duration_ms"),
                        attributes_json=attrs or None,
                        tokens_json=child.get("tokens"),
                        cost_usd=child.get("cost_usd"),
                    )
                )

        await _with_run_session(run_id, _apply_spans)
        trace_plugin._aegis_persisted = True


async def _run_workflow_body(
    run_id: uuid.UUID,
    event_queue: _RunEventBroker,
    *,
    guardrail_results: dict[str, GuardrailResult],
    workflow_context: WorkflowContext,
    context_ref: dict[str, Any],
    run_key: str,
    metadata: dict[str, dict],
    author_lookup: dict[str, str],
    runner: Runner,
    input_text: str,
    token_tracker: TokenTrackerPlugin | None = None,
    trace_plugin: TracePlugin | None = None,
    guardrail_policy_plugin: GuardrailPolicyPlugin | None = None,
    error_context: dict[str, Any] | None = None,
) -> None:
    node_spans = NodeSpanTracker()
    started_nodes: dict[str, float] = {}
    completed_nodes: set[str] = set()
    node_outputs: dict[str, str] = {}
    eval_score_rows: list[dict] = []
    failed_guardrails: list[str] = []
    guardrail_events: list[dict] = []
    total_tokens = 0
    final_output: str | None = None

    async def _persist_node_result(
        matched_node_id: str,
        *,
        text: str | None,
        token_usage: dict | None,
        status: str = "completed",
    ) -> None:
        nonlocal final_output

        if matched_node_id in completed_nodes:
            return

        started_at = started_nodes.setdefault(matched_node_id, time.time())
        latency_ms = int((time.time() - started_at) * 1000)
        meta = metadata[matched_node_id]

        # A node that failed but carried an error branch was routed instead of
        # raising; the wrapper flagged it here so telemetry stays honest.
        if status == "completed" and matched_node_id in (context_ref.get("_error_routed") or {}):
            status = "failed"

        node_result = models.NodeResult(
            run_id=run_id,
            node_id=matched_node_id,
            node_type=meta["type"],
            node_label=meta["label"],
            status=status,
            output=text,
            latency_ms=latency_ms,
            token_usage=token_usage,
        )

        if meta.get("is_guardrail"):
            guardrail_status, output = _parse_guardrail_status(
                matched_node_id, text, guardrail_results
            )
            node_result.guardrail_status = guardrail_status
            if output:
                node_result.output = output
            # Only hard failures feed failed_guardrails; warn/rewrite/fallback
            # are non-blocking and tracked via guardrail_events alone.
            if guardrail_status == "failed":
                failed_guardrails.append(matched_node_id)
            guardrail_events.append(
                {
                    "node_id": matched_node_id,
                    "node_label": meta["label"],
                    "status": guardrail_status or "unknown",
                    "message": output or "",
                    "mode": meta.get("guardrail_mode"),
                    "guardrail_type": meta.get("guardrail_type"),
                    "fail_behavior": meta.get("fail_behavior"),
                }
            )

        if meta.get("is_evaluation") and not meta.get("eval_deferred"):
            node_result.evaluation_scores = _parse_evaluation_scores(
                text,
                meta.get("score_weights"),
            )
            if node_result.evaluation_scores:
                row = {
                    "node_id": matched_node_id,
                    "node_label": meta["label"],
                    **node_result.evaluation_scores,
                }
                eval_score_rows.append(row)
                threshold = meta.get("eval_threshold")
                aggregate = row.get("aggregate_score")
                fail_behavior = meta.get("eval_fail_behavior", "none")
                if (
                    threshold is not None
                    and aggregate is not None
                    and float(aggregate) < float(threshold)
                ):
                    row["passed"] = False
                    row["threshold"] = threshold
                    if fail_behavior == "block":
                        raise EvalThresholdBlockedError(
                            f"Eval score {aggregate} below threshold {threshold}",
                            matched_node_id,
                            float(aggregate),
                        )
                    if fail_behavior == "warn":
                        row["warned"] = True

        # Mark complete only after the eval-threshold check above (which may
        # raise EvalThresholdBlockedError) and after the row is persisted, so a
        # blocking eval node is re-persisted with status "failed" by the handler
        # instead of being silently skipped by the `in completed_nodes` guard.
        def _persist_result(session: Session, run: models.WorkflowRun) -> None:
            # Upsert by (run_id, node_id): a node re-executed after a crash
            # resume updates its row instead of duplicating it. The durable
            # checkpoint lands in the same transaction so it cannot outlive
            # the result it describes.
            from app.services.checkpoints import mark_node_completed

            existing = (
                session.query(models.NodeResult)
                .filter(
                    models.NodeResult.run_id == run.id,
                    models.NodeResult.node_id == matched_node_id,
                )
                .first()
            )
            if existing is not None:
                existing.node_type = node_result.node_type
                existing.node_label = node_result.node_label
                existing.status = node_result.status
                existing.output = node_result.output
                existing.latency_ms = node_result.latency_ms
                existing.token_usage = node_result.token_usage
                existing.evaluation_scores = node_result.evaluation_scores
                existing.guardrail_status = node_result.guardrail_status
            else:
                session.add(node_result)
            # Snapshot the mutable context so resume restores state mutations
            # the output alone omits: set_fields → input.*, in-context memory,
            # AND the queued persistent-memory writes (_memory_pending_writes)
            # so end-of-run flush still persists them after a crash+resume.
            try:
                _patch = json.loads(
                    json.dumps(
                        {
                            "input": context_ref.get("input"),
                            "memory": context_ref.get("memory"),
                            "pending_memory": context_ref.get("_memory_pending_writes"),
                        }
                    )
                )
            except (TypeError, ValueError):  # non-serializable context never blocks a run
                _patch = None
            mark_node_completed(session, run.id, matched_node_id, node_result.output, _patch)

        await _with_run_session(run_id, _persist_result)
        completed_nodes.add(matched_node_id)

        node_spans.end(
            matched_node_id,
            status=status,
            latency_ms=latency_ms,
            guardrail_status=node_result.guardrail_status,
        )

        await _put_run_event(event_queue,
            {
                "type": "node_completed",
                "run_id": run_key,
                "node_id": matched_node_id,
                "node_label": meta["label"],
                "status": status,
                "output": node_result.output,
                "evaluation_scores": node_result.evaluation_scores,
                "guardrail_status": node_result.guardrail_status,
                "latency_ms": latency_ms,
            }
        )

    async def _consume_events() -> None:
        nonlocal final_output, total_tokens

        try:
            async for event in runner.run_async(
                user_id="aegis-user",
                session_id=str(uuid.uuid4()),
                new_message=types.Content(parts=[types.Part(text=input_text)]),
            ):
                author = getattr(event, "author", None) or "workflow"
                text = _extract_text_from_event(event)
                token_usage = _extract_token_usage(event)
                node_path = getattr(getattr(event, "node_info", None), "path", None)
                matched_node_id = _resolve_node_id(author, metadata, author_lookup, node_path)

                if not matched_node_id:
                    continue

                # A tool agent may emit reasoning text, calls, and results before
                # its final answer. Preserve the ADK transcript, but only its
                # explicit wrapper output records/completes the canvas node.
                if metadata[matched_node_id].get("is_tool_agent") and getattr(event, "output", None) is None:
                    text = None

                if matched_node_id not in started_nodes:
                    started_nodes[matched_node_id] = time.time()
                    node_meta = metadata[matched_node_id]
                    # Record the currently-executing node so the run's broad
                    # exception handler can report which node blew up
                    # (improves assist.explain_run).
                    if error_context is not None:
                        error_context["last_node_id"] = matched_node_id
                        error_context["last_node_type"] = node_meta["type"]
                        error_context["last_node_label"] = node_meta["label"]
                    node_spans.start(
                        matched_node_id,
                        node_meta["type"],
                        node_meta["label"],
                    )
                    # Durable checkpoint: this node is now the resume frontier.
                    # Never downgrades an existing completed/skipped row.
                    def _checkpoint_started(session: Session, run: models.WorkflowRun) -> None:
                        from app.services.checkpoints import mark_node_started

                        mark_node_started(session, run.id, matched_node_id)

                    await _with_run_session(run_id, _checkpoint_started)
                    await _put_run_event(event_queue,
                        {
                            "type": "node_started",
                            "run_id": run_key,
                            "node_id": matched_node_id,
                            "node_label": node_meta["label"],
                        }
                    )

                # Streaming delta: ADK marks in-flight chunks with
                # event.partial — forward the chunk to SSE subscribers but
                # never let a partial record a step or complete the node.
                if getattr(event, "partial", False):
                    delta = _extract_delta_text(event)
                    if delta:
                        await _put_run_event(event_queue,
                            {
                                "type": "node_delta",
                                "run_id": run_key,
                                "node_id": matched_node_id,
                                "delta": delta[:4096],
                            }
                        )
                    continue


                if text:
                    node_outputs[matched_node_id] = text
                    final_output = text
                    # Run-from-here: the trigger passthrough emits the pinned
                    # seed downstream, but the wrapper already recorded the
                    # trigger's honest step output (raw run input). Don't clobber
                    # it here — keep {{steps.<trigger>.output}} truthful.
                    seeded_trigger = (
                        metadata[matched_node_id]["type"] == "trigger"
                        and context_ref.get("_seeded_last_output") is not None
                    )
                    if not seeded_trigger:
                        workflow_context.record_step(
                            matched_node_id,
                            text,
                            label=metadata[matched_node_id]["label"],
                            node_type=metadata[matched_node_id]["type"],
                        )

                if token_usage and token_usage.get("total_tokens"):
                    total_tokens += int(token_usage["total_tokens"] or 0)

                is_complete = bool(getattr(event, "turn_complete", False) or text)
                if metadata[matched_node_id].get("is_tool_agent"):
                    is_complete = getattr(event, "output", None) is not None
                if is_complete:
                    await _persist_node_result(
                        matched_node_id,
                        text=text,
                        token_usage=token_usage,
                    )
        except EvalThresholdBlockedError as exc:
            if exc.node_id not in completed_nodes:
                await _persist_node_result(
                    exc.node_id,
                    text=str(exc),
                    token_usage=None,
                    status="failed",
                )
            metrics_payload = {
                "eval_scores": eval_score_rows,
                "eval_aggregate": exc.aggregate,
                "eval_passed": False,
                "eval_threshold_blocked": True,
                "failed_eval_node": exc.node_id,
                "workflow_context": workflow_context.snapshot_for_metrics(),
            }

            def _fail_eval(session: Session, run: models.WorkflowRun) -> models.WorkflowRun | None:
                if _is_cancel_requested(run):
                    _merge_run_metrics(run, metrics_payload)
                    return run
                merged = {**(run.metrics_json or {}), **metrics_payload}
                won = _cas_terminal_write(
                    session, run.id, "failed",
                    {
                        "final_output": f"Eval threshold not met at node {exc.node_id}: {exc}",
                        "completed_at": datetime.now(timezone.utc),
                        "metrics_json": merged,
                    },
                )
                session.commit()
                session.refresh(run)
                return run if won else None

            failed_run = await _with_run_session(run_id, _fail_eval)
            if failed_run is None:
                raise
            workflow = failed_run.version.workflow if failed_run and failed_run.version else None
            quality_webhook_for_run(None, failed_run, workflow)
            raise

        except Exception as error:
            # ADK wraps plugin failures in RuntimeError. Recover a guardrail
            # hard block from the cause chain rather than losing its status
            # and metrics to the generic run-error handler.
            cause: BaseException | None = error
            while cause is not None and not isinstance(cause, GuardrailBlockedError):
                cause = cause.__cause__ or cause.__context__
            if not isinstance(cause, GuardrailBlockedError):
                raise
            exc = cause
            if exc.node_id in metadata and exc.node_id not in guardrail_results:
                guardrail_results[exc.node_id] = GuardrailResult(
                    passed=False, message=str(exc), severity="error",
                    requires_block=isinstance(exc, GuardrailJudgeUnavailableError),
                )
            if exc.node_id in metadata and exc.node_id not in completed_nodes:
                gr = guardrail_results.get(exc.node_id)
                await _persist_node_result(
                    exc.node_id,
                    text=gr.message if gr else str(exc),
                    token_usage=None,
                    status="failed",
                )
            gr = guardrail_results.get(exc.node_id)
            meta = metadata.get(exc.node_id, {})
            metrics_payload = {
                "failed_guardrails": [exc.node_id],
                "guardrail_blocked": True,
                "guardrail_events": (
                    list(guardrail_policy_plugin.events)
                    if exc.node_id == "workflow-policy" and guardrail_policy_plugin is not None
                    else [
                        {
                            "node_id": exc.node_id,
                            "node_label": meta.get("label", exc.node_id),
                            "status": "failed",
                            "message": gr.message if gr else str(exc),
                            "mode": meta.get("guardrail_mode"),
                            "guardrail_type": meta.get("guardrail_type"),
                            "fail_behavior": meta.get("fail_behavior"),
                        }
                    ]
                ),
            }

            def _fail_guardrail(session: Session, run: models.WorkflowRun) -> models.WorkflowRun | None:
                if _is_cancel_requested(run):
                    _merge_run_metrics(run, metrics_payload)
                    return run
                merged = {**(run.metrics_json or {}), **metrics_payload}
                won = _cas_terminal_write(
                    session, run.id, "failed",
                    {
                        "final_output": f"Guardrail blocked at node {exc.node_id}: {exc}",
                        "completed_at": datetime.now(timezone.utc),
                        "metrics_json": merged,
                    },
                )
                session.commit()
                session.refresh(run)
                return run if won else None

            failed_run = await _with_run_session(run_id, _fail_guardrail)
            if failed_run is None:
                raise exc
            workflow = failed_run.version.workflow if failed_run and failed_run.version else None
            quality_webhook_for_run(None, failed_run, workflow)
            raise exc

    await _consume_with_timeout(run_id, _consume_events())

    deferred_specs = [
        (
            node_id,
            # Per-run copy so the shared (cached) metadata is never mutated with a
            # user-specific resolved credential.
            {**metadata[node_id], "_provider_model": resolve_provider_model(metadata[node_id], context_ref)},
            node_outputs.get(node_id, ""),
        )
        for node_id, meta in metadata.items()
        if meta.get("is_evaluation") and meta.get("eval_deferred")
    ]
    deferred_eval_usage: dict[str, dict[str, Any]] = {}
    if deferred_specs:
        parallel_results = await run_parallel_evaluations(deferred_specs, request_context=input_text)
        for node_id, scores, error in parallel_results:
            meta = metadata[node_id]
            if scores:
                eval_usage = scores.pop("_token_usage", None)
                if eval_usage:
                    deferred_eval_usage[node_id] = eval_usage
            if error or not scores:
                await _put_run_event(event_queue,
                    {
                        "type": "node_completed",
                        "run_id": run_key,
                        "node_id": node_id,
                        "node_label": meta["label"],
                        "status": "failed",
                        "output": error or "Eval failed",
                        "evaluation_scores": None,
                        "guardrail_status": None,
                        "latency_ms": None,
                    }
                )
                continue

            row = {
                "node_id": node_id,
                "node_label": meta["label"],
                **scores,
            }
            eval_score_rows.append(row)
            threshold = meta.get("eval_threshold")
            aggregate = row.get("aggregate_score")
            fail_behavior = meta.get("eval_fail_behavior", "none")
            if (
                threshold is not None
                and aggregate is not None
                and float(aggregate) < float(threshold)
            ):
                row["passed"] = False
                row["threshold"] = threshold
                if fail_behavior == "warn":
                    row["warned"] = True
                if fail_behavior == "block":
                    def _block_deferred(session: Session, run: models.WorkflowRun) -> models.WorkflowRun | None:
                        existing = (
                            session.query(models.NodeResult)
                            .filter(
                                models.NodeResult.run_id == run.id,
                                models.NodeResult.node_id == node_id,
                            )
                            .first()
                        )
                        if existing:
                            existing.evaluation_scores = scores
                            existing.status = "failed"
                            existing.output = f"Eval score {aggregate} below threshold {threshold}"
                        metrics_payload = {
                            "eval_scores": eval_score_rows,
                            "eval_aggregate": aggregate,
                            "eval_passed": False,
                            "eval_threshold_blocked": True,
                            "failed_eval_node": node_id,
                            "workflow_context": workflow_context.snapshot_for_metrics(),
                        }
                        if _is_cancel_requested(run):
                            _merge_run_metrics(run, metrics_payload)
                            return run
                        merged = {**(run.metrics_json or {}), **metrics_payload}
                        won = _cas_terminal_write(
                            session, run.id, "failed",
                            {
                                "final_output": (
                                    f"Eval threshold not met at node {node_id}: "
                                    f"score {aggregate} < {threshold}"
                                ),
                                "completed_at": datetime.now(timezone.utc),
                                "metrics_json": merged,
                            },
                        )
                        session.commit()
                        session.refresh(run)
                        return run if won else None

                    blocked_run = await _with_run_session(run_id, _block_deferred)
                    if blocked_run is None:
                        raise EvalThresholdBlockedError(
                            f"Eval score {aggregate} below threshold {threshold} (superseded by concurrent terminal write)",
                            node_id,
                            float(aggregate),
                        )
                    workflow = blocked_run.version.workflow if blocked_run and blocked_run.version else None
                    quality_webhook_for_run(None, blocked_run, workflow)
                    raise EvalThresholdBlockedError(
                        f"Eval score {aggregate} below threshold {threshold}",
                        node_id,
                        float(aggregate),
                    )

            output_text = json.dumps(scores, default=_json_default)

            def _save_deferred(session: Session, run: models.WorkflowRun) -> str:
                existing = (
                    session.query(models.NodeResult)
                    .filter(
                        models.NodeResult.run_id == run.id,
                        models.NodeResult.node_id == node_id,
                    )
                    .first()
                )
                if existing:
                    existing.evaluation_scores = scores
                    existing.output = output_text
                    return existing.output or output_text
                session.add(
                    models.NodeResult(
                        run_id=run.id,
                        node_id=node_id,
                        node_type=meta["type"],
                        node_label=meta["label"],
                        status="completed",
                        output=output_text,
                        evaluation_scores=scores,
                    )
                )
                return output_text

            saved_output = await _with_run_session(run_id, _save_deferred)
            await _put_run_event(event_queue,
                {
                    "type": "node_completed",
                    "run_id": run_key,
                    "node_id": node_id,
                    "node_label": meta["label"],
                    "status": "completed",
                    "output": saved_output,
                    "evaluation_scores": scores,
                    "guardrail_status": None,
                    "latency_ms": None,
                }
            )

    # Fold plugin-captured token usage into node results and run totals.
    # (ADK 2.x strips usage_metadata from propagated events, so the event loop
    # above never sees token counts — the model-callback plugin does.)
    node_usage: dict[str, dict[str, Any]] = {}

    def _merge_usage(node_id: str, row: dict[str, Any]) -> None:
        existing = node_usage.get(node_id)
        if not existing:
            node_usage[node_id] = dict(row)
            return
        for key in ("prompt_tokens", "completion_tokens", "thinking_tokens", "total_tokens", "calls"):
            existing[key] = (existing.get(key) or 0) + (row.get(key) or 0)
        if existing.get("cost_usd") is not None and row.get("cost_usd") is not None:
            existing["cost_usd"] = round(existing["cost_usd"] + row["cost_usd"], 6)
            existing["pricing_status"] = "priced"
        else:
            existing["cost_usd"] = None
            existing["pricing_status"] = "unpriced"

    if token_tracker and token_tracker.usage_by_agent:
        from app.config import settings as _settings

        for agent_name, row in token_tracker.usage_with_cost(_settings.gemini_model).items():
            node_id = _resolve_node_id(agent_name, metadata, author_lookup)
            if not node_id:
                continue
            _merge_usage(node_id, row)
    for node_id, row in deferred_eval_usage.items():
        _merge_usage(node_id, row)
    for node_id, row in (context_ref.get("_direct_llm_usage") or {}).items():
        # Router/classifier/expression-agent calls bypass the ADK token
        # plugin; their usage rows arrive here via the generate_* sink.
        _merge_usage(node_id, row)
    for node_id, row in node_usage.items():
        node_spans.set_gen_ai_usage(node_id, row)
    if node_usage:
        tracked_total = sum(int(u.get("total_tokens") or 0) for u in node_usage.values())
        if tracked_total:
            total_tokens = tracked_total

        def _apply_usage(session: Session, run: models.WorkflowRun) -> None:
            for node_id, usage in node_usage.items():
                nr = (
                    session.query(models.NodeResult)
                    .filter(
                        models.NodeResult.run_id == run.id,
                        models.NodeResult.node_id == node_id,
                    )
                    .first()
                )
                if nr:
                    # Accumulate across attempts: LlmCall rows persist per
                    # attempt, so overwriting here would undercount the header
                    # vs the by_model sums on any resumed run.
                    prior = nr.token_usage or {}
                    merged = dict(usage)
                    for field in ("prompt_tokens", "completion_tokens", "thinking_tokens", "total_tokens", "calls"):
                        merged[field] = int(prior.get(field) or 0) + int(usage.get(field) or 0)
                    if prior.get("cost_usd") is not None and usage.get("cost_usd") is not None:
                        merged["cost_usd"] = round(float(prior["cost_usd"]) + float(usage["cost_usd"]), 6)
                    elif prior.get("cost_usd") is not None:
                        merged["cost_usd"] = prior["cost_usd"]
                    nr.token_usage = merged

        await _with_run_session(run_id, _apply_usage)
    await _persist_captured_spans(run_id, metadata, author_lookup, token_tracker, trace_plugin, list((context_ref or {}).get("_direct_llm_calls") or []))


    total_cost_usd = (
        round(sum(float(u["cost_usd"]) for u in node_usage.values()), 6)
        if node_usage and all(u.get("cost_usd") is not None for u in node_usage.values())
        else None
    )

    end_node_ids = [
        nid for nid, meta in metadata.items() if meta.get("type") == "end" and not meta.get("is_annotation")
    ]
    if end_node_ids and end_node_ids[0] in node_outputs:
        resolved_final_output = node_outputs[end_node_ids[0]]
    else:
        resolved_final_output = final_output or (list(node_outputs.values())[-1] if node_outputs else None)
    aggregates = [
        row["aggregate_score"]
        for row in eval_score_rows
        if isinstance(row.get("aggregate_score"), (int, float))
    ]
    eval_passed = apply_eval_threshold(eval_score_rows, metadata)

    # Fold workflow-level policy verdicts (from the ADK plugin) into the same
    # metrics the Trust surface reads, alongside node-level guardrail events.
    policy_events = guardrail_policy_plugin.events if guardrail_policy_plugin else []
    policy_blocked = bool(guardrail_policy_plugin and guardrail_policy_plugin.blocked)
    all_guardrail_events = guardrail_events + policy_events
    all_failed_guardrails = failed_guardrails + [
        e["node_label"] for e in policy_events if e["status"] == "failed"
    ]

    def _complete_run(session: Session, run: models.WorkflowRun) -> models.WorkflowRun:
        completed_at = datetime.now(timezone.utc)
        metrics_payload = {
            "latency_ms": int(
                (_as_utc(completed_at) - _as_utc(run.started_at)).total_seconds() * 1000
            )
            if run.started_at
            else None,
            "total_tokens": total_tokens,
            "total_cost_usd": total_cost_usd,
            "pricing_status": "priced" if total_cost_usd is not None else "unpriced",
            "node_count": len(metadata),
            "eval_scores": eval_score_rows,
            "eval_aggregate": round(sum(aggregates) / len(aggregates), 2)
            if aggregates
            else None,
            "eval_passed": eval_passed,
            "failed_guardrails": all_failed_guardrails,
            "guardrail_events": all_guardrail_events,
            "guardrail_blocked": policy_blocked,
            "workflow_context": workflow_context.snapshot_for_metrics(),
        }
        # Worker-mode stop_run sets cancel_requested + cancelled; do not clobber it.
        # Return None so downstream skips the stale run_completed event — the
        # cancel path already persisted (and emitted) the true fate.
        if _is_cancel_requested(run):
            return None
        run.status = "completed"
        run.final_output = resolved_final_output
        run.completed_at = completed_at
        _merge_run_metrics(run, metrics_payload)
        won = _cas_terminal_write(
            session, run.id, "completed",
            {
                "final_output": run.final_output,
                "completed_at": run.completed_at,
                "metrics_json": dict(run.metrics_json or {}),
            },
        )
        session.refresh(run)
        return run if won else None

    completed_run = await _with_run_session(run_id, _complete_run)
    # A lost terminal race leaves completed_run None: the winner already
    # persisted the true fate, so skip the stale completed event/hook.
    if completed_run is None:
        clear_approval_state(run_key)
        return
    workflow = completed_run.version.workflow if completed_run and completed_run.version else None
    quality_webhook_for_run(None, completed_run, workflow)

    await _maybe_online_eval(
        run_id,
        resolved_final_output,
        input_text,
        has_inline_eval=bool(eval_score_rows) or any(
            meta.get("is_evaluation") for meta in metadata.values()
        ),
    )

    clear_approval_state(run_key)

    def _load_node_results(session: Session, run: models.WorkflowRun) -> list[dict[str, Any]]:
        return [
            {
                "id": str(nr.id),
                "node_id": nr.node_id,
                "node_label": nr.node_label,
                "node_type": nr.node_type,
                "status": nr.status,
                "output": nr.output,
                "evaluation_scores": nr.evaluation_scores,
                "guardrail_status": nr.guardrail_status,
                "latency_ms": nr.latency_ms,
                "token_usage": nr.token_usage,
            }
            for nr in session.query(models.NodeResult).filter(models.NodeResult.run_id == run.id).all()
        ]

    node_results = await _with_run_session(run_id, _load_node_results, commit=False)

    await _put_run_event(event_queue,
        {
            "type": "run_completed",
            "run_id": str(run_id),
            "final_output": resolved_final_output,
            "metrics": completed_run.metrics_json if completed_run else {},
            "node_results": node_results or [],
        }
    )


async def _maybe_online_eval(
    run_id: uuid.UUID,
    output: str | None,
    request_text: str,
    *,
    has_inline_eval: bool,
) -> None:
    """Sample eligible runs using the same durable rate in API and workers."""
    if has_inline_eval or not output:
        return
    import random

    from app.services.online_sampling import get_online_eval_sample_rate

    rate = await _with_run_session(
        run_id,
        lambda session, _run: get_online_eval_sample_rate(session),
        commit=False,
    )
    if rate and random.random() < rate:
        schedule_task(_sampled_online_eval(run_id, output, request_text))


async def _sampled_online_eval(run_id: uuid.UUID, output: str, request_text: str) -> None:
    """Asynchronously score a sampled run and attach results to its metrics."""
    from app.services.eval_runner import evaluate_content_async
    from app.services.tracing import operation_span

    try:
        # Scheduled via loop.create_task from inside the run, so this span nests
        # under workflow.run (context is copied). A late child of an exported parent
        # is fine; do not detach it.
        with operation_span(
            "online_eval",
            {
                "aegis.operation": "online_eval",
                "aegis.run_id": str(run_id),
                "langsmith.metadata.aegis_operation": "online_eval",
                "langsmith.metadata.aegis_run_id": str(run_id),
            },
        ):
            scores = await evaluate_content_async(output, request_context=request_text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Online eval failed", extra={"run_id": str(run_id), "error": str(exc)})
        return
    scores.pop("_token_usage", None)

    def _attach(session: Session, run: models.WorkflowRun) -> None:
        metrics = dict(run.metrics_json or {})
        metrics["online_eval"] = scores
        if metrics.get("eval_aggregate") is None and scores.get("aggregate_score") is not None:
            metrics["eval_aggregate"] = scores["aggregate_score"]
        run.metrics_json = metrics

    await _with_run_session(run_id, _attach)


async def execute_run(run_id: uuid.UUID) -> None:
    _ensure_api_key()
    run_key = str(run_id)
    event_queue = _run_events.setdefault(run_key, _RunEventBroker())
    workflow = None
    workflow_id: str | None = None
    workflow_name: str | None = None
    webhook_url: str | None = None
    # Populated by the run body as nodes execute; read by the broad exception
    # handler below to attribute a failure to the node that blew up.
    error_context: dict[str, Any] = {}
    # Durable-resume plan derived from run_checkpoints (see compute_resume).
    resume_plan: dict[str, Any] | None = None

    try:
        setup_db = _run_session()
        try:
            run = _load_run(setup_db, run_id)
            if not run:
                return
            if not run.version:
                _cas_terminal_write(
                    setup_db, run.id, "failed",
                    {
                        "final_output": "Workflow version not found",
                        "completed_at": datetime.now(timezone.utc),
                    },
                )
                setup_db.commit()
                await _put_run_event(event_queue,
                    {"type": "run_failed", "run_id": run_key, "error": "Workflow version not found"})
                return
            if run.status in ("completed", "failed", "cancelled"):
                return

            # Single-winner claim: a stop_run that committed cancelled between
            # our load and now must not be resurrected to running. The status
            # predicate is the guard (SQLite-safe); cancel_requested metrics
            # are checked too since stop_run always sets both atomically.
            started_at = datetime.now(timezone.utc)
            claimed = setup_db.execute(
                _sa_update(models.WorkflowRun)
                .where(
                    models.WorkflowRun.id == run.id,
                    models.WorkflowRun.status.in_(("pending", "queued", "running", "awaiting_approval")),
                )
                .values(status="running", started_at=started_at)
            ).rowcount
            if claimed != 1:
                return
            setup_db.refresh(run)

            workflow = run.version.workflow if run.version else None
            workflow_id = str(workflow.id) if workflow else None
            workflow_name = workflow.name if workflow else None
            webhook_url = workflow.webhook_url if workflow else None
            graph_json = run.version.graph_json
            input_text = run.input_text or ""
            workflow_uuid = workflow.id if workflow else None
            workflow_user_id = workflow.user_id if workflow else None
            # Persisted pin/run-from-here overrides — the worker process never
            # populates the in-memory registry, so read them off the run row.
            persisted_overrides = run.authoring_overrides_json or None
            # Invoke-path session rehydration, staged on metrics_json at run
            # creation (see platform._create_invoked_run).
            session_history = (run.metrics_json or {}).get("session_history") or None

            # Durable-run resume: authored pins become 'skipped' checkpoints
            # (so a later resume never re-executes them), then the checkpoint
            # table decides whether this execution is a resume.
            from app.services.checkpoints import compute_resume, mark_pinned_skipped

            for pin_id, pin_output in (
                (persisted_overrides or {}).get("pinned_outputs") or {}
            ).items():
                mark_pinned_skipped(setup_db, run.id, pin_id, pin_output)

            resume_plan = compute_resume(setup_db, run, graph_json)
            if resume_plan is not None:
                metrics = dict(run.metrics_json or {})
                metrics.pop("pending_approval", None)
                if not metrics.get("resumed_at"):
                    # The boot sweep already bumps resume_attempts when it
                    # re-queues an orphaned run; count a resume here only when
                    # the sweep never saw it (e.g. a queued run claimed without
                    # a crash sweep in between).
                    metrics["resume_attempts"] = int(metrics.get("resume_attempts") or 0) + 1
                    metrics["resumed_at"] = datetime.now(timezone.utc).isoformat()
                run.metrics_json = metrics

            # Trace bookkeeping captured while the run row is loaded: prior
            # attempts (linked, never overwritten) and safe correlation metadata.
            prior_trace_attempts = list((run.metrics_json or {}).get("trace_attempts") or [])
            # trace_attempts is a bounded window; the real count survives it.
            prior_attempt_count = max(
                int((run.metrics_json or {}).get("trace_attempt_count") or 0),
                # Older runs have no running count; the highest recorded attempt
                # number is correct even when the window has already dropped entries.
                max((int(a.get("attempt") or 0) for a in prior_trace_attempts), default=0),
                len(prior_trace_attempts),
            )
            trace_attributes: dict[str, Any] = {
                "version_id": str(run.workflow_version_id),
                "execution_mode": settings.run_execution_mode,
                "trigger": "resume" if resume_plan is not None else "run",
                "session_id": run.session_id,
            }
            trace_input_text = run.input_text or ""

            dangling = resume_plan.get("dangling_ids") if resume_plan else None
            if dangling:
                # A completed router's route decision was lost in the crash
                # window — no branch of it ever emitted node_started. Resuming
                # would either drop a possibly-taken branch (false-complete) or
                # re-run completed side-effecting nodes (restart). Fail closed
                # and explain; the operator re-runs the workflow.
                won = _cas_terminal_write(
                    setup_db, run.id, "failed",
                    {
                        "final_output": (
                            "Cannot resume safely: routing decision lost for completed "
                            f"branch node(s) — ambiguous children {sorted(dangling)}"
                        ),
                        "completed_at": datetime.now(timezone.utc),
                        "metrics_json": {
                            **(run.metrics_json or {}),
                            "resume_failed": True,
                            "dangling_ids": sorted(dangling),
                        },
                    },
                )
                setup_db.commit()
                if won:
                    await _put_run_event(event_queue,
                        {"type": "run_failed", "run_id": run_key,
                         "error": "Cannot resume safely: routing decision lost for completed branch node(s)"})
                record_admission_failure(
                    run_key, workflow_id, "resume_ambiguous_route",
                    attempt=prior_attempt_count + 1,
                )
                return

            setup_db.commit()
        finally:
            setup_db.close()

        # Independent root per execution attempt; earlier attempts are linked so
        # a resume never overwrites the only reference to the first trace.
        attempt_links = [
            link
            for link in (
                span_link_from_ids(a.get("trace_id"), a.get("span_id"))
                for a in prior_trace_attempts[-1:]
            )
            if link is not None
        ]
        with workflow_run_span(
            run_key,
            workflow_id,
            workflow_name,
            attempt=prior_attempt_count + 1,
            attributes=trace_attributes,
            links=attempt_links,
        ) as root_span:
            trace_id = get_trace_id()
            if trace_id:
                span_id = get_span_id()
                attempt_number = prior_attempt_count + 1

                def _set_trace(session: Session, db_run: models.WorkflowRun) -> None:
                    metrics = dict(db_run.metrics_json or {})
                    metrics["trace_id"] = trace_id
                    attempts = list(metrics.get("trace_attempts") or [])
                    attempts.append(
                        {
                            "attempt": attempt_number,
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "started_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                    metrics["trace_attempts"] = attempts[-MAX_TRACE_ATTEMPTS:]
                    metrics["trace_attempt_count"] = attempt_number
                    db_run.metrics_json = metrics

                await _with_run_session(run_id, _set_trace)

            logger.info(
                "Run started",
                extra={
                    "run_id": run_key,
                    "workflow_id": workflow_id,
                    "event": "run_started",
                    "trace_id": trace_id,
                },
            )

            run_started_event: dict[str, Any] = {"type": "run_started", "run_id": run_key}
            if trace_id:
                run_started_event["trace_id"] = trace_id
            await _put_run_event(event_queue,run_started_event)

            notify_run = await _with_run_session(run_id, lambda _session, db_run: db_run, commit=False)
            if notify_run:
                await _notify_observability(notify_run, "run_started", trace_id=trace_id)

            overrides = _authoring_overrides.pop(run_key, None)
            if overrides is None and persisted_overrides:
                # Worker mode (or any process that didn't create the run): the
                # in-memory registry is empty, so fall back to the run row.
                overrides = {
                    "pinned_outputs": persisted_overrides.get("pinned_outputs") or {},
                    "start_node_id": persisted_overrides.get("start_node_id"),
                    "model_override": persisted_overrides.get("model_override"),
                }
            outcome_status: str | None = None
            try:
                await _run_workflow(
                    run_id,
                    graph_json,
                    event_queue,
                    input_text=input_text,
                    workflow_user_id=workflow_user_id,
                    workflow_id=workflow_uuid,
                    error_context=error_context,
                    authoring_overrides=overrides,
                    resume_plan=resume_plan,
                    session_history=session_history,
                )
            except BaseException as failure:
                # Hard failures raise out of the span; the outer handlers persist
                # the terminal status only after this block exits, so the outcome
                # has to come from the exception, not the (still "running") row.
                outcome_status = (
                    "cancelled" if isinstance(failure, asyncio.CancelledError) else "failed"
                )
                raise
            finally:
                cancelled_during_finalize: asyncio.CancelledError | None = None
                try:
                    terminal = await asyncio.shield(
                        _with_run_session(
                            run_id,
                            lambda _session, db_run: (db_run.status, db_run.final_output),
                            commit=False,
                        )
                    )
                    persisted_status = terminal[0] if terminal else None
                    finalize_workflow_span(
                        root_span,
                        # A persisted terminal status wins; otherwise fall back to
                        # what the propagating exception implies.
                        status=(
                            persisted_status
                            if persisted_status in ("completed", "failed", "cancelled")
                            else outcome_status or persisted_status
                        ),
                        input_text=trace_input_text,
                        output_text=terminal[1] if terminal else None,
                    )
                except asyncio.CancelledError as cancel:
                    # shield() raises immediately if this task is already being
                    # cancelled. Record what we know, then re-raise below — a
                    # cancel must never be swallowed by tracing.
                    cancelled_during_finalize = cancel
                    finalize_workflow_span(root_span, status=outcome_status or "cancelled")
                except Exception:  # noqa: BLE001 — tracing must never affect the run
                    logger.debug("Failed to finalize workflow span", exc_info=True)
                    finalize_workflow_span(root_span, status=outcome_status)
                if cancelled_during_finalize is not None:
                    raise cancelled_during_finalize

        run = await _with_run_session(run_id, lambda _session, db_run: db_run, commit=False)
        if run and webhook_url:
            schedule_task(
                dispatch_webhook(
                    webhook_url,
                    {
                        "event": "run_completed" if run.status == "completed" else f"run_{run.status}",
                        "run_id": run_key,
                        "workflow_id": workflow_id,
                        "status": run.status,
                        "final_output": run.final_output,
                        "metrics": run.metrics_json,
                    },
                )
            )
        finished_trace_id = None
        if run and run.metrics_json:
            finished_trace_id = run.metrics_json.get("trace_id")
        logger.info(
            f"Run finished: {run.status if run else 'unknown'}",
            extra={
                "run_id": run_key,
                "workflow_id": workflow_id,
                "event": "run_finished",
                "trace_id": finished_trace_id or get_trace_id(),
            },
        )

    except asyncio.CancelledError:

        def _cancel(session: Session, run: models.WorkflowRun) -> bool:
            return _cas_terminal_write(
                session, run.id, "cancelled",
                {"completed_at": datetime.now(timezone.utc)},
            )

        if await _with_run_session(run_id, _cancel):
            await _put_run_event(event_queue,{"type": "run_cancelled", "run_id": run_key})
        raise

    except asyncio.TimeoutError:

        def _timeout(session: Session, run: models.WorkflowRun) -> bool:
            timeout_msg = f"Workflow timed out after {settings.run_timeout_seconds}s"
            return _cas_terminal_write(
                session, run.id, "failed",
                {"final_output": timeout_msg, "completed_at": datetime.now(timezone.utc)},
            )

        if await _with_run_session(run_id, _timeout):
            await _put_run_event(event_queue,
                {
                    "type": "run_failed",
                    "run_id": run_key,
                    "error": f"Workflow timed out after {settings.run_timeout_seconds}s",
                }
            )

    except GuardrailBlockedError as exc:
        # A configured policy may fail during setup, before the event consumer
        # can persist a hard block. Preserve truthful failed status and metrics.
        def _fail_guardrail_setup(session: Session, run: models.WorkflowRun) -> bool:
            if _is_cancel_requested(run):
                return False
            merged = dict(run.metrics_json or {})
            if not merged.get("guardrail_blocked"):
                merged.update({
                    "guardrail_blocked": True,
                    "failed_guardrails": [exc.node_id],
                    "guardrail_events": [{"node_id": exc.node_id, "scope": "workflow", "status": "failed", "message": str(exc)}],
                })
                return _cas_terminal_write(
                    session, run.id, "failed",
                    {
                        "final_output": str(exc),
                        "completed_at": run.completed_at or datetime.now(timezone.utc),
                        "metrics_json": merged,
                    },
                )
            return _cas_terminal_write(
                session, run.id, "failed",
                {"completed_at": run.completed_at or datetime.now(timezone.utc)},
            )

        if await _with_run_session(run_id, _fail_guardrail_setup):
            await _put_run_event(event_queue,
                {
                    "type": "run_failed",
                    "run_id": run_key,
                    "error": str(exc),
                    "guardrail_node_id": exc.node_id,
                }
            )

    except EvalThresholdBlockedError as exc:
        await _put_run_event(event_queue,
            {
                "type": "run_failed",
                "run_id": run_key,
                "error": str(exc),
                "eval_node_id": exc.node_id,
            }
        )

    except HumanApprovalDenied as exc:
        clear_approval_state(run_key)

        def _deny(session: Session, run: models.WorkflowRun) -> bool:
            metrics_payload = {
                "approval_denied": True,
                "node_id": exc.node_id,
                "comment": exc.comment,
            }
            if _is_cancel_requested(run):
                merged = {**(run.metrics_json or {}), **metrics_payload}
                session.execute(
                    _sa_update(models.WorkflowRun)
                    .where(models.WorkflowRun.id == run.id)
                    .values(metrics_json=merged)
                )
                return False
            merged = {**(run.metrics_json or {}), **metrics_payload}
            return _cas_terminal_write(
                session, run.id, "failed",
                {
                    "final_output": f"Approval denied at node {exc.node_id}: {exc.comment or 'rejected'}",
                    "completed_at": datetime.now(timezone.utc),
                    "metrics_json": merged,
                },
            )

        if await _with_run_session(run_id, _deny):
            await _put_run_event(event_queue,
                {
                    "type": "run_failed",
                    "run_id": run_key,
                    "error": str(exc),
                    "approval_node_id": exc.node_id,
                }
            )

    except Exception as exc:
        failed_node_id = error_context.get("last_node_id")
        failed_node_type = error_context.get("last_node_type")
        logger.exception(
            "Run failed with unexpected error",
            extra={
                "run_id": run_key,
                "failed_node_id": failed_node_id,
                "failed_node_type": failed_node_type,
            },
        )

        def _fail(session: Session, run: models.WorkflowRun) -> bool:
            if _is_cancel_requested(run):
                return False
            failure: dict[str, Any] = {}
            if failed_node_id:
                failure = {
                    "failed_node_id": failed_node_id,
                    "failed_node_type": failed_node_type,
                    "failed_node_label": error_context.get("last_node_label"),
                }
            merged = {**(run.metrics_json or {}), **failure}
            return _cas_terminal_write(
                session, run.id, "failed",
                {
                    "final_output": str(exc),
                    "completed_at": datetime.now(timezone.utc),
                    "metrics_json": merged,
                },
            )

        if await _with_run_session(run_id, _fail):
            failed_event: dict[str, Any] = {"type": "run_failed", "run_id": run_key, "error": str(exc)}
            if failed_node_id:
                failed_event["failed_node_id"] = failed_node_id
                failed_event["failed_node_type"] = failed_node_type
            await _put_run_event(event_queue, failed_event)

    finally:
        try:
            run = await _with_run_session(run_id, lambda _session, db_run: db_run, commit=False)
        except Exception:
            logger.exception("Failed to load run for final bookkeeping", extra={"run_id": run_key})
            run = None
        try:
            if run:
                workflow = run.version.workflow if run.version else None
                if workflow:

                    def _rollup(session: Session, db_run: models.WorkflowRun) -> None:
                        attempt = int((db_run.metrics_json or {}).get("trace_attempt_count") or 1)
                        record_run_rollup(
                            session,
                            user_id=workflow.user_id,
                            workflow_id=workflow.id,
                            status=db_run.status,
                            metrics=db_run.metrics_json,
                            run_id=db_run.id,
                            attempt=attempt,
                        )

                    try:
                        await _with_run_session(run_id, _rollup)
                    except Exception:
                        logger.exception("Failed to record observability rollup", extra={"run_id": run_key})
                event_type = {
                    "completed": "run_completed",
                    "failed": "run_failed",
                    "cancelled": "run_cancelled",
                }.get(run.status, "run_updated")
                await _notify_observability(run, event_type)
                if run.status == "completed" and workflow:
                    from app.services.regression_alerts import maybe_emit_eval_regression

                    await maybe_emit_eval_regression(run, workflow)
            await _put_run_event(event_queue,{"type": "stream_end", "run_id": run_key})
        except Exception:
            logger.exception("Failed to publish terminal run events", extra={"run_id": run_key})
        finally:
            # In-memory bookkeeping must never leak, even when the DB or the
            # event broker above fails: a leaked _active_tasks slot permanently
            # consumes concurrency capacity and strands subscribers.
            try:
                # The run is terminal, but the replay log is retained for a window so
                # reconnecting streams (worker mode: a different process than the one
                # that ran the workflow) can still observe the final result and
                # stream_end. Deletion is deferred to the cleanup task rather than
                # racing the fetch here.
                cleanup_task = asyncio.create_task(_schedule_run_event_cleanup(run_key, run_id))
                _cleanup_tasks.add(cleanup_task)
                cleanup_task.add_done_callback(_cleanup_tasks.discard)
            except Exception:
                logger.exception("Failed to schedule run-event cleanup", extra={"run_id": run_key})
            finally:
                _active_tasks.pop(run_key, None)
                _authoring_overrides.pop(run_key, None)
        if not _shutting_down and settings.run_execution_mode == "inline":
            # Inline mode has no worker poll loop: finishing a run frees a
            # slot, so drain the durable pending/queued backlog. In worker
            # mode the dedicated worker's poll already claims queued rows.
            # Skipped during shutdown so no new executions spawn mid-drain.
            try:
                await _drain_queued_runs()
            except Exception:
                logger.exception("Failed to drain queued runs", extra={"run_id": run_key})


async def _drain_queued_runs() -> None:
    """Claim durable pending/queued runs and schedule them in-process.

    Oldest-first via SELECT … FOR UPDATE SKIP LOCKED (claim_pending_runs),
    bounded by ``max_concurrent_runs - active``. Called after a run finishes
    (inline mode) and on API boot so a crash's queued backlog advances
    without a worker loop. Scheduled runs execute concurrently.
    """
    from app.services.run_worker import claim_pending_runs

    try:
        run_ids = await asyncio.to_thread(claim_pending_runs)
    except Exception:
        logger.exception("Failed to claim queued runs for drain")
        return
    for claimed_id in run_ids:
        try:
            schedule_run(claimed_id)
        except Exception:
            logger.exception(
                "Failed to schedule claimed run",
                extra={"run_id": str(claimed_id)},
            )


def schedule_run(run_id: uuid.UUID) -> None:
    if _shutting_down:
        # Deploy shutdown in progress: never start new executions that the
        # snapshot already missed (they would run DB writes mid-shutdown).
        return
    run_key = str(run_id)
    existing = _active_tasks.get(run_key)
    if existing is not None and not existing.done():
        return
    broker = _run_events.get(run_key)
    if broker is None or broker.terminated:
        # A re-executed run within the TTL window must not inherit the prior
        # attempt's terminated broker (new subscribers would get instant
        # stream_end and the delivered-set would swallow the new attempt's
        # overlapping seqs). The stale cleanup task compares broker identity
        # and skips deletion once it sees the replacement.
        _run_events[run_key] = _RunEventBroker()
    task = asyncio.create_task(execute_run(run_id))
    _active_tasks[run_key] = task


_shutting_down = False


async def shutdown_active_runs() -> None:
    global _shutting_down
    _shutting_down = True
    try:
        # Loop until drained: concurrently-finishing runs respawn drain tasks
        # after the first snapshot; each iteration cancels what's present.
        while True:
            live = [(k, t) for k, t in _active_tasks.items() if not t.done()]
            if not live:
                break
            for _run_id, task in live:
                task.cancel()
            for _run_id, task in live:
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        _active_tasks.clear()
        for task in list(_cleanup_tasks):
            if not task.done():
                task.cancel()
        for task in list(_cleanup_tasks):
            try:
                await task
            except asyncio.CancelledError:
                pass
    finally:
        _shutting_down = False


def active_run_count() -> int:
    return len(_active_tasks)


def active_run_ids() -> set[str]:
    """Run ids that currently have a live in-process asyncio task."""
    return set(_active_tasks.keys())


async def cancel_run(run_id: str) -> bool:
    task = _active_tasks.get(run_id)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return True
    return False


async def stream_run_events(
    run_id: str, after_seq: int = 0
) -> AsyncGenerator[dict[str, Any], None]:
    broker = _run_events.setdefault(run_id, _RunEventBroker())
    # Subscribe BEFORE replaying the durable log so events published during the
    # fetch land in the live queue; seq tracking below dedupes the overlap.
    # The replay runs even when the broker already terminated: a reconnect in
    # the pre-cleanup window would otherwise get a bare stream_end and lose
    # the persisted run_completed/run_failed payload.
    event_queue = broker.subscribe()
    last_seq = after_seq
    try:
        replay = await asyncio.to_thread(fetch_run_events, run_id, after_seq)
        for event in replay:
            seq = event.get("seq")
            if isinstance(seq, int):
                last_seq = max(last_seq, seq)
                # Mark replayed seqs delivered so a NOTIFY-driven redispatch of
                # the same rows cannot double-deliver them to this subscriber.
                broker.mark_delivered(seq)
            yield event
            if event.get("type") == "stream_end":
                return
        if broker.terminated:
            # Replay covered everything persisted; nothing more will arrive.
            yield {"type": "stream_end"}
            return
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=30)
            except asyncio.TimeoutError:
                yield {"type": "heartbeat"}
                continue
            seq = event.get("seq")
            if isinstance(seq, int):
                if seq <= last_seq:
                    continue  # already replayed from the durable log
                last_seq = seq
            yield event
            if event.get("type") == "stream_end":
                break
    finally:
        broker.unsubscribe(event_queue)
        if not broker.subscribers:
            active = _active_tasks.get(run_id)
            if active is None or active.done():
                _run_events.pop(run_id, None)


def _on_remote_run_event(run_id: str, seq: int, event_type: str, payload: dict[str, Any]) -> None:
    """Dispatch a run event published by another process into the local broker.

    Registered as the event-bus run-event dispatcher: a NOTIFY/sweep delivery
    fans out to local SSE subscribers exactly like a local publish. The broker's
    bounded delivered-set dedupes seqs this process already broadcast.
    """
    broker = _run_events.get(run_id)
    if broker is None:
        return
    broker.broadcast({**payload, "type": event_type, "seq": seq})


def _observed_run_ids() -> set[str]:
    """Runs the catch-up sweep should poll: executing tasks + streamed runs."""
    return set(_active_tasks) | {key for key, broker in _run_events.items() if broker.subscribers}


set_run_event_dispatcher(_on_remote_run_event)
set_active_run_ids_provider(_observed_run_ids)