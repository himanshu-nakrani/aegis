import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import valid_graph

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_and_list_workflow():
    response = client.post(
        "/api/workflows",
        json={
            "name": "Test",
            "graph_json": valid_graph(
                [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Calc", "nodeType": "tool", "toolType": "calculator"},
                    }
                ],
            ),
        },
    )
    assert response.status_code == 200
    workflow_id = response.json()["id"]

    listed = client.get("/api/workflows")
    assert listed.status_code == 200
    assert any(item["id"] == workflow_id for item in listed.json())


def test_create_run_requires_gemini_for_agent_workflow(monkeypatch):
    monkeypatch.setattr("app.config.settings.google_api_key", "")

    workflow = client.post(
        "/api/workflows",
        json={
            "name": "Agent flow",
            "graph_json": valid_graph(
                [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Agent", "nodeType": "agent"},
                    }
                ],
            ),
        },
    ).json()

    run_response = client.post(
        "/api/runs",
        json={"workflow_id": workflow["id"], "input_text": "hello"},
    )
    assert run_response.status_code == 400
    assert "GOOGLE_API_KEY" in run_response.json()["detail"]


def test_published_invoke_accepts_serialized_json_input():
    workflow = client.post(
        "/api/workflows",
        json={
            "name": "Webhook flow",
            "graph_json": valid_graph(
                [
                    {
                        "id": "schema",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "label": "Input Schema",
                            "nodeType": "input_schema",
                            "inputFields": [{"key": "message", "type": "string", "required": True}],
                        },
                    },
                    {
                        "id": "n1",
                        "position": {"x": 200, "y": 0},
                        "data": {
                            "label": "Transform",
                            "nodeType": "transform",
                            "transformTemplate": "{{input.message}}",
                        },
                    },
                ],
                [
                    {"id": "e1", "source": "schema", "target": "n1"},
                ],
                entry_id="schema",
                exit_id="n1",
            ),
        },
    ).json()

    version_id = workflow["latest_version"]["id"]
    published = client.post(f"/api/workflows/{workflow['id']}/publish", json={"version_id": version_id})
    assert published.status_code == 200, published.text
    issued = client.post(f"/api/workflows/{workflow['id']}/deploy/credentials/invoke_key")
    assert issued.status_code == 200, issued.text
    credential = issued.json()
    response = client.post(
        f"/v1/workflows/{workflow['id']}/invoke",
        json={"input": '{"message":"hello from webhook"}'},
        headers={
            "X-Aegis-Invoke-Key": credential["secret"],
            "X-Aegis-Deployment-ID": credential["deployment_id"],
            "X-Aegis-Version-ID": credential["version_id"],
        },
    )
    assert response.status_code == 200, response.text
    run = client.get(f"/api/runs/{response.json()['run_id']}").json()
    assert run["workflow_version_id"] == version_id
    assert run["input_text"] == '{"message":"hello from webhook"}'

def test_meta_models_catalog(monkeypatch):
    monkeypatch.setattr("app.config.settings.google_api_key", "test-key")
    response = client.get("/api/meta/models")
    assert response.status_code == 200
    providers = {entry["provider"]: entry for entry in response.json()["providers"]}
    assert set(providers) == {
        "google",
        "openai",
        "anthropic",
        "fireworks",
        "openrouter",
        "featherless",
        "vercel",
        "ollama",
    }
    assert providers["ollama"]["configured"] is True
    assert providers["ollama"]["needs_credential"] is False
    assert providers["google"]["configured"] is True
    assert providers["google"]["default"]
    assert "gpt-4o" in providers["openai"]["models"]
    assert any(m.startswith("claude-") for m in providers["anthropic"]["models"])


def test_concurrent_version_saves_produce_unique_numbers(tmp_path):
    """Two racing POST .../versions must not create duplicate version_numbers."""
    import threading

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.database import Base, get_db
    from app.main import app as application
    from fastapi.testclient import TestClient as TC

    # Isolated file DB: create_all picks up the model-level unique
    # constraint (production gets it from migration 029). The shared
    # test.db predates the constraint and may hold legacy duplicates.
    engine = create_engine(f"sqlite:///{tmp_path}/race.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)

    def database():
        db = sessions()
        try:
            yield db
        finally:
            db.close()

    previous = application.dependency_overrides.get(get_db)
    application.dependency_overrides[get_db] = database
    try:
        isolated = TC(application)
        resp = isolated.post(
            "/api/workflows",
            json={
                "name": "Race",
                "graph_json": valid_graph(
                    [{"id": "n1", "data": {"label": "T", "nodeType": "transform"}}],
                ),
            },
        )
        assert resp.status_code == 200, resp.text
        workflow_id = resp.json()["id"]
        graph = valid_graph(
            [{"id": "n1", "data": {"label": "T", "nodeType": "transform"}}],
        )

        barrier = threading.Barrier(2)
        results = []

        def _save():
            barrier.wait(timeout=10)
            r = isolated.post(
                f"/api/workflows/{workflow_id}/versions",
                json={"graph_json": graph, "save_as_new_version": True},
            )
            results.append(r.status_code)

        threads = [threading.Thread(target=_save) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert sorted(results) == [200, 200], results

        from uuid import UUID

        from app.db import models

        db = sessions()
        try:
            numbers = sorted(
                v.version_number
                for v in db.query(models.WorkflowVersion)
                .filter(models.WorkflowVersion.workflow_id == UUID(workflow_id))
                .all()
            )
        finally:
            db.close()
        assert numbers == [1, 2, 3], numbers
    finally:
        if previous is None:
            application.dependency_overrides.pop(get_db, None)
        else:
            application.dependency_overrides[get_db] = previous
        engine.dispose()
