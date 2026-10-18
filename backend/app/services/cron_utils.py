"""Cron expression helpers for schedule triggers."""

from __future__ import annotations

from datetime import datetime, timezone

from croniter import croniter


def cron_next_runs(cron_expr: str, count: int = 3, now: datetime | None = None) -> list[datetime]:
    moment = (now or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    expr = cron_expr.strip()
    if not expr:
        return []
    try:
        itr = croniter(expr, moment)
        return [itr.get_next(datetime).replace(tzinfo=timezone.utc) for _ in range(max(1, count))]
    except (ValueError, KeyError):
        # Unsatisfiable but syntactically valid (e.g. Feb 30): no future fire
        # exists, so return [] instead of 500ing every schedule listing.
        return []


def cron_is_valid(cron_expr: str) -> bool:
    expr = (cron_expr or "").strip()
    if not expr:
        return False
    try:
        itr = croniter(expr)
        # Construction alone accepts unsatisfiable schedules (Feb 30 raises
        # only on iteration) — one get_next proves a future fire exists.
        itr.get_next(datetime)
        return True
    except (ValueError, KeyError):
        return False