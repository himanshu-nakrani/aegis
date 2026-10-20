import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.db import models
from app.db.database import SessionLocal
from app.services import executor
from app.services.event_bus import delete_run_events, publish_run_event
from app.services.executor import (
    _RunEventBroker,
    _enqueue_event,
    _on_remote_run_event,
    _put_run_event,
    _run_events,
    schedule_run,
    stream_run_events,
)


def _make_db_run() -> str:
    """Create a workflow run row so run_events inserts satisfy the FK."""
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=uuid4(), name="executor-test")
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


def test_stringify_bytes():
    from app.services.executor import _stringify_value

    assert _stringify_value(b"hello") == "hello"


def test_stringify_extracts_function_call_response():
    from app.services.executor import _stringify_value

    message = SimpleNamespace(
        parts=[
            SimpleNamespace(
                text=None,
                function_call=SimpleNamespace(
                    args={"response": "15 * 7 = 105"},
                ),
            )
        ]
    )
    assert _stringify_value(message) == "15 * 7 = 105"


def test_stringify_extracts_quoted_json_text():
    from app.services.executor import _stringify_value

    message = SimpleNamespace(parts=[SimpleNamespace(text='"105"', function_call=None)])
    assert _stringify_value(message) == "105"


def test_stringify_model_dump_with_bytes_field():
    from app.services.executor import _extract_text_parts, _stringify_value

    message = SimpleNamespace(
        parts=[
            SimpleNamespace(
                text="done",
                thought_signature=b"\x00\x01",
                function_call=None,
            )
        ]
    )
    assert _extract_text_parts(message) == "done"
    serialized = _stringify_value(message)
    assert serialized == "done"


def test_stringify_dict_with_bytes_uses_default():
    from app.services.executor import _stringify_value

    payload = {"blob": b"abc"}
    assert json.loads(_stringify_value(payload)) == {"blob": "abc"}


@pytest.mark.asyncio
async def test_schedule_run_preserves_existing_event_queue(monkeypatch):
    run_id = uuid4()
    run_key = str(run_id)
    existing = _RunEventBroker()
    _run_events[run_key] = existing

    async def _noop_execute(_run_id):
        return None

    mock_task = SimpleNamespace(add_done_callback=lambda _cb: None)
    monkeypatch.setattr(executor, "execute_run", _noop_execute)
    def _fake_create_task(coro):
        if asyncio.iscoroutine(coro):
            coro.close()
        return mock_task

    monkeypatch.setattr(executor.asyncio, "create_task", _fake_create_task)

    schedule_run(run_id)

    assert _run_events[run_key] is existing
    _run_events.pop(run_key, None)
    executor._active_tasks.pop(run_key, None)


@pytest.mark.asyncio
async def test_enqueue_event_does_not_block_when_queue_full():
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=2)
    _enqueue_event(queue, {"type": "first"})
    _enqueue_event(queue, {"type": "second"})
    _enqueue_event(queue, {"type": "third"})
    assert queue.qsize() == 2
    first = queue.get_nowait()
    second = queue.get_nowait()
    assert first["type"] == "second"
    assert second["type"] == "third"


@pytest.mark.asyncio
async def test_broker_fans_out_to_all_subscribers():
    broker = _RunEventBroker()
    q1 = broker.subscribe()
    q2 = broker.subscribe()
    await _put_run_event(broker, {"type": "node_started"})
    assert q1.get_nowait()["type"] == "node_started"
    assert q2.get_nowait()["type"] == "node_started"


@pytest.mark.asyncio
async def test_stream_run_events_uses_bounded_queue():
    run_id = str(uuid4())
    _run_events.pop(run_id, None)

    gen = stream_run_events(run_id)
    first = asyncio.create_task(gen.__anext__())
    await asyncio.sleep(0.01)
    broker = _run_events[run_id]
    assert len(broker.subscribers) == 1
    queue = next(iter(broker.subscribers))
    assert queue.maxsize == 256

    await _put_run_event(broker, {"type": "stream_end"})
    first_event = await first
    assert first_event["type"] == "stream_end"
    events = [event async for event in gen]
    assert not events
    assert run_id not in _run_events
    _run_events.pop(run_id, None)


@pytest.mark.asyncio
async def test_stream_run_events_terminated_broker_ends_immediately():
    run_id = str(uuid4())
    broker = _RunEventBroker()
    broker.terminated = True
    _run_events[run_id] = broker

    events = [event async for event in stream_run_events(run_id)]
    assert events == [{"type": "stream_end"}]
    _run_events.pop(run_id, None)


@pytest.mark.asyncio
async def test_stream_run_events_cleans_up_on_cancel():
    run_id = str(uuid4())
    _run_events[run_id] = _RunEventBroker()

    gen = stream_run_events(run_id)
    consumer = gen.__aiter__()
    wait_task = asyncio.create_task(consumer.__anext__())
    await asyncio.sleep(0.01)
    wait_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await wait_task
    await gen.aclose()

    assert run_id not in _run_events


