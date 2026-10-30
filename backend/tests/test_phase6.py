"""Phase 6: knowledge libraries, bounded loops, schemas, playground history, insights."""

import asyncio
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.documents import chunk_by_strategy
from app.services.embeddings import _hashing_vector
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.invoke_runner import create_event_run, event_session_id
from app.services.node_handlers import NodeExecutionError, _make_loop_fn
from app.services.expressions import render_template
from app.services.output_schema import enforce_output_schema, normalize_output_schema
from app.services.retrieval import normalize_kb_settings, reciprocal_rank_fusion

from conftest import valid_graph

client = TestClient(app)

SCHEMA = {
    "type": "object",
    "properties": {"name": {"type": "string"}},
    "required": ["name"],
}


def test_reciprocal_rank_fusion_breaks_ties_by_id():
    fused = reciprocal_rank_fusion([["a", "b"], ["b", "a"]], k=60)
    assert [doc_id for doc_id, _score in fused] == ["a", "b"]
    assert fused[0][1] == fused[1][1]


def test_normalize_kb_settings_bounds():
    assert normalize_kb_settings(None)["retrieval_method"] == "hybrid"
    assert normalize_kb_settings(None)["chunk_size"] == 800
    with pytest.raises(ValueError, match="chunk_size"):
        normalize_kb_settings({"chunk_size": 10})


def test_chunk_strategies_keep_offsets():
    text = "Alpha paragraph.\n\nBeta paragraph stays separate."
    paragraphs = chunk_by_strategy(text, "paragraph", 200, 0)
    assert [chunk["text"] for chunk in paragraphs] == [
        "Alpha paragraph.",
        "Beta paragraph stays separate.",
    ]
    assert paragraphs[0]["start"] == 0
    fixed = chunk_by_strategy("abcdefghij", "fixed", 4, 0)
    assert fixed[0] == {"text": "abcd", "start": 0, "end": 4}
    assert fixed[1]["start"] == 4


def test_output_schema_accepts_canonical_json_and_rejects_extras():
    assert json.loads(enforce_output_schema('{"name": "Ada"}', SCHEMA)) == {"name": "Ada"}
    with pytest.raises(ValueError, match="unexpected"):
        enforce_output_schema('{"name": "Ada", "extra": 1}', SCHEMA)
    with pytest.raises(ValueError, match="not valid JSON"):
        enforce_output_schema("nope", SCHEMA)
    with pytest.raises(ValueError, match="JSON object"):
        normalize_output_schema(["name"])


def test_library_hybrid_query_and_url_guard(monkeypatch):
    monkeypatch.setattr("app.services.embeddings.embed_text", lambda text: _hashing_vector(text))

    created = client.post("/api/knowledge", json={"name": "Support"})
    assert created.status_code == 201, created.text
    base_id = created.json()["id"]
    assert created.json()["settings"]["retrieval_method"] == "hybrid"

    rejected = client.post("/api/knowledge", json={"name": "Bad", "settings": {"chunk_size": 10}})
    assert rejected.status_code == 400

    password = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Password reset", "text": "Reset your password from the account settings page.", "tags": ["Support"]},
    )
    assert password.status_code == 201, password.text
    weather = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Lisbon weather", "text": "Lisbon weather is mild in spring and the river is wide."},
    )
    assert weather.status_code == 201, weather.text

    queried = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "reset your password"},
    )
    assert queried.status_code == 200, queried.text
    body = queried.json()
    assert body["method"] == "hybrid"
    assert body["citations"]
    assert "password" in (body["results"][0]["text"] or "").lower()

    blocked = client.post(
        f"/api/knowledge/{base_id}/documents/url",
        json={"url": "http://127.0.0.1/secret"},
    )
    assert blocked.status_code == 400

    async def fake_fetch(_url):
        return b"Otters live in rivers and eat shellfish.", "text/plain", "page.txt"

    monkeypatch.setattr("app.api.knowledge.fetch_public_document", fake_fetch)
    fetched = client.post(
        f"/api/knowledge/{base_id}/documents/url",
        json={"url": "https://example.com/otters", "title": "Otters"},
    )
    assert fetched.status_code == 201, fetched.text
    source_id = fetched.json()["source_document_id"]
    listed = client.get(f"/api/knowledge/{base_id}/documents")
    assert listed.status_code == 200
    match = next(row for row in listed.json() if row["source_document_id"] == source_id)
    assert match["source_url"] == "https://example.com/otters"

    removed = client.delete(f"/api/knowledge/{base_id}/documents/{source_id}")
    assert removed.status_code == 200
    assert removed.json()["deleted_chunks"] >= 1


