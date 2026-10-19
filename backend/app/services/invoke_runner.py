"""Shared invoked-run helpers: authenticate → create → admit → wait.

Extracted from ``app.api.platform`` so the HTTP invoke route and the MCP
server's ``tools/call`` dispatch run the identical code path. Both pieces that
block on the ORM (``create_invoked_run`` and ``poll_run_terminal_result``) are
synchronous and must be driven via ``asyncio.to_thread``; ``invoke_and_wait``
is the async orchestrator that does that and schedules the committed run.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.budgets import check_workflow_budget
from app.services.deployments import authenticate_invoke
from app.services.executor import active_run_count, schedule_run
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.rate_limit import check_deployment_rate_limit
from app.services.run_concurrency import count_active_runs, schedule_committed_run
from app.services.workflow_capabilities import missing_provider_keys, validate_mcp_tool_bindings

logger = logging.getLogger("aegis.invoke_runner")


class InvokeRequestBody(Protocol):
    """Shape shared by ``platform.InvokePayload`` and MCP call arguments."""

    input: str
    session_id: str | None
    tags: list[str] | None
    version_id: UUID | None


@dataclass
class InvokeRequestData:
    """Concrete InvokeRequestBody for non-Pydantic callers (e.g. MCP tools/call)."""

    input: str
    session_id: str | None = None
    tags: list[str] | None = None
    version_id: UUID | None = None


# Cap per-turn payload copied into a follow-up run's context — keeps
# metrics_json (which also carries aggregates) bounded on long sessions.
_SESSION_TURN_MAX_CHARS = 4000
_SESSION_HISTORY_MAX_TURNS = 50


def _load_session_history(
    db: Session, workflow_version_id: UUID, session_id: str
) -> list[dict]:
    """Prior completed turns for this session, oldest first (max 50).

    ``id`` tiebreaks equal ``created_at`` stamps so replay is deterministic.
    Two invokes with the same session_id in flight at once each snapshot the
    same history and fork — the run rows only exist serially, so there is no
    cheap cross-process serialization to claim here; callers wanting linear
    sessions must serialize invokes themselves.
    """
    rows = (
        db.query(models.WorkflowRun)
        .filter(
            models.WorkflowRun.workflow_version_id == workflow_version_id,
            models.WorkflowRun.session_id == session_id,
            models.WorkflowRun.status == "completed",
        )
        .order_by(models.WorkflowRun.created_at.desc(), models.WorkflowRun.id.desc())
        .limit(_SESSION_HISTORY_MAX_TURNS)
        .all()
    )
    history: list[dict] = []
    for prior in reversed(rows):
        history.append(
            {
                "run_id": str(prior.id),
                "input": (prior.input_text or "")[:_SESSION_TURN_MAX_CHARS],
                "output": (prior.final_output or "")[:_SESSION_TURN_MAX_CHARS],
                "created_at": prior.created_at.isoformat() if prior.created_at else None,
            }
        )
    return history


def create_invoked_run(
    db: Session,
    workflow_id: UUID,
    payload: InvokeRequestBody,
    headers: dict[str, str],
    raw_body: bytes,
    path: str,
    *,
    internal: bool = False,
) -> tuple[UUID, int]:
    """Blocking DB portion of an invoke call (runs in a worker thread).

    Returns the run id, not the ORM object — attributes expire on commit, so
    reading ``run.id`` back on the event loop would emit a refresh query there.
    """
    workflow, version = authenticate_invoke(
        db, workflow_id, payload.version_id, headers, raw_body, path, internal=internal
    )
    check_deployment_rate_limit(str(workflow.deployment.id))

    breach = check_workflow_budget(db, workflow)
    if breach:
        raise HTTPException(status_code=429, detail=breach)

    user_id = workflow.user_id

    try:
        validate_workflow_graph(version.graph_json or {})
        validate_mcp_tool_bindings(version.graph_json or {}, db, user_id)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    in_memory_runs = active_run_count()
    if settings.run_execution_mode == "worker":
        active = max(in_memory_runs, count_active_runs(db))
    else:
        active = in_memory_runs
    if active >= settings.max_concurrent_runs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many concurrent runs (limit: {settings.max_concurrent_runs})",
        )

    missing_keys = missing_provider_keys(version.graph_json or {}, user_id)
    if missing_keys:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{', '.join(missing_keys)} not configured. "
                "Add them to .env to run LLM workflows."
            ),
        )

    session_id = (payload.session_id or "").strip() or None
    session_history = (
        _load_session_history(db, version.id, session_id) if session_id else []
    )
    run = models.WorkflowRun(
        workflow_version_id=version.id,
        status="pending",
        input_text=payload.input,
        session_id=session_id,
        # Staged on metrics_json (no dedicated column): execute_run reads it
        # back and seeds the workflow context before the first node runs.
        metrics_json={"session_history": session_history} if session_history else None,
        tags_json=(
            [t.strip() for t in payload.tags if isinstance(t, str) and t.strip()]
            if payload.tags
            else None
        ),
    )
    db.add(run)
    db.commit()
    return run.id, version.version_number


def create_event_run(
    db: Session,
    workflow_id: UUID,
    headers: dict[str, str],
    raw_body: bytes,
    path: str,
    *,
    input_payload: dict,
    tags: list[str] | None = None,
) -> tuple[UUID, int]:
    """Authenticate an inbound event webhook and commit its run (worker thread).

    Same admission checks as ``create_invoked_run`` minus session history —
    webhook events are single-shot inputs.
    """
    from app.services.deployments import authenticate_event_webhook

    workflow, deployment, version = authenticate_event_webhook(
        db, workflow_id, headers, raw_body, path
    )
    check_deployment_rate_limit(str(deployment.id))

    breach = check_workflow_budget(db, workflow)
    if breach:
        raise HTTPException(status_code=429, detail=breach)

    user_id = workflow.user_id

    try:
        validate_workflow_graph(version.graph_json or {})
        validate_mcp_tool_bindings(version.graph_json or {}, db, user_id)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    in_memory_runs = active_run_count()
    if settings.run_execution_mode == "worker":
        active = max(in_memory_runs, count_active_runs(db))
    else:
        active = in_memory_runs
    if active >= settings.max_concurrent_runs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many concurrent runs (limit: {settings.max_concurrent_runs})",
        )

    missing_keys = missing_provider_keys(version.graph_json or {}, user_id)
    if missing_keys:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{', '.join(missing_keys)} not configured. "
                "Add them to .env to run LLM workflows."
            ),
        )

    run = models.WorkflowRun(
        workflow_version_id=version.id,
        status="pending",
        input_text=json.dumps(input_payload),
        tags_json=(
            [t.strip() for t in tags if isinstance(t, str) and t.strip()]
            if tags
            else None
        ),
    )
    db.add(run)
    db.commit()
    return run.id, version.version_number


def poll_run_terminal_result(run_id: UUID) -> dict | None:
    """One status poll for an invoke wait loop (runs in a worker thread).

    A fresh session per poll sees newly committed rows without the
    transaction-lifetime rollback dance.
    """
    session = SessionLocal()
    try:
        current = (
            session.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
        )
        if current is None or current.status not in {"completed", "failed", "cancelled"}:
            return None
        metrics = current.metrics_json or {}
        return {
            "status": current.status,
            "output": current.final_output,
            "eval_aggregate": metrics.get("eval_aggregate"),
            "total_cost_usd": metrics.get("total_cost_usd"),
            "latency_ms": metrics.get("latency_ms"),
        }
    finally:
        session.close()


async def invoke_and_wait(
    db: Session,
    workflow_id: UUID,
    payload: InvokeRequestBody,
    headers: dict[str, str],
    raw_body: bytes,
    path: str,
    *,
    timeout: float = 90.0,
    poll_interval: float = 0.5,
    internal: bool = False,
) -> dict:
    """Create, admit and block on an invoked run until terminal or ``timeout``.

    Mirrors the wait branch of ``platform.invoke_workflow``: the create runs in
    a worker thread under a shield so a cancelled caller still gets its
    committed run scheduled, and each poll opens a fresh session so executor
    commits are visible.
    """
    create = asyncio.ensure_future(
        asyncio.to_thread(create_invoked_run, db, workflow_id, payload, headers, raw_body, path, internal=internal)
    )
    try:
        run_id, version_number = await asyncio.shield(create)
    except asyncio.CancelledError:
        # to_thread is not cancellable — the commit still lands. Preserve the
        # create contract (a committed run always gets scheduled) so the row
        # does not linger pending until the staleness sweep. M13: this path
        # previously bypassed the capacity gate with a raw schedule_run; the
        # cancelled caller is gone, so a rejected slot is just logged, not
        # a 429 to nobody.
        run_id, _ = await create
        if settings.run_execution_mode != "worker":
            if not await schedule_committed_run(run_id):
                logger.warning(
                    "Cancelled invoke committed a run but the capacity gate rejected scheduling",
                    extra={"run_id": run_id},
                )
        raise

    if settings.run_execution_mode != "worker":
        if not await schedule_committed_run(run_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many concurrent runs (limit: {settings.max_concurrent_runs})",
            )

    deadline = timeout
    while deadline > 0:
        await asyncio.sleep(poll_interval)
        deadline -= poll_interval
        result = await asyncio.to_thread(poll_run_terminal_result, run_id)
        if result is not None:
            return {"run_id": str(run_id), "version": version_number, **result}
    return {"run_id": str(run_id), "status": "running", "version": version_number}
