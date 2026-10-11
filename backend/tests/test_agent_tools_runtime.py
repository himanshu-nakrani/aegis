"""Consumer behavior under actual ADK Runner, sessions, and FunctionTools."""
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import Field

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.compiler import compile_workflow
from app.services.guardrail import GuardrailJudgeUnavailableError
from app.services.guardrail_policy_plugin import GuardrailPolicyPlugin
from app.services.trace_plugin import TracePlugin
from app.services.workflow_context import WorkflowContext


def response(*parts, prompt=3, completion=2, thinking=1, total=None):
    return LlmResponse(content=types.Content(role="model", parts=list(parts)),
        usage_metadata=types.GenerateContentResponseUsageMetadata(prompt_token_count=prompt,
            candidates_token_count=completion, thoughts_token_count=thinking,
            total_token_count=total if total is not None else prompt + completion + thinking))


def call(name="tool_calc", value="2+3", call_id=None):
    return types.Part(function_call=types.FunctionCall(name=name, args={"input": value}, id=call_id))


class ScriptedModel(BaseLlm):
    replies: list[Any]
    requests: list[Any] = Field(default_factory=list)

    async def generate_content_async(self, llm_request, stream=False):
        index = len(self.requests)
        self.requests.append(SimpleNamespace(
            contents=[content.model_copy(deep=True) for content in llm_request.contents],
            config=llm_request.config.model_copy(deep=True),
        ))
        reply = self.replies[min(index, len(self.replies) - 1)]
        if isinstance(reply, Exception):
            raise reply
        yield reply


def graph(*, instruction="Use tools", tool_type="calculator", require_approval=False, **agent_data):
    return {"nodes": [
        {"id": "trigger", "data": {"nodeType": "trigger"}},
        {"id": "agent", "data": {"nodeType": "agent", "instruction": instruction,
            "tools": [{"kind": "node", "nodeId": "calc", "requireApproval": require_approval}], **agent_data}},
        {"id": "calc", "data": {"nodeType": "tool", "toolType": tool_type,
            "httpMethod": "POST", "httpUrl": "https://example.com/{{last_output}}", "httpBody": "{{input.text}}"}},
        {"id": "ok", "data": {"nodeType": "transform", "template": "SUCCESS {{last_output}}"}},
        {"id": "error", "data": {"nodeType": "transform", "template": "FAILURE {{last_output}}"}},
        {"id": "end", "data": {"nodeType": "end"}},
    ], "edges": [
        {"source": "trigger", "target": "agent"}, {"source": "agent", "target": "ok"},
        {"source": "agent", "target": "error", "data": {"route": "error"}},
        {"source": "ok", "target": "end"}, {"source": "error", "target": "end"},
    ]}


async def execute(graph_json, monkeypatch, model, context=None, extra_plugins=(), tool_guard=None):
    monkeypatch.setattr("app.services.compiler.build_adk_model", lambda pm: model)
    context = context if context is not None else WorkflowContext.from_input("Original request").to_dict()
    workflow, metadata, _lookup = compile_workflow(graph_json, context_ref=context)
    trace = TracePlugin(tool_guard=tool_guard)
    runner = Runner(app_name="tool_runtime_regression", node=workflow, auto_create_session=True,
        session_service=InMemorySessionService(), plugins=[trace, *extra_plugins])
    try:
        events = [event async for event in runner.run_async(user_id="local", session_id=str(uuid4()),
            new_message=types.Content(parts=[types.Part(text="Original request")]))]
    finally:
        await runner.close()
    return context, trace, events, metadata


@pytest.mark.parametrize("instruction", ("Use tools", "Use tools for {{input.text}}"))
def test_native_and_expression_agents_call_same_tool_twice_in_parallel(monkeypatch, instruction):
    model = ScriptedModel(model="local", replies=[response(call(value="2+3"), call(value="4*5")), response(types.Part(text="Combined 5.0 and 20.0"))])
    context, trace, _events, metadata = asyncio.run(execute(graph(instruction=instruction), monkeypatch, model))
    assert context["steps"]["agent"]["output"] == "Combined 5.0 and 20.0"
    assert "ok" in context["steps"] and "error" not in context["steps"]
    assert "calc" not in context["steps"]
    assert metadata["calc"]["is_tool_declaration"] is True
    calls = trace.tool_calls
    assert {(json.loads(row["args"])["input"], row["result"]) for row in calls} == {("2+3", "5.0"), ("4*5", "20.0")}
    assert len({row["call_id"] for row in calls}) == 2
    responses = [part.function_response.response for content in model.requests[1].contents for part in content.parts if part.function_response]
    assert {item["result"] for item in responses} == {"5.0", "20.0"}
    if "{{" in instruction:
        assert "Original request" in str(model.requests[0].config.system_instruction)


