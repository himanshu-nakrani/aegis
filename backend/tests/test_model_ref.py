"""Guards for the model-selection seam.

Node tier: multi-provider resolution (node_ref/adk_model/complete_text) with
Gemini as the universal fallback. Judge/guardrail tier: those callers run on
genai directly, so any non-Google override still resolves to the configured
Gemini model rather than breaking execution.
"""

from app.config import settings
from app.services import model_ref
from app.services.model_ref import ModelRef


def test_default_resolves_to_gemini():
    assert model_ref.resolve_model() == settings.gemini_model
    assert model_ref.resolve_judge_model(None) == settings.gemini_model
    assert model_ref.resolve_guardrail_model(None) == settings.gemini_model
    assert model_ref.resolve_guardrail_model({}) == settings.gemini_model


def test_gemini_override_string_and_dict():
    assert model_ref.resolve_model("gemini-2.5-pro") == "gemini-2.5-pro"
    assert (
        model_ref.resolve_model({"provider": "google", "model": "gemini-2.5-pro"})
        == "gemini-2.5-pro"
    )
    assert (
        model_ref.resolve_judge_model({"judge_model": "gemini-2.5-pro"})
        == "gemini-2.5-pro"
    )
    assert (
        model_ref.resolve_guardrail_model({"guardrail_model": "gemini-2.5-pro"})
        == "gemini-2.5-pro"
    )


def test_judge_guardrail_callers_stay_on_gemini_for_other_providers():
    # eval.py/guardrail.py call genai.Client directly: non-Google overrides
    # must degrade to Gemini rather than break execution.
    assert (
        model_ref.resolve_model({"provider": "openai", "model": "gpt-5"})
        == settings.gemini_model
    )
    assert (
        model_ref.resolve_guardrail_model({"guardrail_model": {"provider": "anthropic", "model": "claude"}})
        == settings.gemini_model
    )


def test_available_models_defaults_to_gemini_when_other_keys_unset(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    models = model_ref.available_models()
    assert models[0] == model_ref.default_ref()
    assert all(ref.provider == "google" for ref in models)


def test_available_models_includes_configured_providers(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    providers = {ref.provider for ref in model_ref.available_models()}
    assert providers == {"google", "openai"}


def test_model_catalog_flags_configured_providers(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "g-test")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    catalog = {entry["provider"]: entry for entry in model_ref.model_catalog()}
    assert catalog["google"]["configured"] is True
    assert catalog["openai"]["configured"] is True
    assert catalog["anthropic"]["configured"] is False
    assert "gpt-4o" in catalog["openai"]["models"]
    assert catalog["anthropic"]["models"]


# --- node tier ---------------------------------------------------------------


def test_node_ref_defaults_and_gemini_override():
    assert model_ref.node_ref(None) == model_ref.default_ref()
    assert model_ref.node_ref({}) == model_ref.default_ref()
    assert model_ref.node_ref({"model": "gemini-2.5-pro"}) == ModelRef(
        "google", "gemini-2.5-pro"
    )
    assert model_ref.node_ref({"modelProvider": "gemini", "model": "gemini-2.0-flash"}) == ModelRef(
        "google", "gemini-2.0-flash"
    )


def test_node_ref_openai_and_anthropic():
    assert model_ref.node_ref({"modelProvider": "openai", "model": "gpt-4o-mini"}) == ModelRef(
        "openai", "gpt-4o-mini"
    )
    ref = model_ref.node_ref({"modelProvider": "anthropic", "model": "claude-sonnet-4-5"})
    assert ref == ModelRef("anthropic", "claude-sonnet-4-5")
    assert ref.litellm_model == "anthropic/claude-sonnet-4-5"


def test_node_ref_unknown_or_incomplete_falls_back_to_gemini():
    assert model_ref.node_ref({"modelProvider": "openai"}) == model_ref.default_ref()
    assert model_ref.node_ref({"modelProvider": "mistral", "model": "x"}) == ModelRef(
        "google", settings.gemini_model
    )


def test_adk_model_gemini_is_string_other_providers_are_litellm():
    assert model_ref.adk_model(ModelRef("google", "gemini-2.5-pro")) == "gemini-2.5-pro"
    assert model_ref.adk_model(ModelRef("google", "")) == settings.gemini_model

    from google.adk.models.lite_llm import LiteLlm

    llm = model_ref.adk_model(ModelRef("openai", "gpt-4o-mini"))
    assert isinstance(llm, LiteLlm)
    assert llm.model == "openai/gpt-4o-mini"
    llm = model_ref.adk_model(ModelRef("anthropic", "claude-haiku-4-5"))
    assert llm.model == "anthropic/claude-haiku-4-5"


def test_strip_code_fences():
    assert model_ref.strip_code_fences('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert model_ref.strip_code_fences('```JSON\n{"a": 1}\n```') == '{"a": 1}'
    assert model_ref.strip_code_fences('```\n{"a": 1}\n```') == '{"a": 1}'
    assert model_ref.strip_code_fences('{"a": 1}') == '{"a": 1}'
    assert model_ref.strip_code_fences("") == ""
    assert (
        model_ref.strip_code_fences('Here is output:\n```json\n{"a": 1}\n```\nDone.')
        == '{"a": 1}'
    )


def test_complete_text_google(monkeypatch):
    from unittest.mock import MagicMock

    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.text = "google response"
    mock_client.models.generate_content.return_value = mock_resp

    import google.genai
    monkeypatch.setattr(google.genai, "Client", lambda **kwargs: mock_client)

    result = model_ref.complete_text(
        ModelRef("google", "gemini-2.5-flash"),
        prompt="hello",
    )
    assert result == "google response"
    mock_client.models.generate_content.assert_called_once()


def test_complete_text_litellm(monkeypatch):
    from unittest.mock import MagicMock
    from pydantic import BaseModel

    class DummySchema(BaseModel):
        answer: str

    captured_kwargs = {}

    def fake_completion(**kwargs):
        captured_kwargs.update(kwargs)
        choice = MagicMock()
        choice.message.content = '{"answer": "ok"}'
        resp = MagicMock()
        resp.choices = [choice]
        return resp

    import litellm
    monkeypatch.setattr(litellm, "completion", fake_completion)
    monkeypatch.setattr(settings, "openai_api_key", "sk-custom-key")

    result = model_ref.complete_text(
        ModelRef("openai", "gpt-4o-mini"),
        system="be brief",
        prompt="hello",
        schema=DummySchema,
    )
    assert result == '{"answer": "ok"}'
    assert captured_kwargs["model"] == "openai/gpt-4o-mini"
    assert captured_kwargs["api_key"] == "sk-custom-key"
    assert captured_kwargs["drop_params"] is True
    assert captured_kwargs["response_format"] == {"type": "json_object"}
    assert any("answer" in m["content"] for m in captured_kwargs["messages"] if m["role"] == "system")
