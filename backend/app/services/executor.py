from __future__ import annotations

import asyncio
import json
import os
import queue
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from sqlalchemy.orm import Session

from app.config import settings
from app.db import models
from app.services.compiler import EvalScores, GuardrailResult, compile_workflow

_run_events: dict[str, queue.Queue[dict[str, Any]]] = {}


def _ensure_api_key() -> None:
    from app.config import configure_runtime_env

    configure_runtime_env()


def _stringify_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "text") and value.text:
        return str(value.text)
    if hasattr(value, "parts"):
        texts = [part.text for part in value.parts if getattr(part, "text", None)]
        if texts:
            return "\n".join(texts)
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    text = str(value)
    if text.startswith("parts=[Part(") and "text=" in text:
        import re

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

    content = getattr(event, "content", None)
    return _stringify_value(content)


def _extract_token_usage(event: Any) -> dict | None:
    usage = getattr(event, "usage_metadata", None)
    if not usage:
        return None
    return {
        "prompt_tokens": getattr(usage, "prompt_token_count", None),
        "completion_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    }


async def execute_run(db: Session, run_id: uuid.UUID) -> None:
    _ensure_api_key()
    run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
    if not run:
        return

    version = run.version
    graph_json = version.graph_json
    run_key = str(run_id)
    if run_key not in _run_events:
        _run_events[run_key] = queue.Queue()
    event_queue = _run_events[run_key]

    guardrail_results: dict[str, GuardrailResult] = {}
    eval_results: dict[str, EvalScores] = {}

    def on_guardrail(node_id: str, result: GuardrailResult) -> None:
        guardrail_results[node_id] = result

    def on_eval(node_id: str, result: EvalScores) -> None:
        eval_results[node_id] = result

    try:
        workflow, metadata = compile_workflow(
            graph_json,
            on_guardrail_result=on_guardrail,
            on_eval_result=on_eval,
        )

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        event_queue.put({"type": "run_started", "run_id": str(run_id)})

        session_service = InMemorySessionService()
        runner = Runner(
            app_name="aegis",
            node=workflow,
            session_service=session_service,
            auto_create_session=True,
        )

        session_id = str(uuid.uuid4())
        user_id = "aegis-user"

        started_nodes: dict[str, float] = {}
        node_outputs: dict[str, str] = {}
        total_tokens = 0
        final_output: str | None = None

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(parts=[types.Part(text=run.input_text)]),
        ):
            author = getattr(event, "author", None) or "workflow"
            text = _extract_text_from_event(event)
            token_usage = _extract_token_usage(event)

            matched_node_id = None
            for node_id, meta in metadata.items():
                if author.endswith(node_id) or author == meta.get("label"):
                    matched_node_id = node_id
                    break

            if matched_node_id is None:
                for node_id in metadata:
                    prefix = metadata[node_id]["type"]
                    if author.startswith(prefix) or author.startswith(f"{prefix}_{node_id}"):
                        matched_node_id = node_id
                        break

            if matched_node_id:
                if matched_node_id not in started_nodes:
                    started_nodes[matched_node_id] = time.time()
                    event_queue.put(
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

                if getattr(event, "turn_complete", False) or text:
                    latency_ms = None
                    if matched_node_id in started_nodes:
                        latency_ms = int((time.time() - started_nodes[matched_node_id]) * 1000)

                    meta = metadata[matched_node_id]
                    node_result = models.NodeResult(
                        run_id=run_id,
                        node_id=matched_node_id,
                        node_type=meta["type"],
                        node_label=meta["label"],
                        status="completed",
                        output=text,
                        latency_ms=latency_ms,
                        token_usage=token_usage,
                    )

                    if meta.get("is_guardrail"):
                        gr = guardrail_results.get(matched_node_id)
                        if gr:
                            node_result.guardrail_status = "passed" if gr.passed else "failed"
                            node_result.output = gr.message
                        elif text:
                            try:
                                parsed = json.loads(text)
                                node_result.guardrail_status = "passed" if parsed.get("passed") else "failed"
                            except json.JSONDecodeError:
                                node_result.guardrail_status = "passed" if "passed" in (text or "").lower() else "failed"

                    if meta.get("is_evaluation") and text:
                        try:
                            parsed = json.loads(text)
                            node_result.evaluation_scores = {
                                "faithfulness": parsed.get("faithfulness"),
                                "helpfulness": parsed.get("helpfulness"),
                                "reasoning": parsed.get("reasoning", ""),
                            }
                        except json.JSONDecodeError:
                            node_result.evaluation_scores = {"raw": text}

                    db.add(node_result)
                    db.commit()

                    event_queue.put(
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

        run.status = "completed"
        run.final_output = final_output or (list(node_outputs.values())[-1] if node_outputs else None)
        run.completed_at = datetime.now(timezone.utc)
        run.metrics_json = {
            "latency_ms": int((run.completed_at - run.started_at).total_seconds() * 1000)
            if run.started_at
            else None,
            "total_tokens": total_tokens,
            "node_count": len(metadata),
        }
        db.commit()

        event_queue.put(
            {
                "type": "run_completed",
                "run_id": str(run_id),
                "final_output": run.final_output,
                "metrics": run.metrics_json,
            }
        )

    except Exception as exc:
        run.status = "failed"
        run.completed_at = datetime.now(timezone.utc)
        run.final_output = str(exc)
        db.commit()
        event_queue.put({"type": "run_failed", "run_id": str(run_id), "error": str(exc)})
    finally:
        event_queue.put({"type": "stream_end"})


async def stream_run_events(run_id: str) -> AsyncGenerator[dict[str, Any], None]:
    event_queue = _run_events.setdefault(run_id, queue.Queue())
    while True:
        try:
            event = await asyncio.to_thread(event_queue.get, True, 30)
        except queue.Empty:
            yield {"type": "heartbeat"}
            continue
        yield event
        if event.get("type") == "stream_end":
            _run_events.pop(run_id, None)
            break