@pytest.mark.parametrize("bound", ("iterations", "tokens", "total_only", "missing_usage"))
def test_bounds_fail_node_and_select_only_error_branch(monkeypatch, bound):
    data = {"maxToolIterations": 1} if bound == "iterations" else {"tokenBudget": 9}
    first = response(call(), total=10) if bound == "total_only" else response(call())
    if bound == "missing_usage":
        first = LlmResponse(content=types.Content(role="model", parts=[call()]))
    model = ScriptedModel(model="local", replies=[first, response(call(value="8+1")), response(types.Part(text="Must not reach"))])
    context, trace, _events, _meta = asyncio.run(execute(graph(**data), monkeypatch, model))
    assert "agent" in context["_error_routed"]
    assert "error" in context["steps"] and "ok" not in context["steps"]
    assert len(trace.tool_calls) == (1 if bound in {"iterations", "tokens"} else 0)


def approval_run():
    with SessionLocal() as db:
        workflow = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Approval tool regression")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={})
        db.add(version)
        db.flush()
        run = models.WorkflowRun(id=uuid4(), workflow_version_id=version.id, status="running", input_text="Review action")
        db.add(run)
        db.commit()
        return str(run.id)


@pytest.mark.parametrize("decision", ("accept", "reject", "timeout"))
def test_approval_precedes_http_side_effect_and_pauses_node_timeout(monkeypatch, decision):
    from app.services.approval_service import submit_approval

    run_id = approval_run()
    context = WorkflowContext.from_input("Original request").to_dict()
    context["_run_id"] = run_id
    invocations = []
    monkeypatch.setattr(settings, "approval_timeout_seconds", 0.03 if decision == "timeout" else 1)
    monkeypatch.setattr("app.services.node_handlers.validate_http_url", lambda url: None)

    async def request(client, method, url, **kwargs):
        invocations.append((url, kwargs["content"]))
        class Result:
            status_code = 200
            text = "sent"
        return Result()

    monkeypatch.setattr("app.services.node_handlers.safe_http_request", request)

    async def emit(event):
        if event["type"] == "approval_required":
            assert invocations == []
            review = json.loads(event["review"])
            assert review["arguments"] == {"input": "message"}
            if decision != "timeout":
                # Deliberate wait exceeds node timeout, but not active work.
                await asyncio.sleep(0.07)
                submit_approval(run_id, approved=decision == "accept", node_id=event["node_id"])
    context["_emit"] = emit
    model = ScriptedModel(model="local", replies=[response(call(value="message")), response(types.Part(text="Action reviewed"))])
    result, trace, _events, _meta = asyncio.run(execute(graph(tool_type="http", require_approval=True, timeoutSec=0.05, retries=3), monkeypatch, model, context))
    if decision == "accept":
        assert invocations == [("https://example.com/message", b"message")]
        assert "ok" in result["steps"]
    else:
        assert invocations == []
        assert "error" in result["steps"]
    assert len(model.requests) == (2 if decision == "accept" else 1)
    assert len(trace.tool_calls) == 1
    with SessionLocal() as db:
        rows = db.query(models.ApprovalRequest).filter(models.ApprovalRequest.run_id == UUID(run_id)).all()
        assert [row.status for row in rows] == [{"accept": "approved", "reject": "denied", "timeout": "timed_out"}[decision]]


def test_failure_after_side_effect_never_retries_whole_agent(monkeypatch):
    calls = []
    monkeypatch.setattr("app.services.node_handlers.validate_http_url", lambda url: None)
    async def request(*args, **kwargs):
        calls.append(kwargs["content"])
        class Result:
            status_code = 200
            text = "sent"
        return Result()
    monkeypatch.setattr("app.services.node_handlers.safe_http_request", request)
    model = ScriptedModel(model="local", replies=[response(call(value="message")), ValueError("Provider disconnected after action")])
    context, _trace, _events, _meta = asyncio.run(execute(graph(tool_type="http", retries=3, retryDelaySec=0), monkeypatch, model))
    assert calls == [b"message"]
    assert len(model.requests) == 2
    assert "error" in context["steps"] and "ok" not in context["steps"]


def test_missing_workflow_judge_never_routes_to_error_action(monkeypatch):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "test-key")
    model = ScriptedModel(model="local", replies=[response(call())])
    policy = GuardrailPolicyPlugin({"guardrail_type": "moderation", "fail_behavior": "warn"}, mode="input")
    context = WorkflowContext.from_input("Unreviewed request").to_dict()
    context["_guardrail_policy_plugin"] = policy
    with pytest.raises(Exception) as raised:
        asyncio.run(execute(graph(retries=2, retryDelaySec=0), monkeypatch, model, context, (policy,)))
    cause = raised.value
    while cause is not None and not isinstance(cause, GuardrailJudgeUnavailableError):
        cause = cause.__cause__ or cause.__context__
    assert isinstance(cause, GuardrailJudgeUnavailableError)
    assert model.requests == []
    assert "error" not in context["steps"] and "ok" not in context["steps"]


