"""Cross-database filters for workflow run list queries."""

from __future__ import annotations

from app.db import models


def run_has_eval(run: models.WorkflowRun) -> bool:
    metrics = run.metrics_json or {}
    return metrics.get("eval_aggregate") is not None


def filter_runs_by_has_eval(
    runs: list[models.WorkflowRun],
    *,
    has_eval: bool,
) -> list[models.WorkflowRun]:
    return [run for run in runs if run_has_eval(run) == has_eval]