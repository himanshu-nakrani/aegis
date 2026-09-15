"""Provider-aware run gating: which API keys a graph needs before it can run."""

from app.config import settings
from app.services.workflow_capabilities import (
    missing_provider_keys,
    workflow_needs_gemini,
    workflow_required_providers,
)


def _agent(**data):
    return {
        "id": f"n{abs(hash(str(data))) % 1000}",
        "data": {"label": "Agent", "nodeType": "agent", "instruction": "Hi", **data},
    }


def test_no_llm_nodes_need_nothing():
    graph = {"nodes": [{"id": "n", "data": {"nodeType": "code"}}]}
    assert workflow_required_providers(graph) == set()
    assert missing_provider_keys(graph) == []
    assert workflow_needs_gemini(graph) is False


def test_default_agent_needs_google():
    graph = {"nodes": [_agent()]}
    assert workflow_required_providers(graph) == {"google"}
    assert workflow_needs_gemini(graph) is True


def test_openai_only_graph_does_not_need_gemini(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    graph = {"nodes": [_agent(modelProvider="openai", model="gpt-4o-mini")]}
    assert workflow_required_providers(graph) == {"openai"}
    assert workflow_needs_gemini(graph) is False
    assert missing_provider_keys(graph) == []


def test_missing_keys_reported_per_provider(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "g-test")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    graph = {
        "nodes": [
            _agent(),
            _agent(modelProvider="openai", model="gpt-4o"),
            _agent(modelProvider="anthropic", model="claude-sonnet-4-5"),
        ]
    }
    assert missing_provider_keys(graph) == ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]


def test_openai_node_without_model_falls_back_to_google(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    graph = {"nodes": [_agent(modelProvider="openai")]}
    # No model selected → the node compiles to default Gemini, so Google is required.
    assert workflow_required_providers(graph) == {"google"}


def test_google_search_tool_always_needs_google(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    graph = {
        "nodes": [
            {
                "id": "s",
                "data": {
                    "nodeType": "tool",
                    "toolType": "search",
                    "searchProvider": "google",
                    "modelProvider": "openai",
                    "model": "gpt-4o",
                },
            }
        ]
    }
    assert workflow_required_providers(graph) == {"google"}
    assert missing_provider_keys(graph) == ["GOOGLE_API_KEY"]


def test_deterministic_eval_does_not_need_google(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    for eval_type in ("exact", "substring", "regex", "json_schema", "numeric"):
        graph = {
            "nodes": [
                {
                    "id": "e",
                    "data": {
                        "nodeType": "evaluation",
                        "evalType": eval_type,
                    },
                }
            ]
        }
        assert workflow_required_providers(graph) == set()
        assert missing_provider_keys(graph) == []
        assert workflow_needs_gemini(graph) is False


def test_inline_llm_eval_honors_model_provider(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    graph = {
        "nodes": [
            {
                "id": "e",
                "data": {
                    "nodeType": "evaluation",
                    "evalType": "llm",
                    "evalExecutionMode": "inline",
                    "modelProvider": "openai",
                    "model": "gpt-4o",
                },
            }
        ]
    }
    assert workflow_required_providers(graph) == {"openai"}
    assert missing_provider_keys(graph) == []
    assert workflow_needs_gemini(graph) is False


def test_deferred_llm_eval_always_needs_google(monkeypatch):
    # Deferred judging runs in eval_runner on genai (Gemini-only), so the
    # node's OpenAI selection must not waive GOOGLE_API_KEY.
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    graph = {
        "nodes": [
            {
                "id": "e",
                "data": {
                    "nodeType": "evaluation",
                    "evalType": "llm",
                    "modelProvider": "openai",
                    "model": "gpt-4o",
                },
            }
        ]
    }
    assert workflow_required_providers(graph) == {"google"}
    assert missing_provider_keys(graph) == ["GOOGLE_API_KEY"]


def test_node_without_nodetype_gates_like_an_agent(monkeypatch):
    # The compiler builds data without nodeType as an agent; the gate must
    # default the same way instead of skipping the node.
    monkeypatch.setattr(settings, "openai_api_key", "")
    graph = {"nodes": [{"id": "n", "data": {"modelProvider": "openai", "model": "gpt-4o"}}]}
    assert workflow_required_providers(graph) == {"openai"}
    assert missing_provider_keys(graph) == ["OPENAI_API_KEY"]


def test_embedding_eval_needs_google(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    graph = {
        "nodes": [
            {
                "id": "e",
                "data": {
                    "nodeType": "evaluation",
                    "evalType": "embedding",
                },
            }
        ]
    }
    assert workflow_required_providers(graph) == {"google"}
    assert missing_provider_keys(graph) == ["GOOGLE_API_KEY"]
    assert workflow_needs_gemini(graph) is True
