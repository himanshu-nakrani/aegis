"""Alert rule evaluation — runs on the scheduler tick.

Rules compare a windowed metric against a threshold; a breach records an
AlertEvent and fires the rule's webhook. Rules cool down for one window after
firing so a sustained breach doesn't spam the channel.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.db import models
from app.services.async_tasks import schedule_task
from app.services.time_utils import to_db_utc
from app.services.webhook import dispatch_webhook

logger = logging.getLogger("aegis.alerts")

SUPPORTED_METRICS = {
    "failure_rate",
    "eval_avg",
    "guardrail_blocks",
    "cost_usd",
    "latency_p95",
    "latency_p99",
}

# How much longer the trailing baseline window is than the current window, when
# baseline_window_minutes is not set explicitly.
_DEFAULT_BASELINE_FACTOR = 6


def _workflow_version_ids(db: Session, workflow_id) -> list:
    return [
        row[0]
        for row in db.query(models.WorkflowVersion.id)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .all()
    ]


def _percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(p * len(ordered)))]


def _metric_over_window(
    db: Session, rule: models.AlertRule, window_minutes: int,
    *,
    end_offset_minutes: int = 0,
) -> float | None:
    """Compute the rule's metric over a trailing window.

    Always scoped to the rule owner's workflows so all-workflows rules cannot
    leak another tenant's aggregate metrics. ``end_offset_minutes`` excludes
    the most recent minutes — used for the baseline window so it never
    overlaps (and self-dilutes against) the current window it is compared
    with.
    """
    now = datetime.now(timezone.utc)
    window_end = now - timedelta(minutes=end_offset_minutes)
    window_start = to_db_utc(db, window_end - timedelta(minutes=window_minutes))
    window_end_db = to_db_utc(db, window_end)

    query = (
        db.query(models.WorkflowRun.status, models.WorkflowRun.metrics_json)
        .join(
            models.WorkflowVersion,
            models.WorkflowRun.workflow_version_id == models.WorkflowVersion.id,
        )
        .join(
            models.Workflow,
            models.WorkflowVersion.workflow_id == models.Workflow.id,
        )
        .filter(models.WorkflowRun.created_at >= window_start)
        .filter(models.WorkflowRun.created_at < window_end_db)
    )
    # Tenant scope: always filter by the rule's user when set.
    if getattr(rule, "user_id", None) is not None:
        query = query.filter(models.Workflow.user_id == rule.user_id)
    if rule.workflow_id:
        version_ids = _workflow_version_ids(db, rule.workflow_id)
        if not version_ids:
            return None
        query = query.filter(models.WorkflowRun.workflow_version_id.in_(version_ids))

    if rule.metric == "failure_rate":
        total, failed = query.with_entities(
            func.count(models.WorkflowRun.id),
            func.coalesce(
                func.sum(case((models.WorkflowRun.status == "failed", 1), else_=0)), 0
            ),
        ).one()
        if not total:
            return None
        return round(int(failed) / int(total), 4)

    runs = query.all()
    if not runs:
        return None

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
    if rule.metric in ("latency_p95", "latency_p99"):
        latencies = [
            float((r.metrics_json or {}).get("latency_ms"))
            for r in runs
            if isinstance((r.metrics_json or {}).get("latency_ms"), (int, float))
        ]
        if not latencies:
            return None
        return round(_percentile(latencies, 0.95 if rule.metric == "latency_p95" else 0.99), 2)
    return None


def _metric_value(db: Session, rule: models.AlertRule) -> float | None:
    return _metric_over_window(db, rule, rule.window_minutes)


def _breached(value: float, operator: str, threshold: float) -> bool:
    return value > threshold if operator == "gt" else value < threshold


def _rule_breach(db: Session, rule: models.AlertRule) -> tuple[float, str, str] | None:
    """Compute the rule's current value and decide whether it breaches.

    Pure read (no writes). Returns ``(value, message, comparison)`` on a breach,
    else ``None``. In baseline mode the breach is on the current/baseline ratio,
    so a metric spiking vs its own recent history fires (anomaly detection).
    """
    value = _metric_value(db, rule)
    if value is None:
        return None
    comparison = getattr(rule, "comparison", "absolute") or "absolute"
    scope = f" for workflow {rule.workflow_id}" if rule.workflow_id else " (all workflows)"

    if comparison == "baseline":
        baseline_window = rule.baseline_window_minutes or (
            rule.window_minutes * _DEFAULT_BASELINE_FACTOR
        )
        # Trailing window EXCLUDING the current one: an overlapping baseline
        # contains the spike it is measured against, compressing the ratio
        # toward 1.0 so gt rules can never fire.
        baseline = _metric_over_window(
            db, rule, baseline_window, end_offset_minutes=rule.window_minutes
        )
        if baseline is None:
            return None
        if baseline == 0:
            # Cold start (0 → N): the most important anomaly case. Breach on
            # gt when the current window is non-zero; mirror for lt.
            if (rule.operator == "gt" and value > 0) or (rule.operator == "lt" and value < 0):
                message = (
                    f"Anomaly: {rule.metric} = {value} vs zero {baseline_window}m "
                    f"baseline over last {rule.window_minutes}m" + scope
                )
                return (value, message, comparison)
            return None
        ratio = round(value / baseline, 3)
        if not _breached(ratio, rule.operator, rule.threshold):
            return None
        message = (
            f"Anomaly: {rule.metric} = {value} is {ratio}x its {baseline_window}m "
            f"baseline ({baseline}) "
            f"({'>' if rule.operator == 'gt' else '<'} {rule.threshold}x)"
            f" over last {rule.window_minutes}m" + scope
        )
        return (value, message, comparison)

    if not _breached(value, rule.operator, rule.threshold):
        return None
    message = (
        f"Alert: {rule.metric} = {value} "
        f"({'>' if rule.operator == 'gt' else '<'} {rule.threshold}) "
        f"over last {rule.window_minutes}m" + scope
    )
    return (value, message, comparison)


def evaluate_alert_rules(db: Session) -> int:
    """Evaluate all enabled rules; returns the number that fired."""
    from sqlalchemy import update as _sa_update

    now = datetime.now(timezone.utc)
    fired = 0
    rules = db.query(models.AlertRule).filter(models.AlertRule.enabled.is_(True)).all()
    for rule in rules:
        try:
            breach = _rule_breach(db, rule)
        except Exception:  # noqa: BLE001
            logger.exception("Alert evaluation failed", extra={"rule_id": str(rule.id)})
            continue
        if breach is None:
            continue
        value, message, comparison = breach

        # Atomic cooldown claim: exactly one tick wins the fire for this
        # window. A concurrent tick that already fired leaves rowcount 0 and
        # skips the duplicate event + webhook delivery.
        cutoff = now - timedelta(minutes=rule.window_minutes)
        claimed = db.execute(
            _sa_update(models.AlertRule)
            .where(
                models.AlertRule.id == rule.id,
                models.AlertRule.enabled.is_(True),
                (models.AlertRule.last_fired_at.is_(None))
                | (models.AlertRule.last_fired_at < cutoff),
            )
            .values(last_fired_at=now)
            .execution_options(synchronize_session=False)
        ).rowcount
        if claimed != 1:
            db.rollback()
            continue
        db.add(models.AlertEvent(rule_id=rule.id, value=value, message=message))
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
                "comparison": comparison,
                "window_minutes": rule.window_minutes,
                "workflow_id": str(rule.workflow_id) if rule.workflow_id else None,
                "message": message,
                "fired_at": now.isoformat(),
            }
            schedule_task(dispatch_webhook(rule.channel_url, payload))
    return fired
