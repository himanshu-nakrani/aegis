"""Action-layer (tool_call scope) guardrail policies.

A policy's ``rules_json.scope`` selects the layer: ``model_io`` (default),
``tool_call``, or ``both``. ``tool_rule`` adds per-run frequency caps
(``max_calls`` / ``max_calls_per_tool``). Enforcement lives inside
``TracePlugin.before_tool_callback`` via ``GuardrailPolicyPlugin.tool_guard``:
a rejected call returns a synthetic tool response (the tool never runs) and is
recorded as a ``blocked`` trace span plus a policy guardrail event.
"""

import asyncio
from types import SimpleNamespace

from app.services.guardrail_policy_plugin import GuardrailPolicyPlugin
from app.services.trace_plugin import TracePlugin


def _plugin(rules):
    return GuardrailPolicyPlugin(rules, policy_name="Tool policy")


def _ctx(call_id="c1", agent="agent_a"):
    return SimpleNamespace(
        agent_name=agent, invocation_id="inv-1", function_call_id=call_id
    )


def _tool(name="tool_calc"):
    return SimpleNamespace(name=name)


# ---------- ToolCallGuard decision logic ------------------------------------


def test_tool_scope_blocks_args_with_pii():
    policy = _plugin({"scope": "tool_call", "detect_pii": True})
    msg = policy.tool_guard.check(
        "tool_calc", "agent_a", {"input": "reach me at a@b.com"}
    )
    assert msg and "PII detected (email)" in msg
    assert policy.blocked is True
    event = policy.events[-1]
    assert event["status"] == "failed"
    assert event["mode"] == "tool_call"
    assert event["tool"] == "tool_calc"
    assert event["agent"] == "agent_a"


def test_tool_scope_passes_clean_args():
    policy = _plugin({"scope": "tool_call", "detect_pii": True})
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "2+3"}) is None
    assert policy.events == []


def test_model_io_scope_never_checks_tools():
    policy = _plugin({"guardrail_type": "rules", "detect_pii": True})
    assert policy.tool_guard.covers_tools() is False
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "a@b.com"}) is None


def test_tool_call_scope_skips_text_hooks():
    policy = _plugin({
        "scope": "tool_call",
        "blocked_keywords": ["forbidden"],
    })
    out = asyncio.run(policy.before_model_callback(
        callback_context=None,
        llm_request=SimpleNamespace(
            contents=[SimpleNamespace(parts=[SimpleNamespace(text="forbidden text")])],
            config=None,
        ),
    ))
    assert out is None
    assert policy.enforce_direct("forbidden text", "input") == "forbidden text"


def test_both_scope_guards_text_and_tools():
    rules = {"scope": "both", "detect_pii": True}
    policy = _plugin(rules)
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "a@b.com"})
    out = asyncio.run(policy.after_model_callback(
        callback_context=None,
        llm_response=SimpleNamespace(
            content=SimpleNamespace(parts=[SimpleNamespace(text="reply to a@b.com")])
        ),
    ))
    assert out is not None
    modes = {event["mode"] for event in policy.events}
    assert modes == {"tool_call", "output"}


def test_frequency_cap_blocks_n_plus_1():
    policy = _plugin({
        "scope": "tool_call",
        "tool_rule": {"max_calls_per_tool": {"tool_calc": 2}},
    })
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "1"}) is None
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "2"}) is None
    msg = policy.tool_guard.check("tool_calc", "agent_a", {"input": "3"})
    assert msg and "call cap (2)" in msg
    # Other tools are unaffected by the per-tool cap.
    assert policy.tool_guard.check("other_tool", "agent_a", {}) is None


def test_total_frequency_cap_counts_every_tool():
    policy = _plugin({
        "scope": "tool_call",
        "tool_rule": {"max_calls": 1},
    })
    assert policy.tool_guard.check("a", "agent_a", {}) is None
    msg = policy.tool_guard.check("b", "agent_a", {})
    assert msg and "per-run cap (1)" in msg


def test_tool_rule_validator_keys_override_policy_rules():
    # Frequency-only cap on a model_io policy: args are not re-validated.
    policy = _plugin({
        "detect_pii": True,
        "tool_rule": {"max_calls": 10},
    })
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "a@b.com"}) is None
    # But a validator key inside tool_rule opts the args check in.
    strict = _plugin({
        "tool_rule": {"max_calls": 10, "detect_pii": True},
    })
    assert strict.tool_guard.check("tool_calc", "agent_a", {"input": "a@b.com"})


