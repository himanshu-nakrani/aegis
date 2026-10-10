"""Phase 5: multi-model experiment matrix + Ollama provider.

Covers: the Ollama provider spec (LiteLLM ``ollama/`` prefix, keyless,
configurable api_base), the per-run model_override seam (graph rewrite in
run_authoring + persisted-overrides plumbing in the executor), and the
experiment matrix path (API validation + runner aggregation).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import UUID, uuid4


from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from tests.conftest import valid_graph

client = TestClient(app)


# ---------------------------------------------------------------------------
# Ollama provider
# ---------------------------------------------------------------------------


def test_ollama_resolves_to_litellm_prefix_with_default_base():
    from app.services.llm_providers import resolve_provider_model

    pm = resolve_provider_model({"provider": "ollama", "model": "llama3.1"})
    assert pm.provider == "ollama"
    assert pm.litellm_model == "ollama/llama3.1"
    assert pm.api_key is None
    assert pm.api_base == "http://localhost:11434"


def test_ollama_base_url_env_and_node_override(monkeypatch):
    from app.config import settings
    from app.services.llm_providers import resolve_provider_model

    monkeypatch.setattr(settings, "ollama_api_base", "http://ollama.internal:11434")
    pm = resolve_provider_model({"provider": "ollama", "model": "qwen3"})
    assert pm.api_base == "http://ollama.internal:11434"

    # A node-level apiBase (e.g. from a matrix pair) wins over the env var.
    pm = resolve_provider_model(
        {"provider": "ollama", "model": "qwen3", "apiBase": "http://other:11434"}
    )
    assert pm.api_base == "http://other:11434"


def test_ollama_is_keyless_and_credential_free():
    from app.services.llm_providers import (
        api_key_available,
        model_catalog,
        provider_configured,
        resolve_provider_model,
    )
    from app.services.llm_providers.registry import CREDENTIAL_PROVIDER_IDS

    pm = resolve_provider_model({"provider": "ollama", "model": "mistral"})
    assert api_key_available(pm) is True
    assert provider_configured("ollama") is True
    assert "ollama" not in CREDENTIAL_PROVIDER_IDS

    entry = next(e for e in model_catalog() if e["provider"] == "ollama")
    assert entry["configured"] is True
    assert entry["needs_credential"] is False
    assert entry["has_base_url"] is True


def test_ollama_adk_model_wraps_in_litellm():
    from google.adk.models.lite_llm import LiteLlm

    from app.services.llm_providers import build_adk_model, resolve_provider_model

    pm = resolve_provider_model({"provider": "ollama", "model": "llama3.1"})
    built = build_adk_model(pm)
    assert isinstance(built, LiteLlm)
    assert built.model == "ollama/llama3.1"


# ---------------------------------------------------------------------------
# Model override graph rewrite
# ---------------------------------------------------------------------------


def test_apply_model_override_retargets_llm_nodes_only():
    from app.services.run_authoring import apply_model_override

    graph = {
        "nodes": [
            {
                "id": "a",
                "data": {"nodeType": "agent", "provider": "google", "model": "gemini-2.5-flash"},
            },
            {"id": "t", "data": {"nodeType": "transform", "template": "x"}},
            {
                "id": "e",
                "data": {"nodeType": "evaluation", "modelProvider": "google", "model": "g"},
            },
        ],
        "edges": [],
    }
    rewritten = apply_model_override(graph, {"provider": "ollama", "model": "llama3.1"})

    by_id = {n["id"]: n["data"] for n in rewritten["nodes"]}
    assert by_id["a"]["provider"] == "ollama"
    assert by_id["a"]["model"] == "llama3.1"
    assert by_id["a"]["modelProvider"] == "ollama"
    # Deterministic nodes and evaluation judges are untouched — a matrix must
    # not move the scorer it is comparing candidates against.
    assert by_id["t"] == {"nodeType": "transform", "template": "x"}
    assert by_id["e"]["model"] == "g"
    # The stored graph is never mutated in place.
    assert graph["nodes"][0]["data"]["provider"] == "google"


def test_apply_model_override_drops_foreign_credentials_and_base():
    from app.services.run_authoring import apply_model_override

    graph = {
        "nodes": [
            {
                "id": "a",
                "data": {
                    "nodeType": "agent",
                    "provider": "openai",
                    "credentialId": "cred-1",
                    "credentialName": "openai-key",
                    "apiBase": "https://custom-openai/v1",
                },
            }
        ],
        "edges": [],
    }
    rewritten = apply_model_override(graph, {"provider": "ollama", "model": "llama3.1"})
    data = rewritten["nodes"][0]["data"]
    assert "credentialId" not in data
    assert "credentialName" not in data
    assert "apiBase" not in data

    # A same-provider model swap keeps the binding and endpoint.
    rewritten = apply_model_override(graph, {"provider": "openai", "model": "gpt-4o-mini"})
    data = rewritten["nodes"][0]["data"]
    assert data["credentialId"] == "cred-1"
    assert data["apiBase"] == "https://custom-openai/v1"
    assert data["model"] == "gpt-4o-mini"


# ---------------------------------------------------------------------------
# Persisted model_override → executor wiring
# ---------------------------------------------------------------------------


def _seed_workflow_run(model_override: dict | None) -> str:
    db = SessionLocal()
    try:
        wf = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="MX")
        db.add(wf)
        db.flush()
        graph = valid_graph(
            [
                {
                    "id": "echo",
                    "data": {
                        "nodeType": "transform",
                        "transformTemplate": "{{input.text}}",
                    },
                }
            ]
        )
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1, graph_json=graph
        )
        db.add(version)
        db.flush()
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=version.id,
            status="pending",
            input_text="hello",
            authoring_overrides_json=(
                {"model_override": model_override} if model_override else None
            ),
        )
        db.add(run)
        db.commit()
        return str(run.id)
    finally:
        db.close()


def test_execute_run_applies_persisted_model_override(monkeypatch):
    """The override rides the run row (worker-mode path) and reaches
    apply_model_override before compile."""
    from app.services import executor, run_authoring

    calls: list[dict] = []
    real = run_authoring.apply_model_override

    def spy(graph_json, override):
        calls.append(dict(override))
        return real(graph_json, override)

    monkeypatch.setattr(run_authoring, "apply_model_override", spy)

    run_id = _seed_workflow_run({"provider": "ollama", "model": "llama3.1"})
    asyncio.run(executor.execute_run(UUID(run_id)))

    assert calls == [{"provider": "ollama", "model": "llama3.1"}]
    db = SessionLocal()
    try:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == UUID(run_id)).first()
        assert run.status == "completed"
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Experiment matrix: API validation + runner aggregation
# ---------------------------------------------------------------------------


def _api_scaffold() -> dict:
    """Workflow + version + dataset with one item via the real API."""
    wf = client.post(
        "/api/workflows",
        json={
            "name": "Matrix WF",
            "graph_json": valid_graph(
                [{"id": "a", "data": {"nodeType": "agent", "instruction": "reply"}}]
            ),
        },
    )
    assert wf.status_code in (200, 201), wf.text
    wf_body = wf.json()
    versions = client.get(f"/api/workflows/{wf_body['id']}/versions").json()
    version_id = versions[0].get("id") or versions[0].get("version_id")
    assert version_id, versions
    ds = client.post("/api/datasets", json={"workflow_id": wf_body["id"], "name": "DS"})
    assert ds.status_code == 201, ds.text
    dataset_id = ds.json()["id"]
    item = client.post(
        f"/api/datasets/{dataset_id}/items", json={"input_text": "hello"}
    )
    assert item.status_code == 201, item.text
    return {"workflow_id": wf_body["id"], "version_id": version_id, "dataset_id": dataset_id}


def test_matrix_experiment_api_validation():
    ids = _api_scaffold()
    base = {
        "workflow_id": ids["workflow_id"],
        "dataset_id": ids["dataset_id"],
        "version_id": ids["version_id"],
        "kind": "batch",
    }
    ok = client.post(
        "/api/experiments",
        json={
            **base,
            "models": [
                {"provider": "google", "model": "gemini-2.5-flash"},
                {"provider": "ollama", "model": "llama3.1"},
            ],
        },
    )
    assert ok.status_code == 201, ok.text
    # Options ride in summary_json until the runner overwrites it.
    assert ok.json()["summary"]["model_matrix"][1]["model"] == "llama3.1"

    bad_provider = client.post(
        "/api/experiments", json={**base, "models": [{"provider": "bogus", "model": "x"}]}
    )
    assert bad_provider.status_code == 400

    empty = client.post("/api/experiments", json={**base, "models": []})
    assert empty.status_code == 400

    blank_model = client.post(
        "/api/experiments", json={**base, "models": [{"provider": "ollama", "model": "  "}]}
    )
    assert blank_model.status_code == 400


def _seed_matrix_experiment(kind: str, matrix: list[dict]) -> tuple[str, str]:
    """Experiment + parents seeded directly; returns (experiment_id, run-version-id)."""
    db = SessionLocal()
    try:
        wf = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="MX WF")
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1, graph_json={"nodes": [], "edges": []}
        )
        db.add(version)
        baseline = None
        if kind == "regression":
            baseline = models.WorkflowVersion(
                id=uuid4(), workflow_id=wf.id, version_number=2, graph_json={"nodes": [], "edges": []}
            )
            db.add(baseline)
        dataset = models.Dataset(
            id=uuid4(), user_id=DEFAULT_DEV_USER_ID, workflow_id=wf.id, name="MX DS"
        )
        db.add(dataset)
        db.flush()
        for text in ("q1", "q2"):
            db.add(models.DatasetItem(dataset_id=dataset.id, input_text=text))
        exp = models.Experiment(
            id=uuid4(),
            user_id=DEFAULT_DEV_USER_ID,
            workflow_id=wf.id,
            dataset_id=dataset.id,
            version_id=version.id,
            baseline_version_id=baseline.id if baseline else None,
            kind=kind,
            status="pending",
            summary_json={"model_matrix": matrix, "max_eval_drop": 0.5},
        )
        db.add(exp)
        db.commit()
        return str(exp.id), str(version.id)
    finally:
        db.close()


def _fake_execute(scores_by_model: dict[str, float]):
    """execute_run stand-in: completes each item run with a per-model score."""

    async def _exec(run_id):
        db = SessionLocal()
        try:
            run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
            override = (run.authoring_overrides_json or {}).get("model_override") or {}
            model = override.get("model", "baseline")
            run.status = "completed"
            run.final_output = "ok"
            run.metrics_json = {
                "eval_aggregate": scores_by_model.get(model, 4.0),
                "latency_ms": 120,
                "total_cost_usd": 0.01,
                "total_tokens": 80,
            }
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()

    return _exec


def test_run_experiment_matrix_aggregates_per_model(monkeypatch):
    from app.services import experiment_runner

    monkeypatch.setattr(
        experiment_runner,
        "execute_run",
        _fake_execute({"gemini-2.5-flash": 4.5, "llama3.1": 3.0}),
    )
    exp_id, version_id = _seed_matrix_experiment(
        "batch",
        [
            {"provider": "google", "model": "gemini-2.5-flash"},
            {"provider": "ollama", "model": "llama3.1"},
        ],
    )
    asyncio.run(experiment_runner.run_experiment(UUID(exp_id)))

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(models.Experiment.id == UUID(exp_id)).first()
        assert exp.status == "completed"
        summary = exp.summary_json
        matrix = summary["matrix"]
        assert len(matrix) == 2
        assert matrix[0]["model"] == "gemini-2.5-flash"
        assert matrix[0]["avg_eval"] == 4.5
        assert matrix[0]["items"] == 2
        assert matrix[0]["total_cost_usd"] == 0.02
        assert matrix[1]["model"] == "llama3.1"
        assert matrix[1]["avg_eval"] == 3.0
        # The existing result shape is preserved: candidate mirrors entry 0.
        assert summary["candidate"]["model"] == "gemini-2.5-flash"
        assert summary["candidate"]["avg_eval"] == 4.5
        assert len(summary["rows"]) == 2

        # Every item run carried its pair's persisted override.
        runs = (
            db.query(models.WorkflowRun)
            .filter(models.WorkflowRun.workflow_version_id == UUID(version_id))
            .all()
        )
        overrides = {
            (r.authoring_overrides_json or {}).get("model_override", {}).get("model")
            for r in runs
        }
        assert overrides == {"gemini-2.5-flash", "llama3.1"}
    finally:
        db.close()


def test_run_experiment_matrix_regression_gates_each_pair(monkeypatch):
    from app.services import experiment_runner

    # Baseline scores 4.0; llama3.1 drops below the 0.5 threshold, flash holds.
    monkeypatch.setattr(
        experiment_runner,
        "execute_run",
        _fake_execute({"gemini-2.5-flash": 4.0, "llama3.1": 3.0, "baseline": 4.0}),
    )
    exp_id, _ = _seed_matrix_experiment(
        "regression",
        [
            {"provider": "google", "model": "gemini-2.5-flash"},
            {"provider": "ollama", "model": "llama3.1"},
        ],
    )
    asyncio.run(experiment_runner.run_experiment(UUID(exp_id)))

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(models.Experiment.id == UUID(exp_id)).first()
        summary = exp.summary_json
        assert summary["matrix"][0]["verdict"]["passed"] is True
        assert summary["matrix"][1]["verdict"]["passed"] is False
        # Rolled-up gate verdict fails when any pair regresses.
        assert summary["verdict"]["passed"] is False
        assert any("ollama/llama3.1" in r for r in summary["verdict"]["reasons"])
    finally:
        db.close()

    gate = client.get(f"/api/experiments/{exp_id}/gate")
    assert gate.json()["status"] == "failed"