def test_mcp_schema_and_call_results_flow_through_actual_adk_loop(monkeypatch):
    """Only MCP transport is isolated; ADK declarations, calls, loop are real."""
    descriptor = {"name": "add", "description": "Add integers", "input_schema": {"type": "object", "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}}, "required": ["a", "b"]}}
    remote_calls = []
    closed = []
    class Session:
        async def list_tools(self):
            return [descriptor]
        async def call_tool(self, name, arguments):
            remote_calls.append((name, arguments))
            return {"content": [{"type": "text", "text": "7"}], "structuredContent": {"sum": arguments["a"] + arguments["b"]}, "isError": False}
    @asynccontextmanager
    async def open_session(config):
        try:
            yield Session()
        finally:
            closed.append(True)
    monkeypatch.setattr("app.services.credentials.load_mcp_credential", lambda *args: ({"transport": "stdio"}, [descriptor]))
    monkeypatch.setattr("app.services.credentials.store_mcp_tool_cache", lambda *args: None)
    monkeypatch.setattr("app.services.mcp_client.open_mcp_session", open_session)
    g = graph()
    g["nodes"][1]["data"]["tools"].append({"kind": "mcp", "credentialId": str(uuid4()), "toolName": "add"})
    context = WorkflowContext.from_input("Calculate").to_dict()
    context["_user_id"] = str(DEFAULT_DEV_USER_ID)
    model = ScriptedModel(model="local", replies=[response(call(), types.Part(function_call=types.FunctionCall(name="mcp_1_add", args={"a": 3, "b": 4}))), response(types.Part(text="5 and 7"))])
    result, trace, _events, _meta = asyncio.run(execute(g, monkeypatch, model, context))
    assert result["steps"]["agent"]["output"] == "5 and 7"
    assert remote_calls == [("add", {"a": 3, "b": 4})]
    assert closed == [True]
    responses = [part.function_response.response for content in model.requests[1].contents for part in content.parts if part.function_response]
    assert any(item.get("structuredContent") == {"sum": 7} for item in responses)
    assert {item["name"] for item in trace.tool_calls} == {"tool_calc", "mcp_1_add"}


def test_parallel_agents_review_one_pending_call_at_a_time(monkeypatch):
    from app.services.approval_service import submit_approval
    from app.services.agent_tools import ToolAgentNode
    from google.adk import Agent

    run_id = approval_run()
    shared = WorkflowContext.from_input("Original request").to_dict()
    shared["_run_id"] = run_id
    calls = []
    reviews = []
    monkeypatch.setattr("app.services.node_handlers.validate_http_url", lambda url: None)
    monkeypatch.setattr(settings, "approval_timeout_seconds", 2)

    async def request(client, method, url, **kwargs):
        calls.append(kwargs["content"].decode())
        class Result:
            status_code = 200
            text = "sent"
        return Result()
    monkeypatch.setattr("app.services.node_handlers.safe_http_request", request)

    async def mark(run_id, key, review, metadata):
        assert shared.get("pending") is None
        shared["pending"] = metadata["approval_id"]

    async def resume(run_id, key):
        shared["pending"] = None

    async def emit(event):
        if event["type"] != "approval_required":
            return
        value = json.loads(event["review"])["arguments"]["input"]
        assert value not in calls
        assert event["approval_id"] == shared["pending"]
        with SessionLocal() as db:
            assert db.query(models.ApprovalRequest).filter_by(run_id=UUID(run_id), status="parked").count() == 1
        reviews.append((event["node_id"], event["approval_id"], value))
        await asyncio.sleep(0.07)
        submit_approval(run_id, approved=True, node_id=event["node_id"])

    shared["_emit"] = emit
    shared["_mark_awaiting_approval"] = mark
    shared["_resume_after_tool_approval"] = resume

    async def run_parallel():
        runners = []
        async def one(index):
            node = graph(tool_type="http", require_approval=True, timeoutSec=0.05)["nodes"][1]
            node["id"] = f"agent_{index}"
            model = ScriptedModel(model="local", replies=[response(call(value=f"message_{index}")), response(types.Part(text="Sent"))])
            child = Agent(name=node["id"], model=model, output_schema=None, mode="single_turn")
            built = ToolAgentNode(name=node["id"], agent=child, node_id=node["id"], context_ref=shared,
                data=node["data"], builtin_nodes={"calc": graph(tool_type="http")["nodes"][2]})
            runner = Runner(app_name="parallel_approval", node=built, auto_create_session=True,
                session_service=InMemorySessionService())
            runners.append(runner)
            async for _event in runner.run_async(user_id="local", session_id=str(uuid4()),
                new_message=types.Content(parts=[types.Part(text="Original request")])):
                pass
        try:
            await asyncio.gather(one(1), one(2))
        finally:
            for runner in runners:
                await runner.close()
    asyncio.run(run_parallel())
    assert set(calls) == {"message_1", "message_2"}
    assert len({key for key, _id, _value in reviews}) == 2
    assert len({approval_id for _key, approval_id, _value in reviews}) == 2
    assert shared["pending"] is None


@pytest.mark.parametrize("token_budget", (100, 17))
def test_google_search_bridge_uses_native_grounding_and_shared_budget(monkeypatch, token_budget):
    from google.adk.agents.llm_agent import LLMRegistry
    from app.services.token_tracker import TokenTrackerPlugin

    class GroundedModel(BaseLlm):
        requests: list[Any] = Field(default_factory=list)

        async def generate_content_async(self, llm_request, stream=False):
            assert any(tool.google_search is not None for tool in llm_request.config.tools)
            self.requests.append([content.model_copy(deep=True) for content in llm_request.contents])
            yield response(types.Part(text="Grounded result"), prompt=8, completion=4, thinking=0)

    grounded = GroundedModel(model="gemini-2.5-flash")
    monkeypatch.setattr(LLMRegistry, "new_llm", lambda name: grounded)
    g = graph(tool_type="search", tokenBudget=token_budget)
    g["nodes"][2]["data"]["searchProvider"] = "google"
    parent = ScriptedModel(model="local-parent", replies=[response(call(value="query")), response(types.Part(text="Grounded answer"))])
    tracker = TokenTrackerPlugin()
    context, trace, _events, metadata = asyncio.run(execute(g, monkeypatch, parent, extra_plugins=(tracker,)))
    assert grounded.requests[0][0].parts[0].text == "query"
    assert set(tracker.usage_by_agent) == {"agent_agent", "agent_agent__tool_calc"}
    assert metadata["agent"]["tool_agent_aliases"] == {"agent_agent__tool_calc": ("google", settings.gemini_model)}
    if token_budget == 100:
        assert context["steps"]["agent"]["output"] == "Grounded answer"
        assert len(parent.requests) == 2
        responses = [part.function_response.response for content in parent.requests[1].contents for part in content.parts if part.function_response]
        assert responses == [{"result": "Grounded result"}]
        assert trace.tool_calls[0]["status"] == "completed"
    else:
        assert "error" in context["steps"] and "ok" not in context["steps"]
        assert len(parent.requests) == 1
        assert trace.tool_calls[0]["status"] == "failed"


def test_tool_call_scope_policy_blocks_args_inside_runner(monkeypatch):
    """A tool_call-scoped policy rejects the call before the tool runs; ADK
    feeds the synthetic block response back to the model as the tool result."""
    policy = GuardrailPolicyPlugin(
        {"scope": "tool_call", "detect_pii": True}, policy_name="Tool firewall"
    )
    model = ScriptedModel(model="local", replies=[
        response(call(value="a@b.com")),
        response(types.Part(text="Understood, call refused")),
    ])
    context, trace, _events, _meta = asyncio.run(
        execute(graph(), monkeypatch, model, tool_guard=policy.tool_guard)
    )
    assert len(trace.tool_calls) == 1
    assert trace.tool_calls[0]["status"] == "blocked"
    # The blocked result reaches the next model turn as the function response.
    responses = [part.function_response.response
        for content in model.requests[1].contents for part in content.parts
        if part.function_response]
    assert responses == [{
        "error": "Blocked by workflow guardrail policy: PII detected (email)",
        "guardrail_blocked": True,
    }]
    assert context["steps"]["agent"]["output"] == "Understood, call refused"
    assert policy.blocked is True
    assert policy.events[0]["mode"] == "tool_call"


def test_tool_call_frequency_cap_blocks_second_call_inside_runner(monkeypatch):
    policy = GuardrailPolicyPlugin(
        {"scope": "tool_call", "tool_rule": {"max_calls": 1}},
        policy_name="Tool firewall",
    )
    model = ScriptedModel(model="local", replies=[
        response(call(value="2+3"), call(value="4*5", call_id="second")),
        response(types.Part(text="Partial answer")),
    ])
    context, trace, _events, _meta = asyncio.run(
        execute(graph(), monkeypatch, model, tool_guard=policy.tool_guard)
    )
    statuses = sorted(call["status"] for call in trace.tool_calls)
    assert statuses == ["blocked", "completed"]
    blocked = [call for call in trace.tool_calls if call["status"] == "blocked"][0]
    assert "per-run cap (1)" in (blocked["error"] or "")
