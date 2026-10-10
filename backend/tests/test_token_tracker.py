from types import SimpleNamespace

import pytest

from app.services.token_tracker import TokenTrackerPlugin, estimate_cost_usd, resolve_model_rates


@pytest.mark.parametrize("provider,model,input_rate,output_rate", [
    ("google", "gemini-2.5-flash", 0.30, 2.50),
    ("google", "gemini-2.5-flash-002", 0.30, 2.50),
    ("openai", "gpt-4o-mini", 0.15, 0.60),
    ("openai", "gpt-4.1", 2.00, 8.00),
    ("anthropic", "claude-sonnet-4-20250514", 3.00, 15.00),
    ("anthropic", "claude-3-5-sonnet-20241022", 3.00, 15.00),
    ("anthropic", "claude-opus-4-5", 5.00, 25.00),
    ("fireworks", "accounts/fireworks/models/llama-v3p1-70b-instruct", 0.90, 0.90),
    ("fireworks_ai", "fireworks_ai/accounts/fireworks/models/qwen2p5-72b-instruct", 0.90, 0.90),
    ("fireworks", "llama-v3p1-70b-instruct", 0.90, 0.90),
    ("openrouter", "openai/gpt-4o", 2.50, 10.00),
    (None, "openrouter/anthropic/claude-3.5-sonnet", 3.00, 15.00),
    ("vercel", "openai/gpt-4o", 2.50, 10.00),
])
def test_known_provider_rates(provider, model, input_rate, output_rate):
    assert estimate_cost_usd(model, 1000, 250, provider) == pytest.approx(
        (1000 * input_rate + 250 * output_rate) / 1_000_000
    )


def test_native_long_context_uses_whole_request_tier():
    assert estimate_cost_usd("gemini-2.5-pro", 200_000, 1000, "google") == pytest.approx(0.26)
    assert estimate_cost_usd("gemini-2.5-pro", 200_001, 1000, "google") == pytest.approx(0.5150025)


@pytest.mark.parametrize("provider,model", [
    ("google", "not-gemini-2.5-flash"),
    ("google", "gemini-2.5-flash-unknown"),
    ("openai", "gpt-4o-not-a-real-variant"),
    ("openrouter", "openai/gpt-4o-not-a-real-variant"),
    ("featherless", "openai/gpt-4o"),
    ("featherless", "mistralai/Mistral-7B-Instruct-v0.3"),
    ("featherless_ai", "featherless-ai/Qwerky-72B"),
    ("unrecognized-host", "gpt-4o"),
    (None, "a-brand-new-model"),
    (None, None),
])
def test_missing_hosted_or_native_prices_are_not_zero(provider, model):
    assert resolve_model_rates(model, provider) is None
    assert estimate_cost_usd(model, 0, 0, provider) is None