def test_bounded_loop_stops_when_condition_fails():
    fn = _make_loop_fn(
        "loop1",
        {"left": "{{iteration}}", "operator": "lt", "right": "3"},
        "{{last_output}}",
        None,
        5,
        "loop_loop1",
        None,
    )
    payload = json.loads(asyncio.run(fn("start")))
    assert payload["iterations"] == 2
    assert payload["outputs"] == ["start", "start"]

    graph = valid_graph(
        [
            {
                "id": "loop1",
                "data": {
                    "nodeType": "loop",
                    "loopCondition": {"left": "{{iteration}}", "operator": "lt", "right": "3"},
                    "loopBody": "{{last_output}}",
                    "maxIterations": 5,
                },
            }
        ]
    )
    assert validate_workflow_graph(graph)["node_count"] >= 3

    missing = valid_graph(
        [{"id": "loop1", "data": {"nodeType": "loop", "loopBody": "{{last_output}}"}}]
    )
    with pytest.raises(GraphValidationError, match="condition"):
        validate_workflow_graph(missing)

    cycle = valid_graph(
        [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "b", "data": {"nodeType": "agent"}},
        ],
        [{"source": "a", "target": "b"}, {"source": "b", "target": "a"}],
    )
    with pytest.raises(GraphValidationError, match="acyclic"):
        validate_workflow_graph(cycle)

    empty = _make_loop_fn("loop2", {}, "{{last_output}}", None, 5, "loop_loop2", None)
    with pytest.raises(NodeExecutionError, match="condition"):
        asyncio.run(empty("start"))


def test_playground_run_is_listed(monkeypatch):
    from app.api import playground

    monkeypatch.setattr(
        playground,
        "generate_text",
        lambda pm, *, system_instruction, contents, extra_config=None: "ok",
    )
    created = client.post(
        "/api/playground/run",
        json={
            "template": "Say {{word}}",
            "variables": {"word": "phase6"},
            "models": [{"provider": "google", "model": "gemini-test"}],
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["id"]
    listed = client.get("/api/playground/runs")
    assert listed.status_code == 200, listed.text
    assert any(row["id"] == created.json()["id"] for row in listed.json())


def test_trace_insights_queue_repeated_low_eval():
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=DEFAULT_DEV_USER_ID, name="Insight WF")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            workflow_id=workflow.id,
            version_number=1,
            graph_json={"nodes": [], "edges": []},
        )
        db.add(version)
        db.flush()
        for _ in range(2):
            db.add(
                models.WorkflowRun(
                    workflow_version_id=version.id,
                    status="completed",
                    input_text="ask",
                    final_output="phase6 repeated weak answer",
                    metrics_json={"eval_aggregate": 0.2},
                )
            )
        db.commit()
    finally:
        db.close()

    listed = client.get("/api/observability/insights")
    assert listed.status_code == 200, listed.text
    pattern = next(
        row for row in listed.json()["patterns"] if "phase6 repeated weak answer" in row["preview"]
    )
    assert pattern["count"] >= 2
    queued = client.post("/api/observability/insights/queue", json={"signature": pattern["signature"]})
    assert queued.status_code == 200, queued.text
    assert queued.json()["queued"] >= 2


def test_slack_thread_reuses_session_history(monkeypatch):
    assert event_session_id({"slack": {"channel": "C1"}}) is None
    assert event_session_id({"slack": {"team": "T", "channel": "C", "thread_ts": "1"}}) == "slack:T:C:1"
    assert len(event_session_id({"slack": {"team": "T" * 200, "channel": "C", "thread_ts": "1"}})) == 128

    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=DEFAULT_DEV_USER_ID, name="Slack WF")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            workflow_id=workflow.id,
            version_number=1,
            graph_json=valid_graph(
                [
                    {
                        "id": "echo",
                        "data": {"nodeType": "transform", "transformTemplate": "{{input.text}}"},
                    }
                ]
            ),
        )
        db.add(version)
        db.flush()
        db.add(
            models.WorkflowRun(
                workflow_version_id=version.id,
                status="completed",
                input_text="first",
                final_output="hello back",
                session_id="slack:T1:C1:111.0",
            )
        )
        db.commit()

        class _Deployment:
            id = uuid4()

        monkeypatch.setattr(
            "app.services.deployments.authenticate_event_webhook",
            lambda *args, **kwargs: (workflow, _Deployment(), version),
        )
        monkeypatch.setattr("app.services.invoke_runner.missing_provider_keys", lambda *args, **kwargs: [])

        run_id, version_number = create_event_run(
            db,
            workflow.id,
            {},
            b"{}",
            "/v1/webhooks/x",
            input_payload={
                "slack": {"team": "T1", "channel": "C1", "thread_ts": "111.0", "text": "again"}
            },
        )
        follow = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).one()
        assert version_number == 1
        assert follow.session_id == "slack:T1:C1:111.0"
        assert follow.metrics_json["session_history"][0]["output"] == "hello back"
    finally:
        db.close()


def test_ingest_enforces_chunk_cap(monkeypatch):
    monkeypatch.setattr("app.services.embeddings.embed_text", lambda text: _hashing_vector(text))
    monkeypatch.setattr("app.services.knowledge_library.MAX_LIBRARY_CHUNKS", 3)

    created = client.post(
        "/api/knowledge",
        json={"name": "Capped", "settings": {"chunk_strategy": "fixed", "chunk_size": 200, "chunk_overlap": 0}},
    )
    assert created.status_code == 201, created.text
    base_id = created.json()["id"]

    two = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Two", "text": "a" * 250},
    )
    assert two.status_code == 201, two.text
    assert two.json()["chunks_created"] == 2

    over = client.post(
        f"/api/knowledge/{base_id}/documents",
        json={"title": "Over", "text": "b" * 250},
    )
    assert over.status_code == 400
    assert "cap" in over.json()["detail"].lower()


