import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.services import executor
from app.services.executor import (
    _run_events,
    schedule_run,
    stream_run_events,
)


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
    existing = asyncio.Queue(maxsize=256)
    await existing.put({"type": "subscriber_ready"})
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
async def test_stream_run_events_uses_bounded_queue():
    run_id = str(uuid4())
    _run_events.pop(run_id, None)

    gen = stream_run_events(run_id)
    first = asyncio.create_task(gen.__anext__())
    await asyncio.sleep(0.01)
    queue = _run_events[run_id]
    assert queue.maxsize == 256

    await queue.put({"type": "stream_end"})
    first_event = await first
    assert first_event["type"] == "stream_end"
    events = [event async for event in gen]
    assert not events
    assert run_id not in _run_events
    _run_events.pop(run_id, None)


@pytest.mark.asyncio
async def test_stream_run_events_cleans_up_on_cancel():
    run_id = str(uuid4())
    _run_events[run_id] = asyncio.Queue(maxsize=256)

    gen = stream_run_events(run_id)
    consumer = gen.__aiter__()
    wait_task = asyncio.create_task(consumer.__anext__())
    await asyncio.sleep(0.01)
    wait_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await wait_task
    await gen.aclose()

    assert run_id not in _run_events