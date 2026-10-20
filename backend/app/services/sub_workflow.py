"""Execute a child workflow from a Sub-workflow node (n8n Execute Workflow)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any
from uuid import UUID

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from sqlalchemy.orm import joinedload

from app.db import models
from app.db.database import SessionLocal
from app.services.eval import EvalThresholdBlockedError
from app.services.guardrail import GuardrailBlockedError
from app.services.workflow_context import WorkflowContext, context_lock
from app.services.executor import _resolve_node_id

MAX_SUB_WORKFLOW_DEPTH = 8


async def execute_sub_workflow(
    workflow_id: UUID,
    input_text: str,
    *,
    user_id: UUID | None = None,
    parent_context: dict[str, Any] | None = None,
) -> str:
    call_stack = list((parent_context or {}).get("_sub_workflow_stack") or [])
    workflow_key = str(workflow_id)
    if workflow_key in call_stack:
        from app.services.node_handlers import NodeExecutionError

        raise NodeExecutionError(f"Sub-workflow error: circular dependency detected ({workflow_key})")
    if len(call_stack) >= MAX_SUB_WORKFLOW_DEPTH:
        from app.services.node_handlers import NodeExecutionError

        raise NodeExecutionError(
            f"Sub-workflow error: max nesting depth ({MAX_SUB_WORKFLOW_DEPTH}) exceeded"
        )

    # Run the whole DB unit of work in a worker thread so the sync SQLAlchemy
    # session never blocks the event loop. The session is opened, read, and
    # closed entirely inside the thread; only the plain graph_json dict escapes.
    def _load_graph_json() -> dict | None:
        db = SessionLocal()
        try:
            if user_id is None:
                # Fail closed: without an owning user we cannot scope the
                # lookup, and an unscoped lookup would read any tenant's graph.
                return None
            workflow = (
                db.query(models.Workflow)
                .options(joinedload(models.Workflow.versions))
                .filter(
                    models.Workflow.id == workflow_id,
                    models.Workflow.user_id == user_id,
                )
            ).first()
            if not workflow or not workflow.versions:
                return None
            version = max(workflow.versions, key=lambda v: v.version_number)
            return version.graph_json
        finally:
            db.close()

    graph_json = await asyncio.to_thread(_load_graph_json)
    if graph_json is None:
        from app.services.node_handlers import NodeExecutionError

        raise NodeExecutionError(f"Sub-workflow error: workflow {workflow_id} not found")

    child_context = WorkflowContext.from_input(input_text)
    context_ref = child_context.to_dict()
    context_ref["_sub_workflow_stack"] = [*call_stack, workflow_key]
    if user_id is not None:
        context_ref["_user_id"] = str(user_id)
    if parent_context:
        context_ref["parent"] = {
            "input": parent_context.get("input"),
            "last_output": parent_context.get("last_output"),
        }

    from app.services.compiler import compile_workflow
    from app.services.llm_providers import validate_provider_endpoints

    # Same execution-boundary gate as execute_run: the child graph was never
    # admission-checked, and its ADK path never calls generate_*.
    def _gate_child_endpoints() -> None:
        validate_provider_endpoints(graph_json, context_ref)

    try:
        await asyncio.to_thread(_gate_child_endpoints)
    except ValueError as exc:
        from app.services.node_handlers import NodeExecutionError

        raise NodeExecutionError(f"Sub-workflow error: {exc}") from exc

    compiled, metadata, _author_lookup = compile_workflow(
        graph_json, context_ref=context_ref
    )
    session_service = InMemorySessionService()
    runner = Runner(
        app_name="aegis-sub",
        node=compiled,
        session_service=session_service,
        auto_create_session=True,
    )

    from app.services.tracing import operation_span

    final_output: str | None = None
    child_outputs: dict[str, str] = {}
    try:
        with operation_span(
            "sub_workflow.run",
            {
                "aegis.operation": "sub_workflow",
                "aegis.sub_workflow_id": workflow_key,
                "langsmith.metadata.aegis_operation": "sub_workflow",
            },
        ):
            async for event in runner.run_async(
                user_id="aegis-sub-user",
                session_id=str(uuid.uuid4()),
                new_message=types.Content(parts=[types.Part(text=input_text)]),
            ):
                text = getattr(event, "output", None) or getattr(event, "content", None)
                if text:
                    node_path = getattr(getattr(event, "node_info", None), "path", None)
                    node_id = _resolve_node_id(
                        getattr(event, "author", None), metadata, _author_lookup, node_path
                    )
                    if hasattr(text, "parts"):
                        parts = [getattr(p, "text", "") for p in text.parts if getattr(p, "text", None)]
                        if parts:
                            final_output = "\n".join(parts)
                    elif isinstance(text, str):
                        final_output = text
                    if node_id and final_output:
                        child_outputs[node_id] = final_output
        # Threshold checks live in the executor for top-level runs; the child
        # path consumes raw events, so run its eval nodes here — a blocking
        # fail raises EvalThresholdBlockedError, contained below.
        await _check_child_evaluations(metadata, child_outputs, context_ref, input_text)
    except GuardrailBlockedError as exc:
        # Contain child failures here so the child's node_id never propagates
        # into the parent executor's metadata lookup (which would KeyError).
        # Raise, though: a returned string is a successful child output, so the
        # parent never takes its error edge or retry policy.
        from app.services.node_handlers import NodeExecutionError

        raise NodeExecutionError(
            f"Sub-workflow error: guardrail blocked at child node {exc.node_id}: {exc}"
        ) from exc
    except EvalThresholdBlockedError as exc:
        from app.services.node_handlers import NodeExecutionError

        raise NodeExecutionError(
            f"Sub-workflow error: eval threshold not met at child node "
            f"{exc.node_id}: {exc}"
        ) from exc
    finally:
        # Direct LLM calls the child recorded (deferred evals via
        # ``_direct_llm_calls``, and any nested sub-workflow's folded list)
        # live on the child dict, which is discarded here. Fold them into the
        # parent context once, on every exit — success, eval/guardrail block,
        # or a later exception — so the parent's token totals see what the
        # child already spent. The parent executor sums this same list (as
        # LlmCall rows or directly on failure), so they must NOT also go into
        # the parent's deferred_eval_usage or they'd count twice.
        if parent_context is not None:
            parent_calls = parent_context.get("_direct_llm_calls")
            child_calls = context_ref.get("_direct_llm_calls")
            if child_calls and child_calls is not parent_calls:
                with context_lock(parent_context):
                    parent_context.setdefault("_direct_llm_calls", []).extend(child_calls)

    end_ids = [nid for nid, meta in metadata.items() if meta.get("type") == "end"]
    if not final_output and end_ids:
        return child_context.to_dict().get("last_output") or input_text
    return final_output or child_context.to_dict().get("last_output") or input_text


async def _check_child_evaluations(
    metadata: dict[str, dict],
    child_outputs: dict[str, str],
    context_ref: dict[str, Any],
    request_context: str,
) -> None:
    """Threshold-check the child graph's eval nodes.

    ``run_async`` yields raw events; nothing in this path applies the
    ``eval_threshold``/``evalFailBehavior`` metadata the compiler stamps, so a
    blocking eval inside a sub-workflow used to pass through as a successful
    child output. Inline (non-deferred) evals score their own emitted text;
    deferred evals go through ``run_parallel_evaluations`` like the executor's
    deferred pass. A blocking below-threshold score raises
    ``EvalThresholdBlockedError`` — converted to ``NodeExecutionError`` by the
    caller so the parent's error edge runs.
    """
    from app.services.eval_runner import run_parallel_evaluations
    from app.services.executor import _parse_evaluation_scores
    from app.services.llm_providers import resolve_provider_model

    deferred_specs: list[tuple[str, dict[str, Any], str]] = []
    for node_id, meta in metadata.items():
        if not meta.get("is_evaluation"):
            continue
        if meta.get("eval_deferred"):
            deferred_specs.append(
                (
                    node_id,
                    {**meta, "_provider_model": resolve_provider_model(meta, context_ref)},
                    child_outputs.get(node_id, ""),
                )
            )
            continue
        scores = _parse_evaluation_scores(
            child_outputs.get(node_id), meta.get("score_weights")
        )
        _raise_on_blocked_eval(node_id, meta, scores)

    if not deferred_specs:
        return
    results = await run_parallel_evaluations(deferred_specs, request_context=request_context)
    for node_id, scores, _error in results:
        if scores:
            usage = scores.pop("_token_usage", None)
            if usage:
                # Deferred evals are extra LLM calls the ADK tracker never sees;
                # the executor folds this sink into the parent run's totals.
                context_ref.setdefault("_direct_llm_calls", []).append(
                    {
                        "node_id": f"sub:{node_id}",
                        "total_tokens": int(usage.get("total_tokens") or 0),
                    }
                )
            _raise_on_blocked_eval(node_id, metadata[node_id], scores)


def _raise_on_blocked_eval(
    node_id: str, meta: dict[str, Any], scores: dict[str, Any] | None
) -> None:
    if not scores:
        return
    threshold = meta.get("eval_threshold")
    aggregate = scores.get("aggregate_score")
    if (
        threshold is None
        or aggregate is None
        or float(aggregate) >= float(threshold)
        or meta.get("eval_fail_behavior", "none") != "block"
    ):
        return
    raise EvalThresholdBlockedError(
        f"Eval score {aggregate} below threshold {threshold}",
        node_id,
        float(aggregate),
    )