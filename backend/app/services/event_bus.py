"""Durable run-event transport: the ``run_events`` replay log plus Postgres
LISTEN/NOTIFY cross-process fan-out.

Publish path (executor -> ``_put_run_event`` -> ``publish_run_event``):
    INSERT run_events row (seq = per-run max(seq)+1, inside the insert txn)
    -> pg_notify('aegis_run_events', run_id)  (Postgres only)
    -> local broker broadcast (caller's job, after this returns the seq).

Remote API/worker processes run ``start_event_listener``: a dedicated raw
connection issues ``LISTEN aegis_run_events``/``LISTEN aegis_approval_events``
and a thread forwards NOTIFY payloads into the event loop via
``call_soon_threadsafe``. The loop-side consumer fetches rows with
``seq > watermark`` and invokes the registered dispatchers — the row is the
source of truth, NOTIFY is only a wake-up hint. A periodic catch-up sweep
(``settings.event_bus_poll_seconds``) over the registered active-run-ids
provider covers missed notifies entirely.

SQLite dev/test deployments get durable rows and replay (publish/fetch/delete
work normally) but no NOTIFY, no listener, and no sweep — everything is a
single process there.
"""

from __future__ import annotations

import asyncio
import json
import logging
import select
import threading
import uuid
from collections.abc import Callable, Iterable
from typing import Any

from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.db import models
from app.db.database import SessionLocal, engine

logger = logging.getLogger("aegis.event_bus")

RUN_EVENTS_CHANNEL = "aegis_run_events"
APPROVAL_EVENTS_CHANNEL = "aegis_approval_events"

_PUBLISH_MAX_ATTEMPTS = 3
_LISTENER_BACKOFF_SECONDS = 5.0
_DISPATCH_DELIVERY_TIMEOUT_SECONDS = 10.0

# Registration hooks — set by the modules that own the fan-out targets so this
# module never imports the executor or approval service (circular imports).
_run_event_dispatcher: Callable[[str, int, str, dict[str, Any]], None] | None = None
_approval_dispatcher: Callable[[str], None] | None = None
_active_run_ids_provider: Callable[[], Iterable[str]] | None = None


def set_run_event_dispatcher(fn: Callable[[str, int, str, dict[str, Any]], None] | None) -> None:
    """Register ``fn(run_id, seq, type, payload)`` for remotely-published events."""
    global _run_event_dispatcher
    _run_event_dispatcher = fn


def set_approval_dispatcher(fn: Callable[[str], None] | None) -> None:
    """Register ``fn(run_id)`` for remotely-published approval decisions."""
    global _approval_dispatcher
    _approval_dispatcher = fn


def set_active_run_ids_provider(fn: Callable[[], Iterable[str]] | None) -> None:
    """Register the provider of run ids the catch-up sweep should poll."""
    global _active_run_ids_provider
    _active_run_ids_provider = fn


def _is_postgres() -> bool:
    return engine.dialect.name == "postgresql"


def _notify_enabled() -> bool:
    return _is_postgres() and bool(settings.event_bus_notify_enabled)


def _as_uuid(run_id: uuid.UUID | str) -> uuid.UUID:
    return run_id if isinstance(run_id, uuid.UUID) else uuid.UUID(str(run_id))


