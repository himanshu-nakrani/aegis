"""Aggregate evaluation and guardrail metrics for observability."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.db import models
from app.services.eval import compute_aggregate_score

SCORE_KEYS = ("faithfulness", "helpfulness", "relevance", "toxicity")


def _workflow_name(run: models.WorkflowRun) -> str | None:
    if run.version and run.version.workflow:
        return run.version.workflow.name
    return None


def _workflow_id(run: models.WorkflowRun) -> str | None:
    if run.version and run.version.workflow:
        return str(run.version.workflow.id)
    return None


def aggregate_quality_metrics(runs: list[models.WorkflowRun]) -> dict[str, Any]:
    eval_run_count = 0
    eval_pass_count = 0
    eval_fail_count = 0
    score_totals: dict[str, float] = {key: 0.0 for key in SCORE_KEYS}
    score_counts: dict[str, int] = {key: 0 for key in SCORE_KEYS}
    guardrail_event_totals = {"passed": 0, "warned": 0, "failed": 0}
    guardrail_blocked_runs = 0
    eval_trend: list[dict[str, Any]] = []
    workflow_scores: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"workflow_name": "", "scores": [], "count": 0}
    )

    for run in runs:
        metrics = run.metrics_json or {}

        aggregate = metrics.get("eval_aggregate")
        if aggregate is not None:
            eval_run_count += 1
            passed = metrics.get("eval_passed")
            if passed is True:
                eval_pass_count += 1
            elif passed is False:
                eval_fail_count += 1

            eval_trend.append(
                {
                    "run_id": str(run.id),
                    "workflow_id": _workflow_id(run),
                    "workflow_name": _workflow_name(run),
                    "created_at": run.created_at.isoformat(),
                    "aggregate": float(aggregate),
                    "passed": passed,
                }
            )

            wf_id = _workflow_id(run)
            if wf_id:
                bucket = workflow_scores[wf_id]
                bucket["workflow_name"] = _workflow_name(run) or wf_id
                bucket["scores"].append(float(aggregate))
                bucket["count"] += 1

            for row in metrics.get("eval_scores") or []:
                if not isinstance(row, dict):
                    continue
                for key in SCORE_KEYS:
                    val = row.get(key)
                    if isinstance(val, (int, float)):
                        score_totals[key] += float(val)
                        score_counts[key] += 1

        if metrics.get("guardrail_blocked"):
            guardrail_blocked_runs += 1

        for event in metrics.get("guardrail_events") or []:
            if not isinstance(event, dict):
                continue
            status = event.get("status")
            if status in guardrail_event_totals:
                guardrail_event_totals[status] += 1
            elif status == "warned":
                guardrail_event_totals["warned"] += 1

        if not metrics.get("guardrail_events") and metrics.get("failed_guardrails"):
            guardrail_event_totals["failed"] += len(metrics["failed_guardrails"])

    avg_scores = {
        key: round(score_totals[key] / score_counts[key], 2)
        for key in SCORE_KEYS
        if score_counts[key] > 0
    }

    workflow_leaderboard = [
        {
            "workflow_id": wf_id,
            "workflow_name": data["workflow_name"],
            "run_count": data["count"],
            "avg_eval_score": round(sum(data["scores"]) / len(data["scores"]), 2),
        }
        for wf_id, data in workflow_scores.items()
        if data["scores"]
    ]
    workflow_leaderboard.sort(key=lambda row: row["avg_eval_score"], reverse=True)

    eval_pass_rate = (
        round(eval_pass_count / (eval_pass_count + eval_fail_count), 3)
        if eval_pass_count + eval_fail_count > 0
        else None
    )

    return {
        "eval_run_count": eval_run_count,
        "eval_pass_count": eval_pass_count,
        "eval_fail_count": eval_fail_count,
        "eval_pass_rate": eval_pass_rate,
        "avg_dimension_scores": avg_scores,
        "eval_trend": list(reversed(eval_trend[-20:])),
        "workflow_eval_leaderboard": workflow_leaderboard[:10],
        "guardrail_stats": {
            **guardrail_event_totals,
            "blocked_runs": guardrail_blocked_runs,
            "total_events": sum(guardrail_event_totals.values()),
        },
    }


def enrich_run_summary(run: models.WorkflowRun) -> dict[str, Any]:
    metrics = run.metrics_json or {}
    return {
        "run_id": str(run.id),
        "workflow_id": _workflow_id(run),
        "workflow_name": _workflow_name(run),
        "status": run.status,
        "created_at": run.created_at,
        "eval_aggregate": metrics.get("eval_aggregate"),
        "eval_passed": metrics.get("eval_passed"),
        "latency_ms": metrics.get("latency_ms"),
        "guardrail_blocked": bool(metrics.get("guardrail_blocked")),
        "guardrail_warn_count": sum(
            1
            for event in metrics.get("guardrail_events") or []
            if isinstance(event, dict) and event.get("status") == "warned"
        ),
        "guardrail_fail_count": len(metrics.get("failed_guardrails") or []),
    }


def apply_eval_threshold(
    eval_score_rows: list[dict],
    metadata: dict[str, dict],
) -> bool | None:
    """Return run-level eval_passed when thresholds are configured."""
    outcomes: list[bool] = []
    for row in eval_score_rows:
        node_id = row.get("node_id")
        if not node_id:
            continue
        meta = metadata.get(node_id, {})
        threshold = meta.get("eval_threshold")
        if threshold is None:
            continue
        aggregate = row.get("aggregate_score")
        if aggregate is None:
            aggregate = compute_aggregate_score(row)
            if aggregate is not None:
                row["aggregate_score"] = aggregate
        if aggregate is None:
            outcomes.append(False)
            row["passed"] = False
            row["threshold"] = threshold
            continue
        passed = float(aggregate) >= float(threshold)
        row["passed"] = passed
        row["threshold"] = threshold
        outcomes.append(passed)
    if not outcomes:
        return None
    return all(outcomes)