def _response(model=None, prompt=1000, output=200, thinking=50):
    return SimpleNamespace(
        model_version=model,
        usage_metadata=SimpleNamespace(
            prompt_token_count=prompt,
            candidates_token_count=output,
            thoughts_token_count=thinking,
            total_token_count=prompt + output + thinking,
        ),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("capture_calls", [False, True])
async def test_hosted_request_identity_survives_transport_and_response(capture_calls):
    context = SimpleNamespace(agent_name="agent", invocation_id="run")
    tracker = TokenTrackerPlugin(capture_calls=capture_calls, model_targets={
        "agent": ("featherless", "gpt-4o"),
    })
    await tracker.before_model_callback(callback_context=context, llm_request=SimpleNamespace(model="openai/gpt-4o"))
    await tracker.after_model_callback(callback_context=context, llm_response=_response("gpt-4o"))
    row = tracker.usage_with_cost("gemini-2.5-flash")["agent"]
    assert row["provider"] == "featherless"
    assert row["cost_usd"] is None
    assert row["pricing_status"] == "unpriced"
    assert row["total_tokens"] == 1250
    if capture_calls:
        assert tracker.calls[0]["cost_usd"] is None
        assert tracker.calls[0]["pricing_status"] == "unpriced"


@pytest.mark.asyncio
async def test_routed_request_without_response_model_counts_thinking_cost():
    context = SimpleNamespace(agent_name="agent", invocation_id="run")
    tracker = TokenTrackerPlugin(capture_calls=False)
    await tracker.before_model_callback(callback_context=context, llm_request=SimpleNamespace(model="openrouter/openai/gpt-4o"))
    await tracker.after_model_callback(callback_context=context, llm_response=_response())
    row = tracker.usage_with_cost("gemini-2.5-flash")["agent"]
    assert row["cost_usd"] == pytest.approx(0.005)
    assert row["pricing_status"] == "priced"


@pytest.mark.asyncio
async def test_cost_is_calculated_per_call_before_context_threshold_aggregation():
    context = SimpleNamespace(agent_name="agent", invocation_id="run")
    tracker = TokenTrackerPlugin(capture_calls=False, model_targets={
        "agent": ("google", "gemini-2.5-pro"),
    })
    for _ in range(2):
        await tracker.after_model_callback(callback_context=context, llm_response=_response("gemini-2.5-pro", prompt=150_000, output=1000, thinking=0))
    row = tracker.usage_with_cost()["agent"]
    assert row["cost_usd"] == pytest.approx(0.395)
    assert row["prompt_tokens"] == 300_000


@pytest.mark.asyncio
@pytest.mark.parametrize("models", [
    ("gpt-4o", "not-a-real-model"),
    ("not-a-real-model", "gpt-4o"),
])
async def test_mixed_priced_unpriced_calls_never_report_partial_total(models):
    context = SimpleNamespace(agent_name="agent", invocation_id="run")
    tracker = TokenTrackerPlugin(capture_calls=False)
    for model in models:
        await tracker.before_model_callback(callback_context=context, llm_request=SimpleNamespace(model=model))
        await tracker.after_model_callback(callback_context=context, llm_response=_response(model))
    row = tracker.usage_with_cost("gemini-2.5-flash")["agent"]
    assert row["calls"] == 2
    assert row["cost_usd"] is None
    assert row["pricing_status"] == "unpriced"


def test_zero_token_usage_with_known_rate_is_priced_zero():
    assert estimate_cost_usd("gpt-4o", 0, 0, "openai") == 0.0


@pytest.mark.parametrize("costs", [(0.25, None), (None, 0.25), (None, None)])
def test_observability_windows_preserve_unpriced_totals(costs):
    from uuid import uuid4

    from app.db import models
    from app.db.database import SessionLocal
    from app.api.observability import observability_costs
    from app.services.observability_service import build_dashboards, build_trust

    user_id = uuid4()
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=user_id, name="pricing-window")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(workflow_id=workflow.id, version_number=1, graph_json={"nodes": [], "edges": []})
        db.add(version)
        db.flush()
        for cost in costs:
            run = models.WorkflowRun(workflow_version_id=version.id, status="completed", input_text="pricing", metrics_json={
                "total_tokens": 1000,
                "total_cost_usd": cost,
                "pricing_status": "priced" if cost is not None else "unpriced",
            })
            db.add(run)
            db.flush()
            db.add(models.LlmCall(run_id=run.id, model="hosted-model", total_tokens=1000, cost_usd=cost))
        db.flush()
        dashboard = build_dashboards(db, user_id)
        trust = build_trust(db, user_id)
        operational = observability_costs(limit=100, user_id=user_id, db=db)
        for result in (dashboard, trust, operational):
            assert result["total_cost_usd"] is None
            assert result["total_tokens"] == 2000
        assert dashboard["by_workflow"][0]["cost_usd"] is None
        assert dashboard["by_model"][0]["cost_usd"] is None
        assert trust["top_workflows_by_cost"][0]["cost_usd"] is None
        assert operational["top_workflows_by_cost"][0]["cost_usd"] is None
    finally:
        db.rollback()
        db.close()
