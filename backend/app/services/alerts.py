"""Alert rule evaluation — runs on the scheduler tick.

Rules compare a windowed metric against a threshold; a breach records an
AlertEvent and fires the rule's webhook. Rules cool down for one window after
firing so a sustained breach doesn't spam the channel.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.db import models
from app.services.async_tasks import schedule_task
from app.services.webhook import dispatch_webhook

logger = logging.getLogger("aegis.alerts")

SUPPORTED_METRICS = {"failure_rate", "eval_avg", "guardrail_blocks", "cost_usd"}


def _workflow_version_ids(db: Session, workflow_id) -> list:
    return [
        row[0]
        for row in db.query(models.WorkflowVersion.id)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .all()
    ]


def _metric_value(db: Session, rule: models.AlertRule) -> float | None:
    window_start = (
        datetime.now(timezone.utc) - timedelta(minutes=rule.window_minutes)
    ).replace(tzinfo=None)

    query = db.query(models.WorkflowRun).filter(models.WorkflowRun.created_at >= window_start)
    if rule.workflow_id:
        version_ids = _workflow_version_ids(db, rule.workflow_id)
        if not version_ids:
            return None
        query = query.filter(models.WorkflowRun.workflow_version_id.in_(version_ids))
    runs = query.all()
    if not runs:
        return None

    if rule.metric == "failure_rate":
        failed = sum(1 for r in runs if r.status == "failed")
        return round(failed / len(runs), 4)
    if rule.metric == "eval_avg":
        scores = [
            (r.metrics_json or {}).get("eval_aggregate")
            for r in runs
            if isinstance((r.metrics_json or {}).get("eval_aggregate"), (int, float))
        ]
        return round(sum(scores) / len(scores), 3) if scores else None
    if rule.metric == "guardrail_blocks":
        return float(
            sum(1 for r in runs if (r.metrics_json or {}).get("guardrail_blocked"))
        )
    if rule.metric == "cost_usd":
        return round(
            sum(
                float((r.metrics_json or {}).get("total_cost_usd") or 0)
                for r in runs
            ),
            6,
        )
    return None


def _breached(value: float, operator: str, threshold: float) -> bool:
    return value > threshold if operator == "gt" else value < threshold


def evaluate_alert_rules(db: Session) -> int:
    """Evaluate all enabled rules; returns the number that fired."""
    now = datetime.now(timezone.utc)
    fired = 0
    rules = db.query(models.AlertRule).filter(models.AlertRule.enabled.is_(True)).all()
    for rule in rules:
        # Cooldown: one fire per window.
        if rule.last_fired_at:
            last = rule.last_fired_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if (now - last) < timedelta(minutes=rule.window_minutes):
                continue

        try:
            value = _metric_value(db, rule)
        except Exception:  # noqa: BLE001
            logger.exception("Alert metric computation failed", extra={"rule_id": str(rule.id)})
            continue
        if value is None or not _breached(value, rule.operator, rule.threshold):
            continue

        message = (
            f"Alert: {rule.metric} = {value} "
            f"({'>' if rule.operator == 'gt' else '<'} {rule.threshold}) "
            f"over last {rule.window_minutes}m"
            + (f" for workflow {rule.workflow_id}" if rule.workflow_id else " (all workflows)")
        )
        db.add(models.AlertEvent(rule_id=rule.id, value=value, message=message))
        rule.last_fired_at = now
        db.commit()
        fired += 1
        logger.warning("Alert fired", extra={"rule_id": str(rule.id), "value": value})

        if rule.channel_url:
            payload: dict[str, Any] = {
                "type": "aegis_alert",
                "metric": rule.metric,
                "value": value,
                "threshold": rule.threshold,
                "operator": rule.operator,
                "window_minutes": rule.window_minutes,
                "workflow_id": str(rule.workflow_id) if rule.workflow_id else None,
                "message": message,
                "fired_at": now.isoformat(),
            }
            schedule_task(dispatch_webhook(rule.channel_url, payload))
    return fired
