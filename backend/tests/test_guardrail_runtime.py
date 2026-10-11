"""Production judge availability stops real ADK runs before actions execute."""

import asyncio
from typing import ClassVar
from uuid import uuid4

import pytest
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services import executor


class CountingModel(BaseLlm):
    calls: ClassVar[int] = 0

    async def generate_content_async(self, llm_request, stream=False):
        type(self).calls += 1
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text='"Reviewed response"')]))


@pytest.mark.parametrize("scope", ("node", "workflow_input", "workflow_output"))
@pytest.mark.parametrize("guardrail_type", ("llm", "prompt_injection", "moderation"))
@pytest.mark.parametrize("fail_behavior", ("warn", "mask", "rewrite", "fallback", "route"))
@pytest.mark.parametrize("model_path", ("native", "expression", "router", "classifier"))
def test_production_missing_judge_fails_run_before_provider_or_action(
    monkeypatch, scope, guardrail_type, fail_behavior, model_path
):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "test-key")
    CountingModel.calls = 0
    monkeypatch.setattr("app.services.compiler.build_adk_model", lambda pm: CountingModel(model="local-counting"))
    direct_calls = []

    def direct_text(*args, **kwargs):
        direct_calls.append(True)
        return "Reviewed response"

    def direct_decision(*args, **kwargs):
        from app.services.routing_models import RouterDecision

        direct_calls.append(True)
        return RouterDecision(route="proceed", reasoning="Classified")

    monkeypatch.setattr("app.services.compiler.generate_text", direct_text)
    monkeypatch.setattr("app.services.compiler.generate_structured", direct_decision)
    action_calls = []

    async def forbidden_action(*args, **kwargs):
        action_calls.append(True)
        raise AssertionError("Action must not execute after a failed safety check")

    monkeypatch.setattr("app.services.node_handlers.safe_http_request", forbidden_action)
    rules = {"guardrail_type": guardrail_type, "fail_behavior": fail_behavior}
    guard = {"id": "guard", "data": {"nodeType": "guardrail", "label": "Safety judge", "rules": rules}}
    agent = {"id": "agent", "data": {"nodeType": "agent", "label": "Agent", "instruction": "Respond to the user"}}
    if model_path == "expression":
        agent["data"]["instruction"] = "Respond to {{input.text}}"
    elif model_path in {"router", "classifier"}:
        agent["data"].update({"nodeType": model_path, "routes": ["proceed"], "categories": ["proceed"]})
    action = {"id": "action", "data": {"nodeType": "tool", "toolType": "http", "httpMethod": "POST", "httpUrl": "https://example.com/action"}}
    trigger = {"id": "trigger", "data": {"nodeType": "trigger", "triggerType": "manual"}}
    end = {"id": "end", "data": {"nodeType": "end"}}
    nodes = [trigger, agent, action, end]
    edges = [
        {"id": "agent-action", "source": "agent", "target": "action"},
        {"id": "action-end", "source": "action", "target": "end"},
    ]
    if model_path in {"router", "classifier"}:
        edges[0]["data"] = {"route": "proceed"}
    if scope == "node":
        nodes.insert(1, guard)
        edges.append({"id": "trigger-guard", "source": "trigger", "target": "guard"})
        if fail_behavior == "route":
            edges.extend([
                {"id": "guard-pass", "source": "guard", "target": "agent", "data": {"route": "pass"}},
                {"id": "guard-failed", "source": "guard", "target": "action", "data": {"route": "failed"}},
            ])
        else:
            edges.append({"id": "guard-agent", "source": "guard", "target": "agent"})
            edges.append({"id": "guard-error", "source": "guard", "target": "action", "data": {"route": "error"}})
    else:
        edges.append({"id": "trigger-agent", "source": "trigger", "target": "agent"})

    db = SessionLocal()
    try:
        if scope != "node":
            policy = models.GuardrailPolicy(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Required safety judge", rules_json=rules)
            db.add(policy)
            trigger["data"]["workflowGuardrailPolicyId"] = str(policy.id)
            trigger["data"]["workflowGuardrailMode"] = "output" if scope == "workflow_output" else "input"
        workflow = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Production safety boundary")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={"nodes": nodes, "edges": edges})
        db.add(version)
        db.flush()
        run = models.WorkflowRun(id=uuid4(), workflow_version_id=version.id, status="pending", input_text="Review me before any action")
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    asyncio.run(executor.execute_run(run_id))

    db = SessionLocal()
    try:
        finished = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).one()
        assert finished.status == "failed"
        assert finished.completed_at is not None
        assert finished.metrics_json["guardrail_blocked"] is True
        guardrail_events = finished.metrics_json["guardrail_events"]
        assert all(event["status"] == "failed" for event in guardrail_events)
        assert {event["node_id"] for event in guardrail_events} == {"guard" if scope == "node" else "workflow-policy"}
        executed = {result.node_id for result in finished.node_results}
        assert "action" not in executed
        assert "end" not in executed
        expected_calls = 1 if scope == "workflow_output" else 0
        assert CountingModel.calls == (expected_calls if model_path == "native" else 0)
        assert len(direct_calls) == (expected_calls if model_path != "native" else 0)
        assert action_calls == []
    finally:
        db.close()


@pytest.mark.parametrize("policy_state", ("missing", "empty", "invalid"))
def test_configured_unavailable_policy_fails_before_actions(monkeypatch, policy_state):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "test-key")
    policy_id = uuid4()
    calls = []

    async def forbidden_action(*args, **kwargs):
        calls.append(True)
        raise AssertionError("Unresolved policy must stop execution")

    monkeypatch.setattr("app.services.node_handlers.safe_http_request", forbidden_action)
    graph = {
        "nodes": [
            {"id": "trigger", "data": {"nodeType": "trigger", "workflowGuardrailPolicyId": "invalid" if policy_state == "invalid" else str(policy_id)}},
            {"id": "action", "data": {"nodeType": "tool", "toolType": "http", "httpMethod": "POST", "httpUrl": "https://example.com/action"}},
            {"id": "end", "data": {"nodeType": "end"}},
        ],
        "edges": [{"source": "trigger", "target": "action"}, {"source": "action", "target": "end"}],
    }
    db = SessionLocal()
    try:
        if policy_state == "empty":
            db.add(models.GuardrailPolicy(id=policy_id, user_id=DEFAULT_DEV_USER_ID, name="Empty policy", rules_json={}))
        workflow = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Required policy")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json=graph)
        db.add(version)
        db.flush()
        run = models.WorkflowRun(id=uuid4(), workflow_version_id=version.id, status="pending", input_text="Review me")
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    asyncio.run(executor.execute_run(run_id))

    db = SessionLocal()
    try:
        finished = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).one()
        assert finished.status == "failed"
        assert finished.metrics_json["guardrail_blocked"] is True
        assert finished.metrics_json["guardrail_events"][0]["status"] == "failed"
        assert finished.node_results == []
        assert calls == []
    finally:
        db.close()
