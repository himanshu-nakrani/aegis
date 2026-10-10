"""Phase 3 platform surfaces: session rehydration, streaming invoke, token deltas.

Covers the deployment-scoped contract:
- session_id on invoke rehydrates prior completed turns into the run's
  WorkflowContext (metrics_json staging, no new column).
- {{session.*}} expression roots resolve against that history.
- ?stream=true returns a live SSE stream for the invoked run.
- ADK partial events surface as node_delta run events.
"""

import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from google.genai import types

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from tests.conftest import valid_graph

client = TestClient(app)


# ---------- helpers ----------


def _echo_graph(template="{{input.text}}"):
    return valid_graph(
        [
            {
                "id": "a",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "transform", "label": "Echo", "template": template},
            }
        ]
    )


def _published_workflow():
    response = client.post(
        "/api/workflows",
        json={
            "name": f"Phase3 surface {uuid4()}",
            "graph_json": _echo_graph("{{session.last_output}}|{{input.text}}"),
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    response = client.post(
        f"/api/workflows/{body['id']}/publish",
        json={"version_id": body["latest_version"]["id"]},
    )
    assert response.status_code == 200, response.text
    return body


def _issue_invoke_key(wf):
    response = client.post(f"/api/workflows/{wf['id']}/deploy/credentials/invoke_key")
    assert response.status_code == 200, response.text
    return response.json()


def _invoke_headers(credential):
    return {
        "X-Aegis-Invoke-Key": credential["secret"],
        "X-Aegis-Deployment-ID": credential["deployment_id"],
        "X-Aegis-Version-ID": credential["version_id"],
    }


def _invoke(wf, credential, payload, **params):
    return client.post(
        f"/v1/workflows/{wf['id']}/invoke",
        json=payload,
        headers=_invoke_headers(credential),
        params=params,
    )


def _get_run(run_id):
    db = SessionLocal()
    try:
        return (
            db.query(models.WorkflowRun)
            .filter(models.WorkflowRun.id == UUID(str(run_id)))
            .first()
        )
    finally:
        db.close()


def _make_run(graph_json, input_text="hi"):
    """Persist workflow/version/run rows so checkpoint + node_result FKs hold."""
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=uuid4(), name=f"phase3-delta-{uuid4()}")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            workflow_id=workflow.id, version_number=1, graph_json=graph_json
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            workflow_version_id=version.id, status="queued", input_text=input_text
        )
        db.add(run)
        db.commit()
        return run.id
    finally:
        db.close()


# ---------- session reuse ----------


