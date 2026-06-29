from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.logging_config import log_context
from app.services.compiler import compile_workflow
from app.services.eval import EvalScores, compute_aggregate_score
from app.services.guardrail import GuardrailBlockedError, GuardrailResult
from app.services.webhook import dispatch_webhook

import logging

logger = logging.getLogger("aegis.executor")

_run_events: dict[str, asyncio.Queue[dict[str, Any]]] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}


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


def _extract_token_usage(event: Any) -> dict | None:
    usage = getattr(event, "usage_metadata", None)
    if not usage:
        return None
    return {
        "prompt_tokens": getattr(usage, "prompt_token_count", None),
        "completion_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    }


def _resolve_node_id(author: str | None, metadata: dict[str, dict]) -> str | None:
    if not author:
        return None
    for node_id, meta in metadata.items():
        if meta.get("node_id") == author:
            return node_id
        adk_name = meta.get("adk_name", "")
        if author == adk_name or author.endswith(f"_{node_id}"):
            return node_id
    return None


def _parse_evaluation_scores(text: str | None) -> dict | None:
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
            aggregate = compute_aggregate_score(scores)
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
        if gr.severity == "warn":
            return ("warned", gr.message)
        return ("passed" if gr.passed else "failed", gr.message)
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


async def _run_workflow(
    run: models.WorkflowRun,
    graph_json: dict,
    event_queue: asyncio.Queue[dict[str, Any]],
    db: Session,
) -> None:
    guardrail_results: dict[str, GuardrailResult] = {}
    eval_results: dict[str, EvalScores] = {}

    def on_guardrail(node_id: str, result: GuardrailResult) -> None:
        guardrail_results[node_id] = result

    def on_eval(node_id: str, result: EvalScores) -> None:
        eval_results[node_id] = result

    workflow, metadata = compile_workflow(
        graph_json,
        on_guardrail_result=on_guardrail,
        on_eval_result=on_eval,
    )

    session_service = InMemorySessionService()
    runner = Runner(
        app_name="aegis",
        node=workflow,
        session_service=session_service,
        auto_create_session=True,
    )

    started_nodes: dict[str, float] = {}
    completed_nodes: set[str] = set()
    node_outputs: dict[str, str] = {}
    eval_score_rows: list[dict] = []
    failed_guardrails: list[str] = []
    total_tokens = 0
    final_output: str | None = None

    async def _consume_events() -> None:
        nonlocal final_output, total_tokens

        async for event in runner.run_async(
            user_id="aegis-user",
            session_id=str(uuid.uuid4()),
            new_message=types.Content(parts=[types.Part(text=run.input_text)]),
        ):
            author = getattr(event, "author", None) or "workflow"
            text = _extract_text_from_event(event)
            token_usage = _extract_token_usage(event)
            matched_node_id = _resolve_node_id(author, metadata)

            if not matched_node_id:
                continue

            if matched_node_id not in started_nodes:
                started_nodes[matched_node_id] = time.time()
                await event_queue.put(
                    {
                        "type": "node_started",
                        "node_id": matched_node_id,
                        "node_label": metadata[matched_node_id]["label"],
                    }
                )

            if text:
                node_outputs[matched_node_id] = text
                final_output = text

            if token_usage and token_usage.get("total_tokens"):
                total_tokens += int(token_usage["total_tokens"] or 0)

            is_complete = bool(getattr(event, "turn_complete", False) or text)
            if is_complete and matched_node_id not in completed_nodes:
                completed_nodes.add(matched_node_id)
                latency_ms = int((time.time() - started_nodes[matched_node_id]) * 1000)

                meta = metadata[matched_node_id]
                node_result = models.NodeResult(
                    run_id=run.id,
                    node_id=matched_node_id,
                    node_type=meta["type"],
                    node_label=meta["label"],
                    status="completed",
                    output=text,
                    latency_ms=latency_ms,
                    token_usage=token_usage,
                )

                if meta.get("is_guardrail"):
                    status, output = _parse_guardrail_status(matched_node_id, text, guardrail_results)
                    node_result.guardrail_status = status
                    if output:
                        node_result.output = output
                    if status in {"failed", "warned"}:
                        failed_guardrails.append(matched_node_id)

                if meta.get("is_evaluation"):
                    node_result.evaluation_scores = _parse_evaluation_scores(text)
                    if node_result.evaluation_scores:
                        eval_score_rows.append(
                            {
                                "node_id": matched_node_id,
                                "node_label": meta["label"],
                                **node_result.evaluation_scores,
                            }
                        )

                db.add(node_result)
                db.commit()

                await event_queue.put(
                    {
                        "type": "node_completed",
                        "node_id": matched_node_id,
                        "node_label": meta["label"],
                        "output": node_result.output,
                        "evaluation_scores": node_result.evaluation_scores,
                        "guardrail_status": node_result.guardrail_status,
                        "latency_ms": latency_ms,
                    }
                )

    await asyncio.wait_for(_consume_events(), timeout=settings.run_timeout_seconds)

    run.status = "completed"
    run.final_output = final_output or (list(node_outputs.values())[-1] if node_outputs else None)
    run.completed_at = datetime.now(timezone.utc)
    aggregates = [
        row["aggregate_score"]
        for row in eval_score_rows
        if isinstance(row.get("aggregate_score"), (int, float))
    ]
    run.metrics_json = {
        "latency_ms": int((run.completed_at - run.started_at).total_seconds() * 1000)
        if run.started_at
        else None,
        "total_tokens": total_tokens,
        "node_count": len(metadata),
        "eval_scores": eval_score_rows,
        "eval_aggregate": round(sum(aggregates) / len(aggregates), 2) if aggregates else None,
        "failed_guardrails": failed_guardrails,
    }
    db.commit()

    await event_queue.put(
        {
            "type": "run_completed",
            "run_id": str(run.id),
            "final_output": run.final_output,
            "metrics": run.metrics_json,
        }
    )


async def execute_run(run_id: uuid.UUID) -> None:
    _ensure_api_key()
    db = SessionLocal()
    run_key = str(run_id)
    event_queue = _run_events.setdefault(run_key, asyncio.Queue())

    try:
        run = (
            db.query(models.WorkflowRun)
            .options(
                joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow)
            )
            .filter(models.WorkflowRun.id == run_id)
            .first()
        )
        if not run or not run.version:
            return

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        workflow = run.version.workflow if run.version else None
        workflow_id = str(workflow.id) if workflow else None
        log_context(
            logger,
            logging.INFO,
            "Run started",
            run_id=run_key,
            workflow_id=workflow_id,
            event="run_started",
        )

        await event_queue.put({"type": "run_started", "run_id": run_key})
        await _run_workflow(run, run.version.graph_json, event_queue, db)

        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        if run and workflow and workflow.webhook_url:
            await dispatch_webhook(
                workflow.webhook_url,
                {
                    "event": "run_completed" if run.status == "completed" else f"run_{run.status}",
                    "run_id": run_key,
                    "workflow_id": workflow_id,
                    "status": run.status,
                    "final_output": run.final_output,
                    "metrics": run.metrics_json,
                },
            )
        log_context(
            logger,
            logging.INFO,
            f"Run finished: {run.status if run else 'unknown'}",
            run_id=run_key,
            workflow_id=workflow_id,
            event="run_finished",
        )

    except asyncio.CancelledError:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        if run:
            run.status = "cancelled"
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
        await event_queue.put({"type": "run_cancelled", "run_id": run_key})
        raise

    except asyncio.TimeoutError:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        if run:
            run.status = "failed"
            run.final_output = f"Workflow timed out after {settings.run_timeout_seconds}s"
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
        await event_queue.put(
            {
                "type": "run_failed",
                "run_id": run_key,
                "error": f"Workflow timed out after {settings.run_timeout_seconds}s",
            }
        )

    except GuardrailBlockedError as exc:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        if run:
            run.status = "failed"
            run.final_output = f"Guardrail blocked at node {exc.node_id}: {exc}"
            run.completed_at = datetime.now(timezone.utc)
            run.metrics_json = {"failed_guardrails": [exc.node_id], "guardrail_blocked": True}
            db.commit()
        await event_queue.put(
            {
                "type": "run_failed",
                "run_id": run_key,
                "error": str(exc),
                "guardrail_node_id": exc.node_id,
            }
        )

    except Exception as exc:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        if run:
            run.status = "failed"
            run.final_output = str(exc)
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
        await event_queue.put({"type": "run_failed", "run_id": run_key, "error": str(exc)})

    finally:
        await event_queue.put({"type": "stream_end"})
        db.close()
        _active_tasks.pop(run_key, None)


def schedule_run(run_id: uuid.UUID) -> None:
    _run_events[str(run_id)] = asyncio.Queue()
    task = asyncio.create_task(execute_run(run_id))
    _active_tasks[str(run_id)] = task


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


async def stream_run_events(run_id: str) -> AsyncGenerator[dict[str, Any], None]:
    event_queue = _run_events.setdefault(run_id, asyncio.Queue())
    while True:
        try:
            event = await asyncio.wait_for(event_queue.get(), timeout=30)
        except asyncio.TimeoutError:
            yield {"type": "heartbeat"}
            continue
        yield event
        if event.get("type") == "stream_end":
            _run_events.pop(run_id, None)
            break