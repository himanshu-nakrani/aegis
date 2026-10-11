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


def test_openai_node_without_model_uses_provider_default(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    graph = {"nodes": [_agent(provider="openai")]}
    # No model selected → the node compiles to the provider's default model, so
    # the OpenAI key is what the run requires (not Google).
    assert workflow_required_providers(graph) == {"openai"}


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


def test_bound_credential_satisfies_provider_gate(monkeypatch):
    """A node with a bound provider credential runs even without an env key."""
    import uuid

    from app.db import models
    from app.db.database import SessionLocal
    from app.services.credentials import encrypt_credential_config

    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "featherless_api_key", "")

    owner = uuid.uuid4()
    db = SessionLocal()
    try:
        cred = models.Credential(
            id=uuid.uuid4(),
            user_id=owner,
            name="featherless-key",
            type="featherless",
            config=encrypt_credential_config({"api_key": "fk-live"}),
        )
        db.add(cred)
        db.commit()
        cred_id = str(cred.id)
    finally:
        db.close()

    graph = {
        "nodes": [
            _agent(
                provider="featherless",
                model="mistralai/Mistral-7B-Instruct-v0.3",
                credentialId=cred_id,
            )
        ]
    }
    # No env key configured, but the owner's bound credential supplies it.
    assert missing_provider_keys(graph, owner) == []
    # Without the owner context (env-only view) the same graph is gated.
    assert missing_provider_keys(graph) == ["FEATHERLESS_API_KEY"]


def test_attached_search_requires_nested_google_but_not_declaration_provider(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    graph = {"nodes": [
        _agent(provider="openai", tools=[{"kind": "node", "nodeId": "search"}]),
        {"id": "search", "data": {"nodeType": "tool", "toolType": "search", "searchProvider": "google", "provider": "anthropic"}},
    ]}
    assert workflow_required_providers(graph) == {"openai", "google"}
    assert missing_provider_keys(graph) == ["GOOGLE_API_KEY"]


def test_attached_deterministic_tools_need_only_the_agent_provider(monkeypatch):
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    graph = {"nodes": [
        _agent(provider="openai", tools=[{"kind": "node", "nodeId": "http"}]),
        {"id": "http", "data": {"nodeType": "tool", "toolType": "http", "provider": "google"}},
    ]}
    assert workflow_required_providers(graph) == {"openai"}
    assert missing_provider_keys(graph) == []


def test_mcp_bindings_require_owned_discovered_tool_schema():
    import uuid
    import pytest

    from app.db import models
    from app.db.database import SessionLocal
    from app.services.graph_validation import GraphValidationError
    from app.services.workflow_capabilities import validate_mcp_tool_bindings

    owner, other_owner, credential_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    graph = {"nodes": [_agent(tools=[{"kind": "mcp", "credentialId": str(credential_id), "toolName": "lookup"}])]}
    with SessionLocal() as db:
        credential = models.Credential(id=credential_id, user_id=owner, name="MCP", type="mcp", config={})
        db.add(credential)
        db.commit()
        try:
            with pytest.raises(GraphValidationError):
                validate_mcp_tool_bindings(graph, db, owner)
            credential.mcp_tool_cache = {"tools": [{"name": "lookup", "input_schema": {"type": "object"}}], "discovered_at": "2026-10-10T00:00:00Z"}
            db.commit()
            validate_mcp_tool_bindings(graph, db, owner)
            with pytest.raises(GraphValidationError):
                validate_mcp_tool_bindings(graph, db, other_owner)
            graph["nodes"][0]["data"]["tools"][0]["toolName"] = "missing"
            with pytest.raises(GraphValidationError):
                validate_mcp_tool_bindings(graph, db, owner)
            graph["nodes"][0]["data"]["tools"][0]["toolName"] = "lookup"
            credential.type = "openai"
            db.commit()
            with pytest.raises(GraphValidationError):
                validate_mcp_tool_bindings(graph, db, owner)
        finally:
            db.delete(credential)
            db.commit()
