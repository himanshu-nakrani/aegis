"""Keep workflow_schedules index in sync with canvas graphs.

One workflow may carry N schedules (the trigger node's ``scheduleCrons`` list).
Sync is keyed per-row — each graph entry maps to one WorkflowSchedule row
identified by its ``(trigger_node_id, cron_expr)`` pair — so the worker's
per-row claim stays the concurrency unit and adding/removing an entry only
touches its own row.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.db import models
from app.services.cron_utils import cron_is_valid
from app.services.schedule_worker import _trigger_schedules


def sync_workflow_schedule(
    db: Session,
    *,
    workflow_id: UUID,
    version_id: UUID,
    graph_json: dict,
) -> None:
    # Desired state: deduped (trigger_node_id, cron) entries from the graph.
    desired: dict[tuple[str | None, str], str] = {}
    for trigger_node_id, cron_expr in _trigger_schedules(graph_json):
        desired[(trigger_node_id, cron_expr)] = cron_expr

    existing = (
        db.query(models.WorkflowSchedule)
        .filter(models.WorkflowSchedule.workflow_id == workflow_id)
        .all()
    )

    removed: list[models.WorkflowSchedule] = []
    for row in existing:
        key = (row.trigger_node_id, row.cron_expr)
        if key not in desired:
            removed.append(row)
            db.delete(row)
            continue
        # Entry still configured — re-pin the version and revalidate.
        row.workflow_version_id = version_id
        row.cron_valid = cron_is_valid(row.cron_expr)
        row.enabled = True
        del desired[key]

    removed_ids = {row.id for row in removed}
    surviving_triggers = {
        (row.trigger_node_id or "") for row in existing if row.id not in removed_ids
    }

    for trigger_node_id, cron_expr in desired:
        trigger_key = trigger_node_id or ""
        # M14: a cron *replacement* (no surviving row for this trigger) inherits
        # the latest last_fired_at so a rename does not re-fire the same minute.
        # A newly added cron beside a surviving sibling must NOT inherit — that
        # would suppress its first fire for the minute the sibling already claimed.
        inherited_last_fired = None
        if trigger_key not in surviving_triggers:
            for row in removed:
                if row.trigger_node_id == trigger_key and row.last_fired_at:
                    if inherited_last_fired is None or row.last_fired_at > inherited_last_fired:
                        inherited_last_fired = row.last_fired_at
        try:
            with db.begin_nested():
                db.add(
                    models.WorkflowSchedule(
                        workflow_id=workflow_id,
                        workflow_version_id=version_id,
                        cron_expr=cron_expr,
                        trigger_node_id=trigger_key,
                        enabled=True,
                        cron_valid=cron_is_valid(cron_expr),
                        last_fired_at=inherited_last_fired,
                    )
                )
                db.flush()
        except IntegrityError:
            # Lost the insert race: the winner's row is now visible; adopt
            # it (re-pin version, revalidate) instead of double-firing.
            winner = (
                db.query(models.WorkflowSchedule)
                .filter(
                    models.WorkflowSchedule.workflow_id == workflow_id,
                    models.WorkflowSchedule.trigger_node_id == (trigger_node_id or ""),
                    models.WorkflowSchedule.cron_expr == cron_expr,
                )
                .first()
            )
            if winner is not None:
                winner.workflow_version_id = version_id
                winner.cron_valid = cron_is_valid(cron_expr)
                winner.enabled = True
