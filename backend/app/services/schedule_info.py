"""Schedule metadata for workflows (next fire, last scheduled run)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models
from app.services.cron_utils import cron_is_valid, cron_next_runs
from app.services.schedule_worker import _trigger_schedules


def _schedule_info(
    workflow_id: UUID,
    workflow_name: str,
    cron_expr: str,
    *,
    cron_valid: bool | None = None,
    last_fired_at: datetime | None = None,
    schedule_id: UUID | None = None,
) -> dict[str, Any]:
    valid = cron_is_valid(cron_expr) if cron_valid is None else cron_valid
    next_runs = cron_next_runs(cron_expr, count=3) if valid else []
    return {
        "schedule_id": str(schedule_id) if schedule_id else None,
        "workflow_id": str(workflow_id),
        "workflow_name": workflow_name,
        "cron": cron_expr,
        "cron_valid": valid,
        "next_run_at": next_runs[0].isoformat() if next_runs else None,
        "next_runs": [dt.isoformat() for dt in next_runs],
        "last_fired_at": last_fired_at.isoformat() if last_fired_at else None,
    }


def schedule_infos_for_graph(
    workflow_id: UUID,
    workflow_name: str,
    graph_json: dict,
    *,
    last_fired_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """One info dict per configured schedule entry (unsaved graph view)."""
    return [
        _schedule_info(workflow_id, workflow_name, cron_expr, last_fired_at=last_fired_at)
        for _node_id, cron_expr in _trigger_schedules(graph_json)
    ]



def _row_info(schedule: models.WorkflowSchedule, workflow_name: str) -> dict[str, Any]:
    return _schedule_info(
        schedule.workflow_id,
        workflow_name,
        schedule.cron_expr,
        cron_valid=schedule.cron_valid,
        last_fired_at=schedule.last_fired_at,
        schedule_id=schedule.id,
    )


def list_workflow_schedules(
    db: Session, workflow_id: UUID, workflow_name: str
) -> list[dict[str, Any]]:
    """Persisted schedule rows for one workflow — the source of truth once saved."""
    rows = (
        db.query(models.WorkflowSchedule)
        .filter(models.WorkflowSchedule.workflow_id == workflow_id)
        .order_by(models.WorkflowSchedule.cron_expr)
        .all()
    )
    return [_row_info(row, workflow_name) for row in rows]


def list_user_scheduled_workflows(db: Session, user_id: UUID) -> list[dict[str, Any]]:
    rows = (
        db.query(models.WorkflowSchedule, models.Workflow)
        .join(models.Workflow, models.Workflow.id == models.WorkflowSchedule.workflow_id)
        .filter(models.Workflow.user_id == user_id, models.WorkflowSchedule.enabled.is_(True))
        .all()
    )
    items = [_row_info(schedule, workflow.name) for schedule, workflow in rows]
    items.sort(key=lambda row: (row.get("next_run_at") or "", row.get("cron") or ""))
    return items
