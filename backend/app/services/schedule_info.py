"""Schedule metadata for workflows (next fire, last scheduled run)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.db import models
from app.services.cron_utils import cron_is_valid, cron_next_runs
from app.services.schedule_worker import _trigger_schedule


def is_scheduled_run_input(input_text: str | None) -> bool:
    if not input_text:
        return False
    try:
        payload = json.loads(input_text)
    except json.JSONDecodeError:
        return False
    return isinstance(payload, dict) and payload.get("scheduled") is True


def last_scheduled_run_at(db: Session, workflow_id: UUID) -> datetime | None:
    rows = (
        db.query(models.WorkflowRun.created_at, models.WorkflowRun.input_text)
        .join(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(50)
        .all()
    )
    for created_at, input_text in rows:
        if is_scheduled_run_input(input_text):
            return created_at
    return None


def schedule_info_for_graph(
    workflow_id: UUID,
    workflow_name: str,
    graph_json: dict,
    *,
    last_fired_at: datetime | None = None,
) -> dict[str, Any] | None:
    cron_expr, _ = _trigger_schedule(graph_json)
    if not cron_expr:
        return None

    valid = cron_is_valid(cron_expr)
    next_runs = cron_next_runs(cron_expr, count=3) if valid else []

    return {
        "workflow_id": str(workflow_id),
        "workflow_name": workflow_name,
        "cron": cron_expr,
        "cron_valid": valid,
        "next_run_at": next_runs[0].isoformat() if next_runs else None,
        "next_runs": [dt.isoformat() for dt in next_runs],
        "last_fired_at": last_fired_at.isoformat() if last_fired_at else None,
    }


def list_user_scheduled_workflows(db: Session, user_id: UUID) -> list[dict[str, Any]]:
    workflows = (
        db.query(models.Workflow)
        .options(joinedload(models.Workflow.versions))
        .filter(models.Workflow.user_id == user_id)
        .all()
    )
    items: list[dict[str, Any]] = []
    for workflow in workflows:
        if not workflow.versions:
            continue
        version = max(workflow.versions, key=lambda v: v.version_number)
        last_fired = last_scheduled_run_at(db, workflow.id)
        info = schedule_info_for_graph(
            workflow.id,
            workflow.name,
            version.graph_json,
            last_fired_at=last_fired,
        )
        if info:
            items.append(info)
    items.sort(key=lambda row: row.get("next_run_at") or "")
    return items