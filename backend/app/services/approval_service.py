"""Durable approval waits, metadata, and notifications.

The ``approval_requests`` row is the source of truth for a wait: any process
can resolve it, and waiters poll the row so a decision committed by another
process (API vs. run worker) still arrives. The in-process ``asyncio.Event``
remains as a same-process wake-up fast path, with the optional event-bus
NOTIFY as a cross-process hint on Postgres.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.credentials import get_user_credential, resolve_credential
from app.services.integrations import run_email_integration, run_slack_integration
from app.services.webhook import dispatch_webhook

logger = logging.getLogger("aegis.approvals")
_approval_events: dict[str, asyncio.Event] = {}
_approval_results: dict[str, dict[str, Any]] = {}
_approval_rows: dict[str, str] = {}
_approval_timers: dict[str, asyncio.Task] = {}
# Interval between ApprovalRequest row polls while a waiter holds no in-process
# signal — the cross-process delivery path (NOTIFY only ever a hint).
_POLL_SECONDS = 1.0
_RESOLVED_STATUSES = {"approved", "denied", "timed_out", "cancelled"}


class HumanApprovalDenied(Exception):
    def __init__(self, node_id: str, comment: str = "") -> None:
        self.node_id = node_id
        self.comment = comment
        super().__init__(comment or f"Approval denied at node {node_id}")


class HumanApprovalTimeout(Exception):
    pass


def _approval_key(run_id: str, node_id: str | None = None) -> str:
    return f"{run_id}::{node_id}" if node_id else run_id


def _keys_for_run(run_id: str) -> list[str]:
    prefix = f"{run_id}::"
    keys = set(_approval_events) | set(_approval_results) | set(_approval_rows)
    return [k for k in keys if k == run_id or k.startswith(prefix)]

def _utc(value: datetime) -> datetime:
    # SQLite round-trips parked_at naive; deadlines always treat it as UTC.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _key_run_id(key: str) -> str:
    return key.split("::", 1)[0]


def _row_state(row_id: str | None) -> dict[str, Any] | None:
    """Short read-only snapshot of an approval row for the waiter's DB poll."""
    if not row_id:
        return None
    with SessionLocal() as db:
        row = db.get(models.ApprovalRequest, UUID(row_id))
        if row is None:
            return None
        return {
            "status": row.status,
            "comment": row.comment or "",
            "parked_at": _utc(row.parked_at) if row.parked_at else None,
            "escalation_timeout_seconds": row.escalation_timeout_seconds,
        }


def _decision_from_state(state: dict[str, Any] | None) -> dict[str, Any] | None:
    """A row resolved by ANY process synthesizes the wait result; no re-persist."""
    if not state or state["status"] not in _RESOLVED_STATUSES:
        return None
    status = state["status"]
    return {
        "approved": status == "approved",
        "comment": state["comment"] or ("" if status in ("approved", "denied") else status),
    }


def _publish_decision(run_id: str) -> None:
    """Best-effort NOTIFY to waiters in other processes; the DB poll is the fallback."""
    try:
        run_uuid = UUID(run_id)
    except ValueError:
        return
    try:
        from app.services import event_bus

        event_bus.publish_approval_decision(run_uuid)
    except ImportError:
        pass
    except Exception:  # noqa: BLE001 — must never fail a decision that already committed
        logger.warning("Approval decision publish failed", exc_info=True)


def _metadata(row: models.ApprovalRequest) -> dict[str, Any]:
    return {
        "approval_id": str(row.id),
        "node_id": row.node_id,
        "assignee": row.assignee,
        "escalation_timeout_seconds": row.escalation_timeout_seconds,
        "status": row.status,
        "parked_at": row.parked_at.isoformat(),
        "escalated_at": row.escalated_at.isoformat() if row.escalated_at else None,
        "notification_channels": row.notification_channels,
        "notification_errors": row.notification_errors,
        "wait_mode": "in_process",
    }


def _sync_pending(db: Session, row: models.ApprovalRequest) -> None:
    run = db.get(models.WorkflowRun, row.run_id)
    if run is None:
        return
    metrics = dict(run.metrics_json or {})
    pending = metrics.get("pending_approval")
    if isinstance(pending, dict) and pending.get("approval_id") == str(row.id):
        metrics["pending_approval"] = {**pending, **_metadata(row)}
        run.metrics_json = metrics