@pytest.mark.asyncio
async def test_broker_dedupes_rebroadcast_seq():
    """A seq already delivered locally (remote NOTIFY redispatch) is dropped."""
    broker = _RunEventBroker()
    queue = broker.subscribe()
    broker.broadcast({"type": "node_started", "seq": 1})
    broker.broadcast({"type": "node_started", "seq": 1})
    broker.broadcast({"type": "node_completed", "seq": 2})
    assert queue.qsize() == 2
    assert queue.get_nowait()["seq"] == 1
    assert queue.get_nowait()["seq"] == 2


@pytest.mark.asyncio
async def test_broker_delivered_set_is_bounded():
    broker = _RunEventBroker()
    for seq in range(_RunEventBroker._DELIVERED_CAP + 10):
        assert broker.mark_delivered(seq)
    assert len(broker.delivered) == _RunEventBroker._DELIVERED_CAP
    # The oldest seqs were evicted FIFO-style and may be re-delivered.
    assert broker.mark_delivered(0)


@pytest.mark.asyncio
async def test_stream_run_events_replays_persisted_after_seq():
    """SSE resume replays only rows above Last-Event-ID, in seq order."""
    run_id = _make_db_run()
    _run_events.pop(run_id, None)
    try:
        for index in range(3):
            await asyncio.to_thread(
                publish_run_event,
                run_id,
                {"type": "node_started", "run_id": run_id, "node_id": f"n{index}"},
            )

        gen = stream_run_events(run_id, after_seq=1)
        first = await gen.__anext__()
        second = await gen.__anext__()
        assert [first["seq"], second["seq"]] == [2, 3]
        assert first["node_id"] == "n1" and second["node_id"] == "n2"
        await gen.aclose()
    finally:
        _run_events.pop(run_id, None)


@pytest.mark.asyncio
async def test_stream_run_events_dedupes_live_replay_overlap():
    """A seq that raced the replay fetch is skipped when it arrives live."""
    run_id = _make_db_run()
    _run_events.pop(run_id, None)
    try:
        await asyncio.to_thread(
            publish_run_event, run_id, {"type": "run_started", "run_id": run_id}
        )
        gen = stream_run_events(run_id, after_seq=0)
        replayed = await gen.__anext__()
        assert replayed["type"] == "run_started" and replayed["seq"] == 1

        broker = _run_events[run_id]
        queue = next(iter(broker.subscribers))
        # A duplicate of the replayed seq reaching the live queue must be skipped.
        _enqueue_event(queue, {"type": "run_started", "run_id": run_id, "seq": 1})
        await _put_run_event(
            broker, {"type": "node_started", "run_id": run_id, "node_id": "n1"}
        )
        live = await gen.__anext__()
        assert live["type"] == "node_started" and live["seq"] == 2

        await _put_run_event(broker, {"type": "stream_end", "run_id": run_id})
        end = await gen.__anext__()
        assert end["type"] == "stream_end"
        await gen.aclose()
    finally:
        _run_events.pop(run_id, None)
        delete_run_events(run_id)


@pytest.mark.asyncio
async def test_remote_dispatch_fans_out_and_dedupes():
    """_on_remote_run_event (the event-bus dispatcher) reaches subscribers once."""
    run_id = _make_db_run()
    _run_events.pop(run_id, None)
    try:
        gen = stream_run_events(run_id, after_seq=0)
        # Establish the subscription without any persisted rows.
        pending = asyncio.create_task(gen.__anext__())
        await asyncio.sleep(0.01)
        _on_remote_run_event(run_id, 7, "node_started", {"run_id": run_id, "node_id": "n7"})
        _on_remote_run_event(run_id, 7, "node_started", {"run_id": run_id, "node_id": "n7"})
        event = await pending
        assert event["type"] == "node_started" and event["seq"] == 7 and event["node_id"] == "n7"
        await gen.aclose()
    finally:
        _run_events.pop(run_id, None)


def _make_graph_run(graph_json: dict, status: str = "queued", metrics: dict | None = None):
    """Persist a workflow/version/run row for execute_run tests."""
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=uuid4(), name="resume-test")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            workflow_id=workflow.id, version_number=1, graph_json=graph_json
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            workflow_version_id=version.id,
            status=status,
            input_text="hi",
            metrics_json=metrics,
        )
        db.add(run)
        db.commit()
        return run.id
    finally:
        db.close()


