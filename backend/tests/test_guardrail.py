import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.config import settings
from app.services.compiler import _make_guardrail_fn
from app.services.context_wrapper import wrap_with_context
from app.services.guardrail import (
    GuardrailBlockedError,
    GuardrailJudgeUnavailableError,
    apply_fail_behavior,
    validate_content,
    validate_guardrail_content,
)
from app.services.llm_providers import ProviderModel
from app.services.node_test import run_node_test


def test_validate_pii_email():
    result = validate_content("Contact me at user@example.com", {"detect_pii": True})
    assert not result.passed
    assert "email" in result.message.lower()


def test_validate_max_length():
    result = validate_content("hello world", {"max_length": 5})
    assert not result.passed


def test_warn_mode_continues():
    result = validate_content("bad spam content", {"blocked_keywords": ["spam"]})
    warned = apply_fail_behavior(result, "warn", "n1")
    assert warned.passed
    assert warned.severity == "warn"


def test_block_mode_raises():
    result = validate_content("bad spam", {"blocked_keywords": ["spam"]})
    with pytest.raises(GuardrailBlockedError):
        apply_fail_behavior(result, "block", "n1")


def test_validate_blocked_pattern_list():
    result = validate_content("api_key=abc", {"blocked_patterns": [r"api_key\s*="]})
    assert not result.passed


JUDGE_TYPES = ("llm", "prompt_injection", "moderation")
FAIL_BEHAVIORS = ("block", "warn", "mask", "rewrite", "fallback", "route")


@pytest.mark.parametrize("guardrail_type", JUDGE_TYPES)
@pytest.mark.parametrize("environment", ("production", "development"))
@pytest.mark.parametrize("key", ("", "   ", "test-key", "fake-key", "dummy", "placeholder", "your_api_key_here", "<api-key>"))
@pytest.mark.parametrize("provider", ("google", "openai"))
def test_unavailable_judge_key_obeys_deployment_environment(
    monkeypatch, guardrail_type, environment, key, provider
):
    monkeypatch.setattr(settings, "deployment_environment", environment)
    monkeypatch.setattr(settings, "google_api_key", key)
    pm = ProviderModel(provider, "gemini-2.5-flash" if provider == "google" else "gpt-4o", api_key=key)
    result = validate_guardrail_content("Content needing review", {"guardrail_type": guardrail_type}, pm)
    production = environment == "production"
    assert result.passed is not production
    assert result.requires_block is production
    assert result.severity == ("error" if production else "warn")
    assert ("blocked" if production else "skipped") in result.message.lower()


@pytest.mark.parametrize("guardrail_type", JUDGE_TYPES)
@pytest.mark.parametrize("fail_behavior", FAIL_BEHAVIORS)
def test_production_missing_judge_cannot_be_downgraded(monkeypatch, guardrail_type, fail_behavior):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "")
    rules = {"guardrail_type": guardrail_type, "fail_behavior": fail_behavior, "fallback_value": "continue"}
    result = validate_guardrail_content("Content needing review", rules)
    with pytest.raises(GuardrailJudgeUnavailableError):
        apply_fail_behavior(result, fail_behavior, "guard", content="Content needing review", rules=rules)


@pytest.mark.parametrize("guardrail_type", JUDGE_TYPES)
@pytest.mark.parametrize("failure", ("resolution", "judge"))
def test_production_judge_errors_cannot_be_warned(monkeypatch, guardrail_type, failure):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "configured-judge-key")

    def unavailable(*args, **kwargs):
        raise RuntimeError("Judge unavailable")

    monkeypatch.setattr(
        "app.services.guardrail." + ("_guardrail_pm" if failure == "resolution" else "generate_structured"),
        unavailable,
    )
    result = validate_guardrail_content("Content needing review", {"guardrail_type": guardrail_type})
    assert result.passed is False
    assert result.requires_block is True
    with pytest.raises(GuardrailJudgeUnavailableError):
        apply_fail_behavior(result, "warn", "guard")


@pytest.mark.parametrize("guardrail_type", JUDGE_TYPES)
@pytest.mark.parametrize("fail_behavior", FAIL_BEHAVIORS)
def test_compiled_guardrail_blocks_missing_production_judge(monkeypatch, guardrail_type, fail_behavior):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "")
    rules = {"guardrail_type": guardrail_type, "fail_behavior": fail_behavior}
    guardrail = _make_guardrail_fn("guard", rules)
    context = {}
    wrapped = wrap_with_context("guard", guardrail, context, node_type="guardrail", error_branch=True)
    adk_context = SimpleNamespace(route=None)
    with pytest.raises(GuardrailJudgeUnavailableError):
        asyncio.run(wrapped(adk_context, "Content needing review"))
    assert adk_context.route is None
    assert "_error_routed" not in context
    assert "steps" not in context