def resolve_approval_record(
    db: Session, run_id: str, node_id: str | None, status: str, comment: str = "",
    approval_id: str | None = None,
) -> bool:
    """Transition only a parked row, within the caller's transaction."""
    query = db.query(models.ApprovalRequest).filter(
        models.ApprovalRequest.run_id == UUID(run_id),
        models.ApprovalRequest.status == "parked",
    )
    if approval_id:
        query = query.filter(models.ApprovalRequest.id == UUID(approval_id))
    elif node_id:
        query = query.filter(models.ApprovalRequest.node_id == node_id)
    rows = query.with_for_update().all()
    for row in rows:
        row.status = status
        row.comment = comment
        row.resolved_at = datetime.now(timezone.utc)
        _sync_pending(db, row)
    return bool(rows)


def _resolve_key(key: str, status: str, comment: str = "") -> None:
    row_id = _approval_rows.get(key)
    if not row_id:
        return
    transitioned = False
    run_id = _key_run_id(key)
    with SessionLocal() as db:
        row = db.get(models.ApprovalRequest, UUID(row_id))
        if row:
            transitioned = bool(resolve_approval_record(db, str(row.run_id), row.node_id, status, comment, row_id))
            db.commit()
    if transitioned:
        # Decision row committed — wake cross-process waiters (no-op off Postgres).
        _publish_decision(run_id)


def clear_approval_state(run_id: str, node_id: str | None = None) -> None:
    keys = [_approval_key(run_id, node_id)] if node_id else _keys_for_run(run_id)
    for key in keys:
        timer = _approval_timers.pop(key, None)
        if timer:
            timer.cancel()
        _approval_events.pop(key, None)
        _approval_results.pop(key, None)
        _approval_rows.pop(key, None)


def _review_hash(review: str) -> str:
    return hashlib.sha256((review or "").encode("utf-8")).hexdigest()


