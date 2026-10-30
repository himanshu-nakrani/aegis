"""Group low-scoring and thumbs-down runs by a normalized output pattern."""

from __future__ import annotations

import hashlib
import re
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models

_LOW_EVAL = 0.7
_SPACE = re.compile(r"\s+")


def output_pattern(text: str | None) -> tuple[str, str]:
    normalized = _SPACE.sub(" ", (text or "").strip().lower())[:160]
    digest = hashlib.sha256(normalized.encode()).hexdigest()[:16]
    return digest, normalized


def trace_insights(db: Session, user_id: UUID, *, limit: int = 200) -> dict[str, Any]:
    rows = (
        db.query(models.WorkflowRun, models.Workflow.name, models.Workflow.id)
        .join(models.WorkflowVersion, models.WorkflowRun.workflow_version_id == models.WorkflowVersion.id)
        .join(models.Workflow, models.WorkflowVersion.workflow_id == models.Workflow.id)
        .filter(models.Workflow.user_id == user_id, models.WorkflowRun.status == "completed")
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(limit)
        .all()
    )
    run_ids = [run.id for run, _name, _wf in rows]
    thumbs: set[UUID] = set()
    if run_ids:
        feedback_rows = (
            db.query(models.Feedback.run_id)
            .filter(
                models.Feedback.user_id == user_id,
                models.Feedback.rating < 0,
                models.Feedback.run_id.in_(run_ids),
            )
            .all()
        )
        thumbs = {row[0] for row in feedback_rows}

    clusters: dict[str, dict[str, Any]] = {}
    scanned = 0
    for run, workflow_name, workflow_id in rows:
        metrics = run.metrics_json or {}
        eval_aggregate = metrics.get("eval_aggregate")
        try:
            score = float(eval_aggregate) if eval_aggregate is not None else None
        except (TypeError, ValueError):
            score = None
        # Judge aggregates are 1–5 while deterministic evals are 0–1; compare on
        # one scale or a failing 2.1/5 run sails past the 0.7 threshold.
        if score is not None and score > 1:
            score /= 5.0
        low_eval = score is not None and score < _LOW_EVAL
        disliked = run.id in thumbs
        if not low_eval and not disliked:
            continue
        scanned += 1
        signature, preview = output_pattern(run.final_output)
        entry = clusters.setdefault(
            signature,
            {
                "signature": signature,
                "preview": preview,
                "count": 0,
                "reason": "thumbs_down" if disliked else "low_eval",
                "sample_run_id": str(run.id),
                "members": [],
            },
        )
        if disliked:
            entry["reason"] = "thumbs_down"
        entry["count"] += 1
        entry["members"].append(
            {
                "run_id": str(run.id),
                "workflow_id": str(workflow_id),
                "workflow_name": workflow_name,
            }
        )
    patterns = [entry for entry in clusters.values() if entry["count"] >= 2]
    patterns.sort(key=lambda item: item["count"], reverse=True)
    return {"patterns": patterns[:20], "matched_runs": scanned}