def test_rule_guardrails_do_not_require_production_judge(monkeypatch):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "")
    clean = validate_guardrail_content("ordinary content", {"blocked_keywords": ["forbidden"]})
    assert clean.passed is True
    failed = validate_guardrail_content("forbidden content", {"blocked_keywords": ["forbidden"]})
    assert failed.passed is False
    assert failed.requires_block is False
    assert apply_fail_behavior(failed, "warn", "guard").passed is True


def test_node_preview_reports_missing_production_judge_as_failed(monkeypatch):
    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "")
    node = {
        "id": "guard",
        "data": {"nodeType": "guardrail", "label": "Judge", "rules": {"guardrail_type": "llm", "fail_behavior": "warn"}},
    }
    result = asyncio.run(run_node_test({"nodes": [node], "edges": []}, uuid4(), uuid4(), "guard", "Review me", None))
    assert result["status"] == "failed"
    assert result["output"] is None


@pytest.mark.parametrize("guardrail_type", JUDGE_TYPES)
@pytest.mark.parametrize("safe", (True, False))
def test_configured_production_judge_keeps_content_policy_behaviors(monkeypatch, guardrail_type, safe):
    from app.services.guardrail import LlmGuardrailVerdict, ModerationVerdict, PromptInjectionVerdict

    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "configured-judge-key")
    verdicts = {
        "llm": LlmGuardrailVerdict(passed=safe),
        "prompt_injection": PromptInjectionVerdict(is_injection=not safe),
        "moderation": ModerationVerdict(toxicity=0.0 if safe else 1.0, hate=0.0, violence=0.0, self_harm=0.0, sexual=0.0),
    }
    monkeypatch.setattr("app.services.guardrail.generate_structured", lambda *args, **kwargs: verdicts[guardrail_type])
    result = validate_guardrail_content("Content needing review", {"guardrail_type": guardrail_type})
    assert result.passed is safe
    assert result.requires_block is False
    assert apply_fail_behavior(result, "warn", "guard").passed is True


@pytest.mark.parametrize("guardrail_type", JUDGE_TYPES)
def test_required_production_judge_deadline_cannot_retry_or_error_route(monkeypatch, guardrail_type):
    import threading

    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "configured-judge-key")
    release = threading.Event()
    calls = []

    def stalled(*args, **kwargs):
        calls.append(True)
        release.wait(timeout=1)
        raise RuntimeError("Judge unavailable")

    monkeypatch.setattr("app.services.guardrail.generate_structured", stalled)
    guardrail = _make_guardrail_fn("guard", {"guardrail_type": guardrail_type, "fail_behavior": "warn"})
    context = {}
    wrapped = wrap_with_context("guard", guardrail, context, required_judge=True, timeout_sec=0.01, retries=3, error_branch=True)
    adk_context = SimpleNamespace(route=None)

    async def drive():
        try:
            with pytest.raises(GuardrailJudgeUnavailableError):
                await wrapped(adk_context, "Review me")
        finally:
            release.set()

    asyncio.run(drive())
    assert calls == [True]
    assert adk_context.route is None
    assert "_error_routed" not in context


@pytest.mark.parametrize("raw", ("", "{}", '{"toxicity": 0.0}', '{"toxicity": -1, "hate": 0, "violence": 0, "self_harm": 0, "sexual": 0}'))
def test_unusable_moderation_judgments_cannot_pass_production(monkeypatch, raw):
    from unittest.mock import MagicMock

    monkeypatch.setattr(settings, "deployment_environment", "production")
    monkeypatch.setattr(settings, "google_api_key", "configured-judge-key")
    client = MagicMock()
    client.models.generate_content.return_value.text = raw
    monkeypatch.setattr("google.genai.Client", lambda **kwargs: client)
    result = validate_guardrail_content("Review me", {"guardrail_type": "moderation"})
    assert result.passed is False
    assert result.requires_block is True
    with pytest.raises(GuardrailJudgeUnavailableError):
        apply_fail_behavior(result, "fallback", "guard", content="Review me")


def test_mask_removes_blocked_keyword():
    from app.services.guardrail import apply_fail_behavior, validate_content

    rules = {"blocked_keywords": ["exploit"]}
    result = validate_content("call exploit now", rules)
    assert not result.passed
    out = apply_fail_behavior(result, "mask", "n", content="call exploit now", rules=rules)
    assert out.passed
    assert "exploit" not in out.output_override.lower()


def test_mask_unmaskable_violation_blocks():
    from app.services.guardrail import GuardrailBlockedError, apply_fail_behavior, validate_content

    rules = {"required_keywords": ["invoice"]}
    result = validate_content("hello world", rules)
    assert not result.passed
    with pytest.raises(GuardrailBlockedError):
        apply_fail_behavior(result, "mask", "n", content="hello world", rules=rules)