async def park_approval(
    run_id: str, node_id: str, review: str, *, assignee: str | None = None,
    escalation_timeout_seconds: int | None = None,
    notifications: list[dict[str, Any]] | None = None,
    allow_reuse: bool = False,
) -> dict[str, Any]:
    """Park an approval wait, returning the wait metadata.

    ``allow_reuse`` (tool approvals only): a re-park of the same invocation
    — same key (per-node ordinal) and same reviewed arguments — resumes onto
    its durable row instead of orphaning the pre-crash decision on a
    duplicate. Decided rows hand back ``prior_decision`` so the resumed
    invocation applies the verdict without re-asking. Human gates keep
    ``False``: each park is a new round, UUID-distinguished, and resume
    re-asks (a human is available; unattended tool waits are not).
    """
    if assignee is not None and (not isinstance(assignee, str) or len(assignee) > 255):
        raise ValueError("Approval assignee must be at most 255 characters")
    if escalation_timeout_seconds is not None and (
        isinstance(escalation_timeout_seconds, bool)
        or not isinstance(escalation_timeout_seconds, int)
        or escalation_timeout_seconds <= 0
    ):
        raise ValueError("Approval escalation timeout must be a positive integer")
    channels = []
    if notifications is not None and not isinstance(notifications, list):
        raise ValueError("Approval notifications must be a list")
    for binding in notifications or []:
        if not isinstance(binding, dict) or set(binding) - {"channel", "credentialId", "credentialName"}:
            raise ValueError("Approval notification accepts credential references only")
        if binding.get("channel") not in {"slack", "email"}:
            raise ValueError("Approval notifications support Slack and email")
        if not binding.get("credentialId") and not binding.get("credentialName"):
            raise ValueError("Approval notification requires a bound credential")
        # Persist only references, never copied secrets/configuration.
        channels.append({k: binding[k] for k in ("channel", "credentialId", "credentialName") if binding.get(k)})
    key = _approval_key(run_id, node_id)
    _approval_events.setdefault(key, asyncio.Event())
    digest = _review_hash(review)

    def create() -> dict[str, Any]:
        with SessionLocal() as db:
            if db.get(models.WorkflowRun, UUID(run_id)) is None:
                raise ValueError("Approval run not found")
            # Resume reuse (tool path only — see allow_reuse): the same
            # invocation (same key AND same reviewed arguments) re-parks onto
            # its durable row instead of orphaning the pre-crash decision.
            prior = None
            if allow_reuse:
                prior = (
                    db.query(models.ApprovalRequest)
                    .filter(
                        models.ApprovalRequest.run_id == UUID(run_id),
                        models.ApprovalRequest.node_id == node_id,
                        models.ApprovalRequest.review_hash == digest,
                    )
                    .order_by(models.ApprovalRequest.parked_at.desc())
                    .first()
                )
            if prior is not None and prior.status in ("parked", "cancelled", "timed_out"):
                # Undecided (or recovery-cancelled) row: re-park it with a
                # fresh deadline window for the new waiter.
                prior.status = "parked"
                prior.parked_at = datetime.now(timezone.utc)
                prior.resolved_at = None
                db.commit()
                db.refresh(prior)
                return {**_metadata(prior), "reused": True}
            if prior is not None and prior.status in ("approved", "denied"):
                # Decided pre-crash: hand the durable verdict back so the
                # resumed invocation applies it without re-asking.
                meta = _metadata(prior)
                meta["prior_decision"] = {
                    "approved": prior.status == "approved",
                    "comment": prior.comment or "",
                }
                return {**meta, "reused": True}
            # No cross-key search: a later distinct call with identical
            # arguments must re-ask, never inherit another invocation's row.
            # Reuse is strictly (run_id, node_id, review_hash) — the key is
            # the persisted invocation ordinal and the digest pins the exact
            # reviewed arguments. A reset seq counter on resume lands the
            # replay on the same key; the digest guards the collision (a
            # different review inserts a fresh row even under a reused key).
            row = models.ApprovalRequest(
                run_id=UUID(run_id), node_id=node_id, assignee=assignee or None,
                escalation_timeout_seconds=escalation_timeout_seconds, status="parked",
                notification_channels=channels, notification_errors=[],
                parked_at=datetime.now(timezone.utc), review_hash=digest,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return _metadata(row)

    try:
        metadata = await asyncio.to_thread(create)
    except BaseException:
        clear_approval_state(run_id, node_id)
        raise
    _approval_rows[key] = metadata["approval_id"]
    return {**metadata, "review": review}


def submit_approval(
    run_id: str, *, approved: bool, comment: str = "", node_id: str | None = None,
    persist: bool = True,
) -> None:
    result = {"approved": approved, "comment": comment}
    targets = [_approval_key(run_id, node_id)] if node_id else (_keys_for_run(run_id) or [run_id])
    for key in targets:
        if persist:
            _resolve_key(key, "approved" if approved else "denied", comment)
        _approval_results[key] = result
        timer = _approval_timers.pop(key, None)
        if timer:
            timer.cancel()
        event = _approval_events.get(key)
        if event:
            event.set()

    _publish_decision(run_id)


def _notification_data(row_id: str, escalated: bool) -> dict[str, Any] | None:
    with SessionLocal() as db:
        row = db.query(models.ApprovalRequest).filter(models.ApprovalRequest.id == UUID(row_id)).with_for_update().first()
        if row is None or (escalated and (row.status != "parked" or row.escalated_at is not None)):
            return None
        if escalated:
            row.escalated_at = datetime.now(timezone.utc)
            _sync_pending(db, row)
        run = db.get(models.WorkflowRun, row.run_id)
        version = db.get(models.WorkflowVersion, run.workflow_version_id) if run else None
        workflow = db.get(models.Workflow, version.workflow_id) if version else None
        channels = []
        for binding in row.notification_channels:
            try:
                record = get_user_credential(
                    db, workflow.user_id,
                    credential_id=UUID(binding["credentialId"]) if binding.get("credentialId") else None,
                    name=binding.get("credentialName"),
                ) if workflow else None
                config = resolve_credential(record) if record and record.type == binding["channel"] else {}
            except Exception:
                config = {}
            channels.append((binding["channel"], config))
        payload = {"event": "approval_escalated" if escalated else "approval_requested", "run_id": str(row.run_id), **_metadata(row)}
        db.commit()
        return {"payload": payload, "webhook_url": workflow.webhook_url if workflow else None, "channels": channels}


def _record_notification_error(row_id: str, channel: str, event: str) -> None:
    # Transport exceptions can contain secret URLs/passwords: store/log only the channel and event.
    logger.warning("Approval notification failed", extra={"channel": channel, "approval_event": event})
    with SessionLocal() as db:
        row = db.get(models.ApprovalRequest, UUID(row_id))
        if row:
            row.notification_errors = [*row.notification_errors, {"channel": channel, "event": event, "error": "delivery_failed"}]
            _sync_pending(db, row)
            db.commit()


async def notify_approval(row_id: str, *, escalated: bool = False) -> dict[str, Any] | None:
    try:
        data = await asyncio.to_thread(_notification_data, row_id, escalated)
    except Exception:
        await asyncio.to_thread(_record_notification_error, row_id, "credentials", "approval_escalated" if escalated else "approval_requested")
        return None
    if data is None:
        return None
    payload = data["payload"]
    event = payload["event"]
    message = f"Aegis {event}: run {payload['run_id']}, node {payload['node_id']}; assignee: {payload['assignee'] or 'unassigned'}"
    context = {"last_output": message, "input": {"text": message}, "steps": {}, "memory": {}}
    if data["webhook_url"]:
        try:
            delivered = await dispatch_webhook(data["webhook_url"], payload)
        except Exception:
            delivered = False
        if not delivered:
            await asyncio.to_thread(_record_notification_error, row_id, "webhook", event)
    for channel, config in data["channels"]:
        try:
            if channel == "slack" and config.get("webhook_url"):
                result = await run_slack_integration(config["webhook_url"], "{{last_output}}", context, message)
                delivered = result.startswith("Slack 2")
            elif channel == "email" and config.get("smtp_host"):
                result = await run_email_integration(config, "Aegis approval notification", "{{last_output}}", context, message)
                delivered = result.startswith("Email sent to ")
            else:
                delivered = False
        except Exception:
            delivered = False
        if not delivered:
            await asyncio.to_thread(_record_notification_error, row_id, channel, event)
    return payload


async def wait_for_approval(
    run_id: str, *, node_id: str | None = None, timeout: float | None = None,
    emit: Any = None,
) -> dict[str, Any]:
    key = _approval_key(run_id, node_id)
    row_id = _approval_rows.get(key)
    notification = asyncio.create_task(notify_approval(row_id)) if row_id else None
    existing = _approval_results.get(key)
    if existing is None and node_id:
        existing = _approval_results.pop(run_id, None)
    if existing is not None:
        _resolve_key(key, "approved" if existing["approved"] else "denied", existing.get("comment", ""))
        if notification:
            await notification
        clear_approval_state(run_id, node_id)
        return existing

    limit = timeout if timeout is not None else float(settings.approval_timeout_seconds)
    event = _approval_events.setdefault(key, asyncio.Event())

    # Deadlines anchor to the parked row's wall-clock parked_at so they survive
    # restarts and fire identically in every process; only when no row is known
    # does the clock start at wait entry.
    state = await asyncio.to_thread(_row_state, row_id)
    parked_at = state.get("parked_at") if state else None
    now = datetime.now(timezone.utc)
    deadline = (parked_at if parked_at else now) + timedelta(seconds=limit)
    escalation = state.get("escalation_timeout_seconds") if state else None
    escalation_deadline = parked_at + timedelta(seconds=escalation) if parked_at and escalation else None

    async def escalate() -> None:
        delay = (escalation_deadline - datetime.now(timezone.utc)).total_seconds()
        await asyncio.sleep(max(0, delay))
        if notification:
            await asyncio.shield(notification)
        if event.is_set():
            return
        payload = await notify_approval(row_id, escalated=True)
        if payload and callable(emit):
            await emit({"type": "approval_escalated", **payload})

    if escalation_deadline is not None:
        _approval_timers[key] = asyncio.create_task(escalate())

    async def poll_decision() -> dict[str, Any] | None:
        if not row_id:
            return None
        return _decision_from_state(await asyncio.to_thread(_row_state, row_id))

    try:
        decision = None
        while True:
            if event.is_set():
                break
            now = datetime.now(timezone.utc)
            # Poll before honoring the deadline so a remote decision committed at
            # the boundary wins over a spurious local timeout.
            decision = await poll_decision()
            if decision is not None:
                break
            if now >= deadline:
                await asyncio.to_thread(_resolve_key, key, "timed_out", f"Approval timed out after {limit}s")
                raise HumanApprovalTimeout(f"Approval timed out after {limit}s")
            try:
                await asyncio.wait_for(
                    event.wait(),
                    timeout=max(0.0, min(_POLL_SECONDS, (deadline - now).total_seconds())),
                )
            except asyncio.TimeoutError:
                pass
        if notification:
            await notification
        return _approval_results.pop(key, None) or decision or {"approved": False, "comment": "no decision"}
    except asyncio.CancelledError:
        await asyncio.to_thread(_resolve_key, key, "cancelled")
        raise
    finally:
        timer = _approval_timers.get(key)
        clear_approval_state(run_id, node_id)
        tasks = [task for task in (timer, notification) if task is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


def _on_remote_decision(run_id: Any) -> None:
    """Event-bus callback: a decision committed in another process resolved a row.

    Re-reads the rows behind local wait keys and delivers the decision to
    in-process waiters the same way ``submit_approval`` would.
    """
    rid = str(run_id)
    prefix = f"{rid}::"
    keys = [key for key in list(_approval_rows) if key == rid or key.startswith(prefix)]
    for key in keys:
        row_id = _approval_rows.get(key)
        if not row_id:
            continue
        decision = _decision_from_state(_row_state(row_id))
        if decision is None:
            continue
        _approval_results.setdefault(key, decision)
        timer = _approval_timers.pop(key, None)
        if timer:
            timer.cancel()
        event = _approval_events.get(key)
        if event:
            event.set()


try:
    from app.services import event_bus

    event_bus.set_approval_dispatcher(_on_remote_decision)
except ImportError:
    # Event bus module may be unavailable (e.g. mid-deploy); the waiter's 1s DB
    # poll still delivers every cross-process decision.
    pass