def test_warn_fail_behavior_records_and_allows():
    policy = _plugin({
        "scope": "tool_call",
        "detect_pii": True,
        "fail_behavior": "warn",
    })
    assert policy.tool_guard.check("tool_calc", "agent_a", {"input": "a@b.com"}) is None
    assert policy.events[-1]["status"] == "warned"
    assert policy.blocked is False


def test_frequency_cap_ignores_warn_behavior():
    policy = _plugin({
        "scope": "tool_call",
        "tool_rule": {"max_calls": 0},  # unparseable/non-positive → no cap
    })
    assert policy.tool_guard.check("tool_calc", "agent_a", {}) is None


# ---------- TracePlugin integration -----------------------------------------


def test_blocked_call_returns_synthetic_result_and_blocked_span():
    policy = _plugin({"scope": "tool_call", "detect_pii": True})
    trace = TracePlugin(tool_guard=policy.tool_guard)
    ctx = _ctx()
    blocked_result = asyncio.run(trace.before_tool_callback(
        tool=_tool(), tool_args={"input": "a@b.com"}, tool_context=ctx
    ))
    assert blocked_result == {
        "error": "Blocked by workflow guardrail policy: PII detected (email)",
        "guardrail_blocked": True,
    }
    # ADK feeds the synthetic result through after_tool_callback; the span is
    # recorded as blocked, not completed.
    asyncio.run(trace.after_tool_callback(
        tool=_tool(), tool_args={"input": "a@b.com"}, tool_context=ctx,
        result=blocked_result,
    ))
    assert trace._pending == {}
    call = trace.tool_calls[-1]
    assert call["status"] == "blocked"
    assert call["error"] == "Blocked by workflow guardrail policy: PII detected (email)"
    assert call["name"] == "tool_calc"


def test_clean_call_flows_through_normally():
    policy = _plugin({"scope": "tool_call", "detect_pii": True})
    trace = TracePlugin(tool_guard=policy.tool_guard)
    ctx = _ctx()
    assert asyncio.run(trace.before_tool_callback(
        tool=_tool(), tool_args={"input": "2+3"}, tool_context=ctx
    )) is None
    asyncio.run(trace.after_tool_callback(
        tool=_tool(), tool_args={"input": "2+3"}, tool_context=ctx,
        result={"result": "5.0"},
    ))
    call = trace.tool_calls[-1]
    assert call["status"] == "completed"
    assert call["result"] == '{"result": "5.0"}'


def test_no_guard_preserves_existing_behavior():
    trace = TracePlugin()
    ctx = _ctx()
    assert asyncio.run(trace.before_tool_callback(
        tool=_tool(), tool_args={"input": "a@b.com"}, tool_context=ctx
    )) is None
    trace.finish_pending()
    assert trace.tool_calls[-1]["status"] == "cancelled"


def test_frequency_cap_across_two_calls_on_same_tool():
    policy = _plugin({
        "scope": "tool_call",
        "tool_rule": {"max_calls_per_tool": {"tool_calc": 1}},
    })
    trace = TracePlugin(tool_guard=policy.tool_guard)
    first = asyncio.run(trace.before_tool_callback(
        tool=_tool(), tool_args={"input": "1"}, tool_context=_ctx(call_id="c1")
    ))
    assert first is None
    blocked = asyncio.run(trace.before_tool_callback(
        tool=_tool(), tool_args={"input": "2"}, tool_context=_ctx(call_id="c2")
    ))
    assert blocked is not None
    asyncio.run(trace.after_tool_callback(
        tool=_tool(), tool_args={"input": "1"}, tool_context=_ctx(call_id="c1"),
        result={"result": "5.0"},
    ))
    asyncio.run(trace.after_tool_callback(
        tool=_tool(), tool_args={"input": "2"}, tool_context=_ctx(call_id="c2"),
        result=blocked,
    ))
    assert [c["status"] for c in trace.tool_calls] == ["completed", "blocked"]
    # Event count: exactly one failed decision.
    assert [e["status"] for e in policy.events] == ["failed"]