@pytest.mark.asyncio
async def test_execute_run_re_parks_approval_with_fresh_row(monkeypatch):
    """Crash-resume of an awaiting_approval run re-parks a new ApprovalRequest
    row and clears the stale metrics.pending_approval."""
    from app.services import node_handlers
    from app.services.checkpoints import mark_node_completed, mark_node_started
    from app.services.graph_defaults import wrap_graph_with_trigger_end
    from datetime import datetime, timezone

    graph = wrap_graph_with_trigger_end(
        [
            {"id": "appr", "position": {"x": 0, "y": 0},
             "data": {"label": "Approval", "nodeType": "human_approval"}},
        ],
        [],
        entry_id="appr",
        exit_id="appr",
    )
    run_id = _make_graph_run(graph, metrics={"pending_approval": {"node_id": "appr"}})

    db = SessionLocal()
    try:
        mark_node_completed(db, run_id, "trigger", "hi")
        mark_node_started(db, run_id, "appr")
        db.add(models.ApprovalRequest(
            run_id=run_id, node_id="appr", status="cancelled",
            notification_channels=[], notification_errors=[],
            parked_at=datetime.now(timezone.utc),
            resolved_at=datetime.now(timezone.utc),
        ))
        db.commit()
    finally:
        db.close()

    async def _approve_now(run_id, *, node_id=None, timeout=None, emit=None):
        return {"approved": True, "comment": ""}

    monkeypatch.setattr(node_handlers, "wait_for_approval", _approve_now)

    async def _noop_drain():
        return None

    monkeypatch.setattr(executor, "_drain_queued_runs", _noop_drain)

    await executor.execute_run(run_id)

    db = SessionLocal()
    try:
        finished = db.get(models.WorkflowRun, run_id)
        assert finished.status == "completed"
        assert "pending_approval" not in (finished.metrics_json or {})
        rows = (
            db.query(models.ApprovalRequest)
            .filter_by(run_id=run_id)
            .order_by(models.ApprovalRequest.parked_at)
            .all()
        )
        statuses = [r.status for r in rows]
        # Old (cancelled-by-sweep) row preserved; a fresh parked row was created.
        assert "cancelled" in statuses and "parked" in statuses
    finally:
        db.close()


@pytest.mark.asyncio
async def test_drain_queued_runs_schedules_claimed(monkeypatch):
    """The inline drain claims queued rows oldest-first and schedules them."""
    claimed_ids = [uuid4(), uuid4()]
    monkeypatch.setattr(
        "app.services.run_worker.claim_pending_runs", lambda limit=5: claimed_ids
    )
    scheduled: list = []
    monkeypatch.setattr(executor, "schedule_run", scheduled.append)

    await executor._drain_queued_runs()

    assert scheduled == claimed_ids

@pytest.mark.asyncio
async def test_stream_replays_terminal_after_broker_terminated():
    """A reconnect in the pre-cleanup window gets the persisted run_failed
    payload, not a bare stream_end (regression for #13)."""
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=uuid4(), name="stream-replay-test")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(workflow_id=workflow.id, version_number=1, graph_json={})
        db.add(version)
        db.flush()
        run = models.WorkflowRun(workflow_version_id=version.id, input_text="hi", status="failed")
        db.add(run)
        db.commit()
        run_id = str(run.id)
    finally:
        db.close()
    _run_events.pop(run_id, None)
    try:
        publish_run_event(run_id, {"type": "run_failed", "run_id": run_id, "error": "boom"})
        broker = _RunEventBroker()
        broker.terminated = True
        _run_events[run_id] = broker
        events = [event async for event in stream_run_events(run_id)]
        types = [e["type"] for e in events]
        assert "run_failed" in types
        assert events[-1] == {"type": "stream_end"}
    finally:
        _run_events.pop(run_id, None)


@pytest.mark.asyncio
async def test_stream_follows_broker_swap_without_replayed_stream_end():
    """A resume swaps _run_events mid-replay of a log with no stream_end row:
    the generator must refetch and yield the new attempt's events instead of
    emitting a bare stream_end off the stale terminated broker."""
    run_id = _make_db_run()
    _run_events.pop(run_id, None)
    old_broker = _RunEventBroker()
    new_broker = _RunEventBroker()
    intruder = _RunEventBroker()
    _run_events[run_id] = old_broker
    publish_run_event(run_id, {"type": "node_started", "run_id": run_id, "node_id": "n1"})

    # Swap the broker at the moment the replay loop marks the non-terminal
    # event delivered — after the first _follow_restart check, so only the
    # post-exhaustion recheck can catch it.
    real_mark = _RunEventBroker.mark_delivered

    def mark_and_swap(self, seq):
        if self is old_broker:
            _run_events[run_id] = new_broker
            old_broker.terminated = True
            publish_run_event(
                run_id, {"type": "node_completed", "run_id": run_id, "node_id": "n1"}
            )
        return real_mark(self, seq)

    events: list[dict] = []
    try:
        from unittest.mock import patch

        with patch.object(_RunEventBroker, "mark_delivered", mark_and_swap):
            gen = stream_run_events(run_id)
            try:
                events.append(await gen.__anext__())  # node_started (old log)
                events.append(await gen.__anext__())  # node_completed (new attempt)
            finally:
                # A THIRD broker lands under us while the generator is still
                # suspended mid-stream: closing it must not pop someone
                # else's replacement (the finally pop is identity-guarded).
                _run_events[run_id] = intruder
                await gen.aclose()
            assert _run_events.get(run_id) is intruder
    finally:
        _run_events.pop(run_id, None)
        delete_run_events(run_id)

    assert [e["type"] for e in events] == ["node_started", "node_completed"]
