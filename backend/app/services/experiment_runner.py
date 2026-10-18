"""Batch experiments: run a dataset against workflow version(s), score, compare.

An experiment of kind "batch" runs one version over every dataset item and
aggregates eval/cost/latency. Kind "regression" runs candidate and baseline
versions over the same items and renders a verdict — the gate a CI pipeline
calls before promoting a version.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db import models
from app.db.database import SessionLocal
from app.services.executor import execute_run

logger = logging.getLogger("aegis.experiments")

# Bounded parallelism: experiments share the executor with interactive runs.
_ITEM_CONCURRENCY = 2

# Regression defaults: candidate fails the gate if avg eval drops more than
# this, or if it introduces new failures.
DEFAULT_MAX_EVAL_DROP = 0.5


def _session():
    return SessionLocal(expire_on_commit=False)


async def _run_one_item(
    version_id: uuid.UUID,
    input_text: str,
    semaphore: asyncio.Semaphore,
    model_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    async with semaphore:
        db = _session()
        try:
            run = models.WorkflowRun(
                workflow_version_id=version_id,
                status="pending",
                input_text=input_text,
                # Model-matrix runs re-target the workflow's LLM nodes; the
                # override rides the run row so worker-mode executors honor it.
                authoring_overrides_json=(
                    {"model_override": model_override} if model_override else None
                ),
            )
            db.add(run)
            db.commit()
            run_id = run.id
        finally:
            db.close()

        try:
            await execute_run(run_id)
        except Exception as exc:  # noqa: BLE001 — item failures land in the summary
            logger.warning("Experiment item crashed", extra={"run_id": str(run_id), "error": str(exc)})

        db = _session()
        try:
            done = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
            metrics = (done.metrics_json or {}) if done else {}
            return {
                "run_id": str(run_id),
                "input": input_text[:300],
                "status": done.status if done else "failed",
                "output": (done.final_output or "")[:500] if done else None,
                "eval_aggregate": metrics.get("eval_aggregate"),
                "latency_ms": metrics.get("latency_ms"),
                "cost_usd": metrics.get("total_cost_usd"),
                "total_tokens": metrics.get("total_tokens"),
            }
        finally:
            db.close()


def _aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    evals = [r["eval_aggregate"] for r in rows if isinstance(r.get("eval_aggregate"), (int, float))]
    latencies = [r["latency_ms"] for r in rows if isinstance(r.get("latency_ms"), (int, float))]
    costs = [r["cost_usd"] for r in rows if isinstance(r.get("cost_usd"), (int, float))]
    failures = sum(1 for r in rows if r.get("status") != "completed")
    return {
        "items": len(rows),
        "failures": failures,
        "failure_rate": round(failures / len(rows), 3) if rows else 0.0,
        "avg_eval": round(sum(evals) / len(evals), 2) if evals else None,
        "avg_latency_ms": int(sum(latencies) / len(latencies)) if latencies else None,
        "total_cost_usd": round(sum(costs), 6) if costs else None,
    }


async def _run_version_over_items(
    version_id: uuid.UUID,
    items: list[tuple[str, str]],
    model_override: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    semaphore = asyncio.Semaphore(_ITEM_CONCURRENCY)
    rows = await asyncio.gather(
        *[
            _run_one_item(version_id, input_text, semaphore, model_override)
            for _, input_text in items
        ]
    )
    for (item_id, _), row in zip(items, rows):
        row["item_id"] = item_id
    return list(rows)


def _compute_verdict(
    candidate_agg: dict[str, Any], baseline_agg: dict[str, Any], max_drop: float
) -> dict[str, Any]:
    """Regression verdict for one candidate aggregate vs the baseline."""
    eval_delta = None
    if candidate_agg.get("avg_eval") is not None and baseline_agg.get("avg_eval") is not None:
        eval_delta = round(candidate_agg["avg_eval"] - baseline_agg["avg_eval"], 2)
    failure_delta = candidate_agg["failures"] - baseline_agg["failures"]

    passed = True
    reasons: list[str] = []
    # Missing scores must not silently pass the gate (audit P2).
    if candidate_agg.get("avg_eval") is None or baseline_agg.get("avg_eval") is None:
        passed = False
        reasons.append("missing eval scores on candidate or baseline; gate cannot pass")
    elif eval_delta is not None and eval_delta < -max_drop:
        passed = False
        reasons.append(f"avg eval dropped {abs(eval_delta)} (limit {max_drop})")
    if failure_delta > 0:
        passed = False
        reasons.append(f"{failure_delta} new failure(s)")

    return {
        "passed": passed,
        "eval_delta": eval_delta,
        "failure_delta": failure_delta,
        "max_eval_drop": max_drop,
        "reasons": reasons or ["no regression detected"],
    }


async def run_experiment(experiment_id: uuid.UUID) -> None:
    db = _session()
    try:
        exp = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
        if not exp:
            return
        items = [
            (str(item.id), item.input_text)
            for item in db.query(models.DatasetItem)
            .filter(models.DatasetItem.dataset_id == exp.dataset_id)
            .order_by(models.DatasetItem.created_at)
            .all()
        ]
        exp.status = "running"
        db.commit()
        kind = exp.kind
        version_id = exp.version_id
        baseline_version_id = exp.baseline_version_id
        options = dict(exp.summary_json or {})  # regression options stashed at creation
    finally:
        db.close()

    summary: dict[str, Any] = {}
    status = "completed"
    try:
        if not items:
            raise ValueError("Dataset has no items")

        raw_drop = options.get("max_eval_drop")
        max_drop = float(raw_drop) if raw_drop is not None else DEFAULT_MAX_EVAL_DROP
        matrix = options.get("model_matrix") or []

        if matrix:
            # Multi-model matrix: run the candidate version once per
            # {provider, model} pair, each run re-targeting LLM nodes via the
            # persisted model_override. The baseline runs once (unmodified)
            # and every pair is gated against it.
            baseline_rows: list[dict[str, Any]] | None = None
            baseline_agg: dict[str, Any] | None = None
            if kind == "regression" and baseline_version_id:
                baseline_rows = await _run_version_over_items(baseline_version_id, items)
                baseline_agg = _aggregate(baseline_rows)
                summary["baseline"] = {
                    "version_id": str(baseline_version_id),
                    **baseline_agg,
                }
                summary["baseline_rows"] = baseline_rows

            matrix_entries: list[dict[str, Any]] = []
            verdicts: list[tuple[str, dict[str, Any]]] = []
            for pair in matrix:
                pair_rows = await _run_version_over_items(version_id, items, pair)
                pair_agg = _aggregate(pair_rows)
                entry = {
                    "provider": pair.get("provider"),
                    "model": pair.get("model"),
                    **pair_agg,
                    "rows": pair_rows,
                }
                if baseline_agg is not None:
                    entry["verdict"] = _compute_verdict(pair_agg, baseline_agg, max_drop)
                    verdicts.append((f"{pair.get('provider')}/{pair.get('model')}", entry["verdict"]))
                matrix_entries.append(entry)

            first = matrix_entries[0]
            summary["candidate"] = {
                "version_id": str(version_id),
                **{k: v for k, v in first.items() if k not in ("rows", "verdict")},
            }
            summary["rows"] = first["rows"]
            summary["matrix"] = matrix_entries

            if verdicts:
                # Roll all per-model verdicts up to one gate verdict: the gate
                # fails when any pair regresses. The top-level deltas describe
                # the WORST pair (not pair #1) so the gate summary reflects
                # the regression a reader must act on.
                passed = all(v["passed"] for _, v in verdicts)
                reasons = [
                    f"{name}: {reason}"
                    for name, v in verdicts
                    for reason in v["reasons"]
                    if not v["passed"]
                ]
                worst_name, worst_verdict = min(
                    verdicts,
                    key=lambda nv: (
                        nv[1]["eval_delta"] if nv[1]["eval_delta"] is not None else 0.0,
                        -(nv[1]["failure_delta"] or 0),
                    ),
                )
                summary["verdict"] = {
                    "passed": passed,
                    "eval_delta": worst_verdict["eval_delta"],
                    "failure_delta": worst_verdict["failure_delta"],
                    "worst_pair": worst_name,
                    "max_eval_drop": max_drop,
                    "reasons": reasons or ["no regression detected"],
                }
        else:
            candidate_rows = await _run_version_over_items(version_id, items)
            summary = {
                "candidate": {"version_id": str(version_id), **_aggregate(candidate_rows)},
                "rows": candidate_rows,
            }

            if kind == "regression" and baseline_version_id:
                baseline_rows = await _run_version_over_items(baseline_version_id, items)
                baseline_agg = _aggregate(baseline_rows)
                summary["baseline"] = {"version_id": str(baseline_version_id), **baseline_agg}
                summary["baseline_rows"] = baseline_rows
                summary["verdict"] = _compute_verdict(
                    summary["candidate"], baseline_agg, max_drop
                )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Experiment failed", extra={"experiment_id": str(experiment_id)})
        status = "failed"
        summary = {"error": str(exc), **summary}

    db = _session()
    try:
        exp = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
        if exp:
            exp.status = status
            exp.summary_json = summary
            exp.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