def test_rerank_pool_bounds_candidates_and_min_score_runs_first(monkeypatch):
    monkeypatch.setattr("app.services.embeddings.embed_text", lambda text: _hashing_vector(text))
    seen: list[int] = []

    def fake_rerank(query, hits, user_id):
        seen.append(len(hits))
        return list(reversed(hits))

    monkeypatch.setattr("app.services.knowledge_library._rerank", fake_rerank)

    created = client.post(
        "/api/knowledge",
        json={"name": "Reranked", "settings": {"reranker": "llm", "rerank_candidates": 2, "retrieval_method": "bm25"}},
    )
    assert created.status_code == 201, created.text
    base_id = created.json()["id"]
    for index in range(4):
        posted = client.post(
            f"/api/knowledge/{base_id}/documents",
            json={"title": f"doc{index}", "text": f"otters eat shellfish near river number {index}"},
        )
        assert posted.status_code == 201, posted.text

    queried = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "otters shellfish", "method": "bm25"},
    )
    assert queried.status_code == 200, queried.text
    body = queried.json()
    assert body["rerank"]["applied"] is True
    assert seen == [2]
    assert len(body["results"]) == 4

    # A min_score the lexical scores cannot reach must filter before the
    # reranker is consulted, not after it reorders.
    seen.clear()
    filtered = client.post(
        f"/api/knowledge/{base_id}/query",
        json={
            "query": "otters shellfish",
            "method": "bm25",
            "settings": {"min_score": 500},
        },
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["results"] == []
    assert seen == []


def test_rerank_strips_markdown_fences(monkeypatch):
    monkeypatch.setattr("app.services.embeddings.embed_text", lambda text: _hashing_vector(text))

    def fenced_ranker(pm, system_instruction, contents):
        passages = json.loads(contents)["passages"]
        ordered = [passage["id"] for passage in reversed(passages)]
        return "```json\n" + json.dumps(ordered) + "\n```"

    monkeypatch.setattr("app.services.llm_providers.generate_text", fenced_ranker)

    created = client.post(
        "/api/knowledge",
        json={"name": "Fenced", "settings": {"reranker": "llm", "retrieval_method": "bm25"}},
    )
    assert created.status_code == 201, created.text
    base_id = created.json()["id"]
    for index in range(2):
        posted = client.post(
            f"/api/knowledge/{base_id}/documents",
            json={"title": f"fdoc{index}", "text": f"beavers build lodges in pond number {index}"},
        )
        assert posted.status_code == 201, posted.text

    queried = client.post(
        f"/api/knowledge/{base_id}/query",
        json={"query": "beavers lodges", "method": "bm25"},
    )
    assert queried.status_code == 200, queried.text
    body = queried.json()
    assert body["rerank"]["applied"] is True
    assert len(body["results"]) == 2


def test_trace_insights_normalizes_five_scale_judge():
    db = SessionLocal()
    try:
        workflow = models.Workflow(user_id=DEFAULT_DEV_USER_ID, name="Judge WF")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(
            workflow_id=workflow.id,
            version_number=1,
            graph_json={"nodes": [], "edges": []},
        )
        db.add(version)
        db.flush()
        for _ in range(2):
            db.add(
                models.WorkflowRun(
                    workflow_version_id=version.id,
                    status="completed",
                    input_text="ask",
                    final_output="five scale weak answer",
                    metrics_json={"eval_aggregate": 2.1},
                )
            )
        db.commit()
    finally:
        db.close()

    listed = client.get("/api/observability/insights")
    assert listed.status_code == 200, listed.text
    pattern = next(
        row for row in listed.json()["patterns"] if "five scale weak answer" in row["preview"]
    )
    assert pattern["count"] >= 2


def test_last_output_supports_dotted_json_paths():
    context = {"last_output": json.dumps({"answer": "42", "nested": {"ok": True}})}
    rendered = render_template("value={{last_output.answer}} flag={{last_output.nested.ok}}", context, "fallback")
    assert rendered == "value=42 flag=True"
    plain = render_template("raw={{last_output}}", context, "fallback")
    assert plain.startswith("raw={")


def test_tool_agent_node_retains_output_schema():
    # Regression: the ADK tool-calling path enforces outputSchema from the
    # node data after the run (agent_tools.ToolAgentNode), so the compiler
    # must pass the raw data dict through — dropping the key would silently
    # skip validation for tool-using agents.
    from app.services.agent_tools import ToolAgentNode
    from app.services.compiler import _build_adk_node

    node = _build_adk_node(
        {
            "id": "agent1",
            "data": {
                "nodeType": "agent",
                "instruction": "Answer",
                "tools": [{"kind": "node", "nodeId": "tool1"}],
                "outputSchema": SCHEMA,
            },
        },
        None,
        {},
    )
    assert isinstance(node, ToolAgentNode)
    assert node.data["outputSchema"] == SCHEMA
    assert "Respond with one JSON object" in node.agent.instruction
