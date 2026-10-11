"""Durable run-event transport tests (SQLite paths).

SQLite exercises the full replay-log surface — publish/seq/fetch/max_seqs/
delete — while LISTEN/NOTIFY, the listener thread, and approval notifies are
Postgres-only and must no-op here.
"""

import asyncio
from uuid import uuid4

import pytest

from app.db import models
from app.db.database import SessionLocal, engine
from app.services import event_bus
from app.services.event_bus import (
    delete_run_events,
    fetch_run_events,
    max_seqs,
    publish_approval_decision,
    publish_run_event,
    start_event_listener,
    stop_event_listener,
)


def _make_run() -> str:
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=uuid4(), name="event-bus-test")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(workflow_id=workflow.id, version_number=1, graph_json={})
        db.add(version)
        db.flush()
        run = models.WorkflowRun(workflow_version_id=version.id, input_text="hi", status="running")
        db.add(run)
        db.commit()
        return str(run.id)
    finally:
        db.close()


def test_publish_assigns_monotonic_seq_per_run():
    run_id = _make_run()
    other_id = _make_run()

    first = publish_run_event(run_id, {"type": "run_started", "run_id": run_id})
    second = publish_run_event(
        run_id, {"type": "node_started", "run_id": run_id, "node_id": "n1"}
    )
    other = publish_run_event(other_id, {"type": "run_started", "run_id": other_id})

    assert first["seq"] == 1 and second["seq"] == 2
    # Seqs are scoped per run, not global.
    assert other["seq"] == 1
    # The returned event is the original payload plus seq.
    assert second["type"] == "node_started" and second["node_id"] == "n1"


def test_fetch_replays_ordered_and_filters_after_seq():
    run_id = _make_run()
    for index in range(4):
        publish_run_event(
            run_id, {"type": "node_started", "run_id": run_id, "node_id": f"n{index}"}
        )

    events = fetch_run_events(run_id, after_seq=2)
    assert [e["seq"] for e in events] == [3, 4]
    assert [e["node_id"] for e in events] == ["n2", "n3"]
    # Replay payload shape matches what the SSE layer serializes.
    assert events[0]["type"] == "node_started" and events[0]["run_id"] == run_id


def test_publish_sanitizes_non_json_payload_values():
    run_id = _make_run()
    publish_run_event(run_id, {"type": "node_completed", "run_id": run_id, "blob": b"abc"})
    events = fetch_run_events(run_id, 0)
    assert events[0]["blob"] == "abc"


def test_max_seqs_reports_per_run_high_water():
    run_a = _make_run()
    run_b = _make_run()
    publish_run_event(run_a, {"type": "run_started", "run_id": run_a})
    publish_run_event(run_a, {"type": "node_started", "run_id": run_a})
    publish_run_event(run_b, {"type": "run_started", "run_id": run_b})

    seqs = max_seqs([run_a, run_b, uuid4()])
    assert seqs == {run_a: 2, run_b: 1}


def test_delete_run_events_clears_replay_log():
    run_id = _make_run()
    publish_run_event(run_id, {"type": "run_started", "run_id": run_id})
    delete_run_events(run_id)
    assert fetch_run_events(run_id, 0) == []
    assert max_seqs([run_id]) == {}


def test_dispatch_new_events_calls_dispatcher_once(monkeypatch):
    """NOTIFY/sweep path: rows above the watermark dispatch in order, once."""
    run_id = _make_run()
    publish_run_event(run_id, {"type": "run_started", "run_id": run_id})
    publish_run_event(run_id, {"type": "node_started", "run_id": run_id, "node_id": "n1"})

    calls = []
    monkeypatch.setattr(event_bus, "_run_event_dispatcher", lambda *args: calls.append(args))
    event_bus._watermarks.pop(run_id, None)
    try:
        event_bus._dispatch_new_events(run_id)
        assert [(seq, typ) for _rid, seq, typ, _p in calls] == [
            (1, "run_started"),
            (2, "node_started"),
        ]
        # A second sweep over the same rows dispatches nothing.
        event_bus._dispatch_new_events(run_id)
        assert len(calls) == 2
    finally:
        event_bus._watermarks.pop(run_id, None)


@pytest.mark.asyncio
async def test_listener_is_noop_on_sqlite():
    assert engine.dialect.name != "postgresql"
    start_event_listener()
    try:
        assert event_bus._listener_thread is None
        assert event_bus._consumer_task is None
    finally:
        await stop_event_listener()


def test_approval_notify_is_noop_on_sqlite():
    # Must not raise and must not touch a non-PG dialect.
    publish_approval_decision(uuid4())