def _json_default(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def publish_run_event(run_id: uuid.UUID | str, event: dict[str, Any]) -> dict[str, Any]:
    """Persist ``event`` to the replay log and return it with ``seq`` injected.

    ``seq`` is per-run ``max(seq)+1`` computed inside the insert transaction.
    The executing process is the single writer per run, but a defensive
    IntegrityError retry covers any residual cross-thread race. On Postgres a
    ``pg_notify`` in the same transaction wakes remote listeners after commit.

    Runs synchronously — callers on the event loop must use ``to_thread``.
    """
    rid = _as_uuid(run_id)
    # Round-trip through JSON so non-JSON values (bytes, datetimes, model
    # objects) cannot break the row insert; the stored payload is exactly what
    # SSE replay later serializes.
    payload = json.loads(json.dumps(event, default=_json_default))
    for attempt in range(_PUBLISH_MAX_ATTEMPTS):
        session = SessionLocal()
        try:
            next_seq = (
                session.query(func.max(models.RunEvent.seq))
                .filter(models.RunEvent.run_id == rid)
                .scalar()
                or 0
            ) + 1
            session.add(models.RunEvent(run_id=rid, seq=next_seq, type=str(event["type"]), payload=payload))
            if _notify_enabled():
                session.execute(
                    text("SELECT pg_notify(:channel, :payload)"),
                    {"channel": RUN_EVENTS_CHANNEL, "payload": str(rid)},
                )
            session.commit()
            return {**event, "seq": next_seq}
        except IntegrityError:
            session.rollback()
            if attempt == _PUBLISH_MAX_ATTEMPTS - 1:
                raise
        finally:
            session.close()
    raise RuntimeError("unreachable")


def fetch_run_events(run_id: uuid.UUID | str, after_seq: int = 0) -> list[dict[str, Any]]:
    """Return persisted events for ``run_id`` with ``seq > after_seq``, ordered."""
    session = SessionLocal()
    try:
        rows = (
            session.query(models.RunEvent)
            .filter(models.RunEvent.run_id == _as_uuid(run_id), models.RunEvent.seq > after_seq)
            .order_by(models.RunEvent.seq)
            .all()
        )
        return [{**row.payload, "type": row.type, "seq": row.seq} for row in rows]
    finally:
        session.close()


def delete_run_events(run_id: uuid.UUID | str) -> None:
    """Drop the replay log for a run once it reaches a terminal state."""
    session = SessionLocal()
    try:
        session.query(models.RunEvent).filter(models.RunEvent.run_id == _as_uuid(run_id)).delete(
            synchronize_session=False
        )
        session.commit()
    finally:
        session.close()


def max_seqs(run_ids: Iterable[uuid.UUID | str]) -> dict[str, int]:
    """Return ``{run_id_str: max seq}`` for runs that have persisted events."""
    ids = {_as_uuid(r) for r in run_ids}
    if not ids:
        return {}
    session = SessionLocal()
    try:
        rows = (
            session.query(models.RunEvent.run_id, func.max(models.RunEvent.seq))
            .filter(models.RunEvent.run_id.in_(ids))
            .group_by(models.RunEvent.run_id)
            .all()
        )
        return {str(rid): int(seq) for rid, seq in rows}
    finally:
        session.close()


def publish_terminal_sync(run_id, event_type: str, payload: dict | None = None) -> None:
    """Best-effort terminal event pair for writers outside ``execute_run``.

    Sweep/recovery/unschedule paths set terminal status directly with no
    ``_put_run_event`` — attached SSE subscribers then heartbeat until the
    120s cleanup instead of closing, because `stream_run_events` exits only
    on `stream_end`. This publishes the terminal payload AND `stream_end`
    through the same ``publish_run_event`` (seq + pg_notify + replay log) so
    the stream and the durable log stay consistent. Never raises.
    """
    import asyncio as _asyncio
    import logging as _logging

    log = _logging.getLogger("aegis.event_bus")
    try:
        event = {"type": event_type, "run_id": str(run_id), **(payload or {})}
        published = publish_run_event(run_id, event)
        end_published = publish_run_event(run_id, {"type": "stream_end", "run_id": str(run_id)})
    except Exception:
        log.exception("Terminal publish failed", extra={"run_id": str(run_id)})
        return
    try:
        from app.services import executor as _executor

        broker = _executor._run_events.get(str(run_id))
    except Exception:
        return
    if broker is None:
        return
    # Worker-thread callers (unschedule/sweep/recovery run off-loop) must not
    # touch asyncio queues directly — marshal onto the main loop. Fall back
    # to direct broadcast when already on the loop's thread or no loop exists
    # (tests); the replay log above is the durability backstop either way.
    try:
        loop = _asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    main = None
    try:
        from app.services.async_tasks import _main_loop

        main = _main_loop
    except Exception:
        main = None
    if loop is None and main is not None and main.is_running():
        try:
            main.call_soon_threadsafe(broker.broadcast, published)
            main.call_soon_threadsafe(broker.broadcast, end_published)
            return
        except RuntimeError:
            pass
    try:
        broker.broadcast(published)
        broker.broadcast(end_published)
    except Exception:
        log.exception("Terminal broadcast failed", extra={"run_id": str(run_id)})


def publish_approval_decision(run_id: uuid.UUID | str) -> None:
    """NOTIFY ``aegis_approval_events`` so remote processes re-read the row.

    Postgres-only; callers poll the ApprovalRequest row as the fallback, so a
    failed notify degrades to the poll interval rather than a stuck waiter.
    """
    if not _notify_enabled():
        return
    session = SessionLocal()
    try:
        session.execute(
            text("SELECT pg_notify(:channel, :payload)"),
            {"channel": APPROVAL_EVENTS_CHANNEL, "payload": str(run_id)},
        )
        session.commit()
    except Exception:  # noqa: BLE001 — NOTIFY is a hint; the row is the truth
        session.rollback()
        logger.warning("Failed to publish approval decision notify", extra={"run_id": str(run_id)})
    finally:
        session.close()


# ---------------------------------------------------------------------------
# LISTEN/NOTIFY listener (Postgres only)
# ---------------------------------------------------------------------------

_listener_thread: threading.Thread | None = None
_listener_stop = threading.Event()
_notify_queue: asyncio.Queue[tuple[str, str]] | None = None
_notify_loop: asyncio.AbstractEventLoop | None = None
_consumer_task: asyncio.Task[None] | None = None

# Per-run high-water mark of dispatched seqs; a NOTIFY or sweep only fetches
# rows strictly above it, and the consumer never rewinds it.
_watermarks: dict[str, int] = {}
_watermark_lock = threading.Lock()


def _drain_notifies(conn: Any) -> list[tuple[str, str]]:
    """Pull pending (channel, payload) pairs off psycopg2/psycopg3 connections."""
    notifies = getattr(conn, "notifies", None)
    if notifies is None:
        return []
    if callable(notifies):  # psycopg 3: generator method
        drained = notifies(timeout=0)
    else:  # psycopg2: list attribute populated by conn.poll()
        poll = getattr(conn, "poll", None)
        if callable(poll):
            poll()
        drained = list(notifies)
        del notifies[:]
    return [(str(n.channel), str(n.payload)) for n in drained]


def _post_notify(channel: str, payload: str) -> None:
    queue = _notify_queue
    loop = _notify_loop
    if queue is None or loop is None or loop.is_closed():
        return
    try:
        loop.call_soon_threadsafe(queue.put_nowait, (channel, payload))
    except RuntimeError:
        # Loop closed mid-shutdown; the run row and catch-up sweeps cover it.
        pass


def _listen_once() -> None:
    """One LISTEN session; returns when the connection dies or stop is set."""
    conn = engine.raw_connection()
    try:
        try:
            conn.autocommit = True
        except Exception:  # noqa: BLE001 — some drivers manage autocommit
            pass
        cur = conn.cursor()
        cur.execute(f"LISTEN {RUN_EVENTS_CHANNEL}")
        cur.execute(f"LISTEN {APPROVAL_EVENTS_CHANNEL}")
        while not _listener_stop.is_set():
            readable, _, _ = select.select([conn], [], [], 1.0)
            if not readable:
                continue
            for channel, payload in _drain_notifies(conn):
                kind = "approval" if channel == APPROVAL_EVENTS_CHANNEL else "run"
                _post_notify(kind, payload)
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def _listen_loop() -> None:
    while not _listener_stop.is_set():
        try:
            _listen_once()
        except Exception:  # noqa: BLE001 — OperationalError and friends
            if _listener_stop.is_set():
                break
            logger.exception("Run-event listener connection lost; retrying")
            _listener_stop.wait(_LISTENER_BACKOFF_SECONDS)
        else:
            break


def _deliver_run_event(run_id: str, seq: int, event_type: str, payload: dict[str, Any]) -> None:
    """Invoke the run-event dispatcher, marshaling onto the event loop.

    Review follow-up (PR #95): `_dispatch_new_events`/`_catchup_sweep` run
    in a worker thread (sync SQLAlchemy must never park the loop), but the
    dispatcher fans out into `broker.broadcast` -> `asyncio.Queue.put_nowait`
    on loop-owned queues. Calling it from the worker thread means waiting
    streams may never wake (and asyncio debug checks can raise after the
    watermark already advanced). The DB fetch stays off-loop; only the
    delivery hop is marshaled via call_soon_threadsafe. With no listener
    loop (tests, SQLite), delivery is a direct call.

    Fire-and-forget is not enough: the worker thread must observe delivery
    outcome so a poison seq still stalls the watermark (see
    `test_dispatch_stalls_watermark_on_dispatcher_failure`). A threading
    handshake blocks the worker until the loop-side callback completes; a
    hung dispatcher trips the timeout and is retried on the next wake. A
    late success after a timeout is harmless — the broker dedupes by seq.
    """
    import asyncio as _asyncio

    dispatcher = _run_event_dispatcher
    if dispatcher is None:
        return
    loop = _notify_loop
    if loop is None:
        # No listener loop (SQLite/tests): deliver directly on this thread —
        # the queues' owning loop doesn't exist to marshal onto.
        _safe_deliver(dispatcher, run_id, seq, event_type, payload)
        return
    if loop.is_closed():
        # Shutdown: the subscriber queues belong to a dead loop — nothing can
        # be woken, and calling put_nowait off-thread would just raise. Drop
        # rather than stall the watermark on a process going away anyway.
        return
    try:
        running = _asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is loop:
        # Already on the owning loop (never happens via to_thread, but a
        # direct loop-side caller is safe by construction).
        _safe_deliver(dispatcher, run_id, seq, event_type, payload)
        return
    outcome: list[BaseException | None] = []
    done = threading.Event()

    def _run() -> None:
        try:
            dispatcher(run_id, seq, event_type, payload)
        except Exception as exc:  # noqa: BLE001 — poison seq
            logger.exception(
                "Run-event dispatcher raised",
                extra={"run_id": run_id, "seq": seq, "event_type": event_type},
            )
            outcome.append(exc)
        else:
            outcome.append(None)
        finally:
            done.set()

    try:
        loop.call_soon_threadsafe(_run)
    except RuntimeError as exc:
        raise RuntimeError("event loop closed during dispatch") from exc
    if not done.wait(timeout=_DISPATCH_DELIVERY_TIMEOUT_SECONDS):
        raise TimeoutError(f"run-event delivery timed out (seq={seq})")
    err = outcome[0] if outcome else TimeoutError("delivery callback never ran")
    if err is not None:
        raise err


def _safe_deliver(
    dispatcher: Callable[[str, int, str, dict[str, Any]], None],
    run_id: str, seq: int, event_type: str, payload: dict[str, Any],
) -> None:
    try:
        dispatcher(run_id, seq, event_type, payload)
    except Exception:  # noqa: BLE001 — never stall the consumer
        logger.exception(
            "Run-event dispatcher raised",
            extra={"run_id": run_id, "seq": seq, "event_type": event_type},
        )
        raise


def _dispatch_new_events(run_id: str) -> None:
    """Fetch rows above the watermark for one run and dispatch each. See
    `_deliver_run_event`: DB reads happen here off-loop; delivery is
    marshaled back onto the event loop."""
    watermark = _watermarks.get(run_id, 0)
    try:
        events = fetch_run_events(run_id, watermark)
    except Exception:  # noqa: BLE001 — transient DB error; retry next wake
        logger.exception("Failed to fetch run events for dispatch", extra={"run_id": run_id})
        return
    for event in events:
        seq = event["seq"]
        if _run_event_dispatcher is not None:
            payload = {k: v for k, v in event.items() if k not in ("seq", "type")}
            try:
                _deliver_run_event(run_id, seq, event["type"], payload)
            except Exception:  # noqa: BLE001 — poison seq, retry next wake
                # Stop at the poison seq: the watermark stays behind it so the
                # next wake/sweep retries instead of losing the event forever.
                break
        watermark = max(watermark, seq)
    with _watermark_lock:
        _watermarks[run_id] = max(_watermarks.get(run_id, 0), watermark)


def _catchup_sweep() -> None:
    if _active_run_ids_provider is None:
        return
    try:
        run_ids = list(_active_run_ids_provider() or [])
    except Exception:  # noqa: BLE001
        logger.exception("Active-run-ids provider raised")
        return
    for run_id in run_ids:
        _dispatch_new_events(str(run_id))
    # Forget watermarks for runs no longer active so the dict stays bounded;
    # a run that reappears re-seeds from its current max seq anyway.
    with _watermark_lock:
        active = {str(r) for r in run_ids}
        for stale in [k for k in _watermarks if k not in active]:
            _watermarks.pop(stale, None)


async def _consume_notifications() -> None:
    import asyncio as _asyncio

    queue = _notify_queue
    assert queue is not None
    poll = float(settings.event_bus_poll_seconds)
    while True:
        try:
            channel, run_id = await _asyncio.wait_for(queue.get(), timeout=poll)
        except _asyncio.TimeoutError:
            # L2: DB work runs in a worker thread — the dispatch fetch is sync
            # SQLAlchemy that must never park the event loop executing runs.
            await _asyncio.to_thread(_catchup_sweep)
            continue
        if channel == "approval":
            if _approval_dispatcher is not None:
                try:
                    _approval_dispatcher(run_id)
                except Exception:  # noqa: BLE001
                    logger.exception("Approval dispatcher raised", extra={"run_id": run_id})
        else:
            await _asyncio.to_thread(_dispatch_new_events, run_id)


def start_event_listener() -> None:
    """Start the NOTIFY listener thread + loop-side consumer. No-op off PG."""
    global _listener_thread, _notify_queue, _notify_loop, _consumer_task
    if not _notify_enabled():
        return
    if _listener_thread is not None:
        return
    _listener_stop.clear()
    _notify_queue = asyncio.Queue()
    _notify_loop = asyncio.get_running_loop()
    _consumer_task = asyncio.ensure_future(_consume_notifications())
    _listener_thread = threading.Thread(
        target=_listen_loop, name="aegis-event-listener", daemon=True
    )
    _listener_thread.start()
    logger.info("Run-event listener started (LISTEN %s, %s)", RUN_EVENTS_CHANNEL, APPROVAL_EVENTS_CHANNEL)


async def stop_event_listener() -> None:
    """Stop the consumer task and listener thread; safe to call when stopped."""
    global _listener_thread, _notify_queue, _notify_loop, _consumer_task
    _listener_stop.set()
    if _consumer_task is not None:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        _consumer_task = None
    _notify_queue = None
    _notify_loop = None
    thread = _listener_thread
    _listener_thread = None
    if thread is not None:
        # The select loop polls every 1s, so it notices the stop flag quickly;
        # join on a thread to avoid blocking the loop.
        await asyncio.to_thread(thread.join, _LISTENER_BACKOFF_SECONDS)
