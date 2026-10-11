"""Native ADK tool agents, owner-bound MCP sessions, and per-node budgets."""
from __future__ import annotations

import asyncio
import inspect
import json
import re
import uuid
from contextlib import AsyncExitStack, aclosing
from dataclasses import dataclass, field
from typing import Any, Callable

from google.adk import Agent
from google.adk.events import Event
from google.adk.tools import FunctionTool
from google.adk.tools.agent_tool import AgentTool
from google.adk.workflow._base_node import BaseNode
from google.genai import types

from app.config import settings
from app.services.agent_tool_schema import DEFAULT_MAX_TOOL_ITERATIONS, DEFAULT_TOKEN_BUDGET
from app.services.approval_service import HumanApprovalDenied, HumanApprovalTimeout, park_approval, wait_for_approval
from app.services.context_wrapper import ERROR_ROUTE, SUCCESS_ROUTE
from app.services.expressions import render_template
from app.services.guardrail import GuardrailJudgeUnavailableError


class AgentBudgetExceeded(RuntimeError):
    pass


def tool_name(value: str, prefix: str) -> str:
    """Stable provider-safe aliases; credential references never enter prompts."""
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", value)
    return f"{prefix}_{safe}"


@dataclass
class AgentToolState:
    node_id: str
    context: dict[str, Any]
    max_iterations: int
    token_budget: int
    iterations: int = 0
    tokens: int = 0
    tool_started: bool = False
    deadline: asyncio.Timeout | None = None
    tasks: set[asyncio.Task] = field(default_factory=set)
    approval_waiters: int = 0
    remaining_timeout: float | None = None

    async def before_model(self, callback_context, llm_request):
        if self.tokens >= self.token_budget:
            raise AgentBudgetExceeded(f"Agent token budget exhausted ({self.token_budget})")
        # Bound completion generation to the remaining budget; prompt usage is
        # charged from actual provider metadata, not a guessed tokenizer.
        remaining = self.token_budget - self.tokens
        config = llm_request.config
        if config is not None:
            current = config.max_output_tokens
            config.max_output_tokens = min(current, remaining) if current else remaining

    async def after_model(self, callback_context, llm_response):
        if getattr(llm_response, "partial", False):
            return None
        usage = getattr(llm_response, "usage_metadata", None)
        if usage is None or all(getattr(usage, key, None) is None for key in (
            "prompt_token_count", "candidates_token_count", "thoughts_token_count", "total_token_count",
        )):
            raise AgentBudgetExceeded("Agent token usage unavailable; cannot enforce token budget")
        component_tokens = sum(int(getattr(usage, key, 0) or 0) for key in (
            "prompt_token_count", "candidates_token_count", "thoughts_token_count",
        ))
        self.tokens += max(component_tokens, int(getattr(usage, "total_token_count", 0) or 0))
        if self.tokens > self.token_budget:
            raise AgentBudgetExceeded(f"Agent token budget exceeded ({self.tokens}/{self.token_budget})")
        parts = getattr(getattr(llm_response, "content", None), "parts", None) or []
        if any(part.function_call is not None for part in parts):
            self.iterations += 1
            if self.iterations > self.max_iterations:
                raise AgentBudgetExceeded(f"Agent tool iteration limit exceeded ({self.max_iterations})")
        return None

    async def approve(self, name: str, arguments: dict[str, Any]) -> None:
        # One review at a time for the whole run, including human gates and
        # parallel agents. Queuing is not active node work.
        loop = asyncio.get_running_loop()
        self.approval_waiters += 1
        if self.approval_waiters == 1 and self.deadline is not None and self.deadline.when() is not None:
            self.remaining_timeout = max(0, self.deadline.when() - loop.time())
            self.deadline.reschedule(None)
        lock = self.context.setdefault("_approval_lock", asyncio.Lock())
        try:
            async with lock:
                run_id = str(self.context.get("_run_id") or "")
                if not run_id:
                    raise HumanApprovalDenied(self.node_id, "Tool approval requires an active workflow run")
                key = f"{self.node_id}:tool:{uuid.uuid4().hex}"
                review = json.dumps({"agent_node_id": self.node_id, "tool": name, "arguments": arguments}, ensure_ascii=False)
                emit = self.context.get("_emit")
                mark = self.context.get("_mark_awaiting_approval")
                resume = self.context.get("_resume_after_tool_approval")
                try:
                    metadata = await park_approval(run_id, key, review)
                    metadata["agent_node_id"] = self.node_id
                    metadata["tool_name"] = name
                    if callable(mark):
                        await mark(run_id, key, review, metadata)
                    if callable(emit):
                        await emit({"type": "approval_required", "run_id": run_id, "node_id": key, "review": review, **metadata})
                    decision = await wait_for_approval(run_id, node_id=key, emit=emit)
                    if not decision.get("approved"):
                        raise HumanApprovalDenied(self.node_id, str(decision.get("comment") or "Tool approval denied"))
                finally:
                    if callable(resume):
                        await resume(run_id, key)
        finally:
            self.approval_waiters -= 1
            if self.approval_waiters == 0 and self.remaining_timeout is not None:
                self.deadline.reschedule(loop.time() + self.remaining_timeout)
                self.remaining_timeout = None

    async def cancel_tools(self) -> None:
        tasks = tuple(self.tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


class AgentFunctionTool(FunctionTool):
    """FunctionTool with real JSON Schema (including arbitrary MCP arguments)."""

    def __init__(self, name: str, description: str, schema: dict, invoke: Callable, state: AgentToolState, require_approval: bool = False):
        super().__init__(invoke)
        self.name = name
        self.description = description
        self.schema = schema
        self.invoke = invoke
        self.state = state
        self.require_approval = require_approval

    def _get_declaration(self):
        return types.FunctionDeclaration(name=self.name, description=self.description, parameters_json_schema=self.schema)

    async def run_async(self, *, args, tool_context):
        from jsonschema import Draft202012Validator, ValidationError
        try:
            Draft202012Validator(self.schema).validate(args)
        except ValidationError:
            # ValidationError includes input values: keep failures secret-safe.
            raise ValueError(f"Invalid arguments for tool {self.name}") from None
        task = asyncio.current_task()
        self.state.tasks.add(task)
        try:
            if self.require_approval:
                await self.state.approve(self.name, args)
            self.state.tool_started = True
            return await self.invoke(args, tool_context)
        finally:
            self.state.tasks.discard(task)


async def _build_tools(refs: list[dict], builtin_nodes: dict[str, dict], state: AgentToolState, stack: AsyncExitStack, agent_name: str) -> list[FunctionTool]:
    from app.services.compiler import _google_search_generate_config
    from app.services.credentials import load_mcp_credential, store_mcp_tool_cache
    from app.services.mcp_client import open_mcp_session
    from google.adk.tools.google_search_tool import google_search

    tools = []
    sessions = {}
    for ref in refs:
        if ref["kind"] == "node":
            node = builtin_nodes[ref["nodeId"]]
            data = node.get("data") or {}
            name = tool_name(node["id"], "tool")
            schema = {"type": "object", "properties": {"input": {"type": "string"}}, "required": ["input"], "additionalProperties": False}
            if data.get("toolType") == "search" and data.get("searchProvider", "google") == "google":
                child = Agent(name=f"{agent_name}__{name}", model=settings.gemini_model,
                    instruction="Search the supplied query and return a concise factual summary with key findings.",
                    tools=[google_search], output_schema=None, mode="chat",
                    generate_content_config=_google_search_generate_config(),
                    before_model_callback=state.before_model, after_model_callback=state.after_model)
                bridge = AgentTool(child, include_plugins=True)

                async def invoke(args, tool_context, bridge=bridge):
                    if not isinstance(args.get("input"), str):
                        raise ValueError("Tool input must be a string")
                    return await bridge.run_async(args={"request": args["input"]}, tool_context=tool_context)
            else:
                async def invoke(args, tool_context, node=node):
                    value = args.get("input")
                    if not isinstance(value, str):
                        raise ValueError("Tool input must be a string")
                    # Templates see this call's argument without mutating the
                    # shared workflow context used by parallel tool calls.
                    local = {**state.context, "last_output": value,
                        "input": {**(state.context.get("input") or {}), "text": value}}
                    from app.services.compiler import _make_calculator_fn, _make_search_fn, _safe_adk_name
                    from app.services.node_handlers import _make_http_fn
                    data = node.get("data") or {}
                    if data.get("toolType", "calculator") == "calculator":
                        fn = _make_calculator_fn(node["id"])
                    elif data.get("toolType") == "http":
                        fn = _make_http_fn(node["id"], data.get("httpMethod", "GET"), data.get("httpUrl", ""),
                            data.get("httpHeaders") or {}, data.get("httpBody"), _safe_adk_name(node["id"], "http"), local)
                    else:
                        fn = _make_search_fn(node["id"], data.get("searchProvider", "google"))
                    if inspect.iscoroutinefunction(fn):
                        return await fn(value)
                    return fn(value)  # calculator is bounded, synchronous, side-effect free
            description = str(data.get("label") or data.get("toolType") or "Workflow tool") + ". Pass input to the configured tool; URL/body templates use this input."
        else:
            credential_id = ref["credentialId"]
            user_id = state.context.get("_user_id")
            if not user_id:
                raise ValueError("MCP tools require an owner-bound workflow credential")
            if credential_id not in sessions:
                config, _cached = await asyncio.to_thread(load_mcp_credential, uuid.UUID(str(user_id)), uuid.UUID(credential_id))
                from app.services.mcp_client import validate_mcp_schema
                for cached in _cached:
                    validate_mcp_schema(cached["input_schema"])
                    if cached.get("output_schema") is not None:
                        validate_mcp_schema(cached["output_schema"])
                if not _cached:
                    raise ValueError("MCP credential must be discovered before attaching tools")
                if ref["toolName"] not in {item["name"] for item in _cached}:
                    raise ValueError(f"MCP tool not discovered: {ref['toolName']}")
                session = await stack.enter_async_context(open_mcp_session(config))
                descriptors = await session.list_tools()
                await asyncio.to_thread(store_mcp_tool_cache, uuid.UUID(str(user_id)), uuid.UUID(credential_id), descriptors)
                sessions[credential_id] = session, {item["name"]: item for item in descriptors}
            session, descriptors = sessions[credential_id]
            descriptor = descriptors.get(ref["toolName"])
            if descriptor is None:
                raise ValueError(f"MCP tool unavailable: {ref['toolName']}")
            # Index prevents collisions between same-named tools on servers.
            name = tool_name(ref["toolName"], f"mcp_{len(tools)}")
            schema = descriptor["input_schema"]
            from app.services.mcp_client import validate_mcp_schema
            validate_mcp_schema(schema)
            description = descriptor.get("description") or ref["toolName"]

            async def invoke(args, tool_context, session=session, remote_name=ref["toolName"]):
                return await session.call_tool(remote_name, args)
        tools.append(AgentFunctionTool(name, description, schema, invoke, state, bool(ref.get("requireApproval"))))
    return tools


class ToolAgentNode(BaseNode):
    """Streams a native ADK Agent while enforcing canvas-node reliability.

    Budgets survive explicit retries; after any tool starts no automatic node
    retry is safe, because an external side effect may already have happened.
    """
    agent: Any
    node_id: str
    context_ref: Any
    data: dict
    builtin_nodes: dict
    error_branch: bool = False

    async def _run_impl(self, *, ctx, node_input):
        text = str(node_input)
        context = self.context_ref
        context["last_output"] = text
        state = AgentToolState(self.node_id, context, int(self.data.get("maxToolIterations", DEFAULT_MAX_TOOL_ITERATIONS)), int(self.data.get("tokenBudget", DEFAULT_TOKEN_BUDGET)))
        # Establish the node before discovery/model errors can occur.
        yield Event(author=self.name)
        self.agent.before_model_callback = state.before_model
        self.agent.after_model_callback = state.after_model
        instruction = self.data.get("instruction") or "You are a helpful AI assistant."

        async def render_instruction(callback_context):
            return render_template(instruction, context, text)

        self.agent.instruction = render_instruction
        retries = int(self.data.get("retries") or 0)
        attempt = 0
        while True:
            try:
                output = ""
                async with asyncio.timeout(float(self.data["timeoutSec"]) if self.data.get("timeoutSec") else None) as deadline:
                    state.deadline = deadline
                    async with AsyncExitStack() as stack:
                        self.agent.tools = await _build_tools(self.data["tools"], self.builtin_nodes, state, stack, self.name)
                        stack.push_async_callback(state.cancel_tools)
                        async with aclosing(self.agent.run(ctx=ctx, node_input=text)) as events:
                            async for event in events:
                                if event.output is not None:
                                    output = str(event.output)
                                # Native messages are kept in the ADK transcript;
                                # only the wrapper's final event completes this node.
                                event.output = None
                                event.node_info.message_as_output = False
                                yield event
                if self.error_branch:
                    ctx.route = SUCCESS_ROUTE
                break
            except GuardrailJudgeUnavailableError:
                raise
            except Exception as exc:
                cause: BaseException | None = exc
                visited = set()
                while cause is not None and id(cause) not in visited:
                    visited.add(id(cause))
                    if isinstance(cause, GuardrailJudgeUnavailableError):
                        raise cause
                    if isinstance(cause, (AgentBudgetExceeded, HumanApprovalDenied, HumanApprovalTimeout)):
                        exc = cause
                        break
                    cause = cause.__cause__ or cause.__context__
                if not state.tool_started and not isinstance(exc, (AgentBudgetExceeded, HumanApprovalDenied, HumanApprovalTimeout)) and attempt < retries:
                    attempt += 1
                    emit = context.get("_emit")
                    if callable(emit):
                        await emit({"type": "node_retry", "node_id": self.node_id, "attempt": attempt, "max_attempts": retries, "error": str(exc)[:200]})
                    await asyncio.sleep(float(self.data.get("retryDelaySec", 1)) * 2 ** (attempt - 1))
                    continue
                if not self.error_branch:
                    raise
                context.setdefault("_error_routed", {})[self.node_id] = {"error": str(exc), "node_type": "agent"}
                ctx.route = ERROR_ROUTE
                output = json.dumps({"error": str(exc), "node_id": self.node_id, "node_type": "agent"}, ensure_ascii=False)
                break
        context.setdefault("steps", {})[self.node_id] = {"output": output, "label": self.data.get("label") or self.node_id, "type": "agent"}
        context["last_output"] = output
        yield Event(author=self.name, output=output)