def test_session_reuse_rehydrates_context_between_turns():
    """Second invoke with the same session_id sees turn 1's input+output."""
    wf = _published_workflow()
    credential = _issue_invoke_key(wf)
    session_id = f"chat-{uuid4()}"

    first = _invoke(
        wf, credential, {"input": "turn one", "session_id": session_id}, wait=True
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "completed"
    assert first.json()["output"] == "|turn one"

    second = _invoke(
        wf, credential, {"input": "turn two", "session_id": session_id}, wait=True
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["status"] == "completed"
    # The transform rendered {{session.last_output}} from rehydrated history.
    assert body["output"] == "|turn one|turn two"

    run = _get_run(body["run_id"])
    context_snapshot = (run.metrics_json or {}).get("workflow_context") or {}
    history = context_snapshot.get("session_history")
    assert history and len(history) == 1
    assert history[0]["run_id"] == first.json()["run_id"]
    assert history[0]["input"] == "turn one"
    assert history[0]["output"] == "|turn one"


def test_session_history_not_shared_across_sessions():
    wf = _published_workflow()
    credential = _issue_invoke_key(wf)

    _invoke(wf, credential, {"input": "first", "session_id": f"s-{uuid4()}"}, wait=True)
    other = _invoke(
        wf, credential, {"input": "unrelated", "session_id": f"s-{uuid4()}"}, wait=True
    )
    assert other.status_code == 200
    # A fresh session sees no prior turns.
    assert other.json()["output"] == "|unrelated"


def test_expression_session_roots():
    from app.services.expressions import _resolve_path, render_template

    context = {
        "session_history": [
            {"run_id": "r1", "input": "q1", "output": "a1"},
            {"run_id": "r2", "input": "q2", "output": "a2"},
        ]
    }
    assert _resolve_path(context, "session.last_output", "") == "a2"
    assert _resolve_path(context, "session.0.output", "") == "a1"
    assert _resolve_path(context, "session.1.input", "") == "q2"
    assert _resolve_path(context, "session.turns", "") == context["session_history"]
    # Empty history and unknown paths resolve to None → render empty.
    assert _resolve_path({"session_history": []}, "session.last_output", "") is None
    assert _resolve_path(context, "session.9.output", "") is None
    assert render_template("[{{session.last_output}}]", context, "") == "[a2]"


def test_workflow_context_session_history_helpers():
    from app.services.workflow_context import WorkflowContext

    ctx = WorkflowContext.from_input("hi")
    assert ctx.get_session_history() == []
    ctx.set_session_history([{"output": "a1"}, "junk", None])
    assert ctx.get_session_history() == [{"output": "a1"}]
    assert ctx.to_dict()["session_history"] == [{"output": "a1"}]
    # Small per-run data — intentionally included in the metrics snapshot so
    # run detail shows what seeded the run.
    assert ctx.snapshot_for_metrics()["session_history"] == [{"output": "a1"}]


# ---------- streaming invoke ----------


def test_stream_invoke_returns_sse_with_terminal_event():
    wf = _published_workflow()
    credential = _issue_invoke_key(wf)

    with client.stream(
        "POST",
        f"/v1/workflows/{wf['id']}/invoke?stream=true",
        json={"input": "stream me", "session_id": f"s-{uuid4()}"},
        headers=_invoke_headers(credential),
    ) as response:
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())

    events = [
        json.loads(line[len("data: ") :])
        for line in raw.splitlines()
        if line.startswith("data: ")
    ]
    event_types = [e["type"] for e in events]
    assert "run_started" in event_types
    assert "node_started" in event_types
    assert "node_completed" in event_types
    assert "run_completed" in event_types
    assert event_types[-1] == "stream_end"
    completed = next(e for e in events if e["type"] == "run_completed")
    assert completed["final_output"] == "|stream me"


def test_wait_and_stream_are_mutually_exclusive():
    wf = _published_workflow()
    credential = _issue_invoke_key(wf)
    response = _invoke(wf, credential, {"input": "x"}, wait=True, stream=True)
    assert response.status_code == 400


def test_deployment_descriptor_requires_invoke_key():
    wf = _published_workflow()
    credential = _issue_invoke_key(wf)
    deployment_id = credential["deployment_id"]

    assert client.get(f"/v1/deployments/{deployment_id}/descriptor").status_code == 401
    assert (
        client.get(
            f"/v1/deployments/{deployment_id}/descriptor",
            headers={"X-Aegis-Invoke-Key": "aegis_inv_wrong"},
        ).status_code
        == 401
    )

    response = client.get(
        f"/v1/deployments/{deployment_id}/descriptor",
        headers={"X-Aegis-Invoke-Key": credential["secret"]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["deployment_id"] == deployment_id
    assert body["workflow_id"] == wf["id"]
    assert body["version_id"] == credential["version_id"]
    assert body["workflow_name"] == wf["name"]
    assert body["tool_name"].startswith("invoke_")
    assert body["input_schema"]["type"] == "object"
    # No credential material or webhook signing details leak through.
    leaked = json.dumps(body)
    for forbidden in ("invoke_key_hash", "webhook_secret", "signature_format", "secret"):
        assert forbidden not in leaked


# ---------- token deltas ----------


def _adk_event(*, partial=False, text=None, author="a"):
    content = (
        types.Content(role="model", parts=[types.Part(text=text)])
        if text is not None
        else None
    )
    return SimpleNamespace(
        partial=partial,
        author=author,
        output=None,
        message=None,
        content=content,
        turn_complete=False,
        usage_metadata=None,
        node_info=None,
    )


@pytest.mark.asyncio
async def test_node_delta_events_stream_partial_text(monkeypatch):
    from app.services import executor
    from app.services.event_bus import delete_run_events, fetch_run_events

    graph = _echo_graph()
    run_id = _make_run(graph)

    class _FakeRunner:
        def __init__(self, **kwargs):
            pass

        async def run_async(self, **kwargs):
            yield _adk_event(partial=True, text="Hello")
            yield _adk_event(partial=True, text=" world")
            yield _adk_event(partial=True)  # empty partial → no delta
            yield _adk_event(text="Hello world")  # final chunk completes the node

    monkeypatch.setattr(executor, "Runner", _FakeRunner)

    broker = executor._RunEventBroker()
    await executor._run_workflow(
        run_id,
        graph,
        broker,
        input_text="Hello world",
        workflow_user_id=None,
        workflow_id=None,
    )

    try:
        persisted = fetch_run_events(run_id)
    finally:
        delete_run_events(run_id)

    deltas = [e for e in persisted if e["type"] == "node_delta"]
    assert [d["delta"] for d in deltas] == ["Hello", " world"]
    assert all(d["node_id"] == "a" for d in deltas)
    assert all(d["run_id"] == str(run_id) for d in deltas)
    assert all(isinstance(d["seq"], int) for d in deltas)

    # Partials never complete the node; the final event records the output.
    completed = [e for e in persisted if e["type"] == "node_completed"]
    assert len(completed) == 1
    assert completed[0]["node_id"] == "a"
    assert completed[0]["output"] == "Hello world"
    # One node_started, deltas after it.
    types_seen = [e["type"] for e in persisted]
    assert types_seen.index("node_delta") > types_seen.index("node_started")
