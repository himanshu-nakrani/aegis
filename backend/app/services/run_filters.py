"""Cross-database filters for workflow run list queries."""

from __future__ import annotations

from app.db import models


def run_has_eval(run: models.WorkflowRun) -> bool:
    metrics = run.metrics_json or {}
    return metrics.get("eval_aggregate") is not None


def run_eval_passed(run: models.WorkflowRun) -> bool | None:
    metrics = run.metrics_json or {}
    value = metrics.get("eval_passed")
    return value if isinstance(value, bool) else None


def run_guardrail_blocked(run: models.WorkflowRun) -> bool:
    metrics = run.metrics_json or {}
    return bool(metrics.get("guardrail_blocked"))


def filter_runs_by_has_eval(
    runs: list[models.WorkflowRun],
    *,
    has_eval: bool,
) -> list[models.WorkflowRun]:
    return [run for run in runs if run_has_eval(run) == has_eval]


def filter_runs_by_eval_passed(
    runs: list[models.WorkflowRun],
    *,
    eval_passed: bool,
) -> list[models.WorkflowRun]:
    return [run for run in runs if run_eval_passed(run) is eval_passed]


def filter_runs_by_guardrail_blocked(
    runs: list[models.WorkflowRun],
    *,
    guardrail_blocked: bool,
) -> list[models.WorkflowRun]:
    return [run for run in runs if run_guardrail_blocked(run) is guardrail_blocked]