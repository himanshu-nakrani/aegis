"""Hourly observability rollups updated on run completion."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models


def _bucket_hour(moment: datetime | None = None) -> datetime:
    now = moment or datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def record_run_rollup(
    db: Session,
    *,
    user_id: UUID,
    workflow_id: UUID | None,
    status: str,
    metrics: dict | None,
) -> None:
    metrics = metrics or {}
    bucket = _bucket_hour()
    row = (
        db.query(models.ObservabilityRollup)
        .filter(
            models.ObservabilityRollup.user_id == user_id,
            models.ObservabilityRollup.workflow_id == workflow_id,
            models.ObservabilityRollup.bucket_hour == bucket,
        )
        .first()
    )
    if not row:
        row = models.ObservabilityRollup(
            user_id=user_id,
            workflow_id=workflow_id,
            bucket_hour=bucket,
        )
        db.add(row)

    row.run_count += 1
    if status == "completed":
        row.completed_count += 1
    elif status == "failed":
        row.failed_count += 1
    if metrics.get("guardrail_blocked"):
        row.guardrail_blocked_count += 1
    if metrics.get("eval_aggregate") is not None:
        row.eval_sum += float(metrics["eval_aggregate"])
        row.eval_count += 1