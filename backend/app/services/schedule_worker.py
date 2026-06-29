"""Background cron scheduler for workflow Trigger nodes (n8n Schedule Trigger)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from croniter import croniter
from sqlalchemy.orm import joinedload

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.executor import schedule_run
from app.services.graph_validation import GraphValidationError, validate_workflow_graph

logger = logging.getLogger("aegis.scheduler")

_last_fired_minute: dict[str, str] = {}
_scheduler_task: asyncio.Task[None] | None = None


def cron_matches_now(cron_expr: str, now: datetime | None = None) -> bool:
    moment = (now or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    try:
        itr = croniter(cron_expr.strip(), moment - timedelta(minutes=1))
        next_fire = itr.get_next(datetime).replace(second=0, microsecond=0)
        return next_fire == moment
    except (ValueError, KeyError):
        return False


def should_fire_schedule(workflow_id: str, minute_key: str, fired: dict[str, str]) -> bool:
    if fired.get(workflow_id) == minute_key:
        return False
    fired[workflow_id] = minute_key
    return True


def _trigger_schedule(graph_json: dict) -> tuple[str | None, str | None]:
    for node in graph_json.get("nodes", []):
        data = node.get("data") or {}
        if data.get("nodeType") != "trigger":
            continue
        if data.get("triggerType") != "schedule":
            return None, None
        return data.get("scheduleCron"), node.get("id")
    return None, None


def _scan_scheduled_workflows() -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        workflows = db.query(models.Workflow).options(joinedload(models.Workflow.versions)).all()
        due: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)
        minute_key = now.strftime("%Y-%m-%dT%H:%M")

        for workflow in workflows:
            if not workflow.versions:
                continue
            version = max(workflow.versions, key=lambda v: v.version_number)
            cron_expr, _ = _trigger_schedule(version.graph_json)
            if not cron_expr:
                continue
            if not cron_matches_now(cron_expr, now):
                continue
            wf_key = str(workflow.id)
            if not should_fire_schedule(wf_key, minute_key, _last_fired_minute):
                continue
            try:
                validate_workflow_graph(version.graph_json)
            except GraphValidationError:
                continue
            due.append(
                {
                    "workflow_id": workflow.id,
                    "version_id": version.id,
                    "user_id": workflow.user_id,
                }
            )
        return due
    finally:
        db.close()


def _create_scheduled_run(workflow_id: UUID, version_id: UUID) -> None:
    db = SessionLocal()
    try:
        run = models.WorkflowRun(
            workflow_version_id=version_id,
            status="pending",
            input_text=json.dumps({"scheduled": True, "trigger": "cron"}),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        schedule_run(run.id)
        logger.info(
            "Scheduled run created",
            extra={"workflow_id": str(workflow_id), "run_id": str(run.id), "event": "schedule_fired"},
        )
    finally:
        db.close()


async def _scheduler_loop() -> None:
    while True:
        try:
            if settings.schedule_enabled:
                for item in _scan_scheduled_workflows():
                    _create_scheduled_run(item["workflow_id"], item["version_id"])
        except Exception:
            logger.exception("Scheduler tick failed")
        await asyncio.sleep(max(15, settings.schedule_poll_seconds))


def start_schedule_worker() -> None:
    global _scheduler_task
    if not settings.schedule_enabled:
        return
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info("Schedule worker started", extra={"poll_seconds": settings.schedule_poll_seconds})


async def stop_schedule_worker() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    _scheduler_task = None