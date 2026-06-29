import pytest
from fastapi.testclient import TestClient

from app.main import app

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
            "graph_json": {
                "nodes": [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Calc", "nodeType": "tool", "toolType": "calculator"},
                    }
                ],
                "edges": [],
            },
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
            "graph_json": {
                "nodes": [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Agent", "nodeType": "agent"},
                    }
                ],
                "edges": [],
            },
        },
    ).json()

    run_response = client.post(
        "/api/runs",
        json={"workflow_id": workflow["id"], "input_text": "hello"},
    )
    assert run_response.status_code == 400
    assert "GOOGLE_API_KEY" in run_response.json()["detail"]