import pytest

from fastapi.testclient import TestClient

from app.main import app
from app.services.workflow_import import WorkflowImportError, normalize_workflow_import
from tests.conftest import valid_graph

client = TestClient(app)


def _sample_export(name: str = "Export Test") -> dict:
    graph = valid_graph(
        [
            {
                "id": "n1",
                "position": {"x": 100, "y": 0},
                "data": {"label": "Transform", "nodeType": "transform", "template": "hi"},
            }
        ],
    )
    return {
        "format": "aegis-workflow-v1",
        "workflow_id": "00000000-0000-0000-0000-000000000001",
        "name": name,
        "description": "Exported for tests",
        "version_number": 1,
        "graph_json": graph,
        "exported_at": "2026-06-30T12:00:00",
    }


def test_normalize_workflow_import_accepts_export():
    export = _sample_export()
    name, description, graph = normalize_workflow_import(export)
    assert name == "Export Test"
    assert description == "Exported for tests"
    assert "nodes" in graph
    assert any(n["data"]["nodeType"] == "trigger" for n in graph["nodes"])


def test_normalize_workflow_import_rejects_bad_format():
    export = _sample_export()
    export["format"] = "n8n-v1"
    try:
        normalize_workflow_import(export)
        assert False, "expected WorkflowImportError"
    except WorkflowImportError as exc:
        assert "Unsupported format" in str(exc)


@pytest.mark.parametrize("node_type", ["mcp", "while", "file_search", "unknown_action"])
def test_import_rejects_unconverted_behavioral_nodes(node_type):
    export = _sample_export()
    export["graph_json"]["nodes"][1]["data"]["nodeType"] = node_type

    response = client.post("/api/workflows/import", json=export)

    assert response.status_code == 400
    assert node_type in response.json()["detail"]


@pytest.mark.parametrize(
    "data",
    [
        {"nodeType": "agent", "tools": [{"kind": "node", "nodeId": "missing"}]},
        {"tools": [{"kind": "unsupported", "nodeId": "n1"}]},
        {"nodeType": "tool", "toolType": "mcp"},
    ],
)
def test_import_rejects_unknown_or_broken_tool_references(data):
    export = _sample_export()
    export["graph_json"]["nodes"][1]["data"] = data

    response = client.post("/api/workflows/import", json=export)

    assert response.status_code == 400


@pytest.mark.parametrize(
    "graph",
    [
        {"nodes": {}, "edges": []},
        {"nodes": [], "edges": {}},
        {"nodes": [None], "edges": []},
        {"nodes": [{"id": "bad", "data": []}], "edges": []},
        {"nodes": [{"id": "bad", "data": {"nodeType": None}}], "edges": []},
        {"nodes": [{"id": [], "data": {"nodeType": "agent"}}], "edges": []},
    ],
)
def test_import_rejects_malformed_graph_shapes(graph):
    response = client.post("/api/workflows/import", json={"graph_json": graph})

    assert response.status_code == 400


def test_import_rejects_edges_that_would_be_silently_discarded():
    export = _sample_export()
    export["graph_json"]["edges"].append(
        {"id": "lost-action", "source": "n1", "target": "missing-action"}
    )

    response = client.post("/api/workflows/import", json=export)

    assert response.status_code == 400
    assert "missing-action" in response.json()["detail"]


def test_import_rejects_duplicate_node_ids():
    export = _sample_export()
    export["graph_json"]["nodes"].append(export["graph_json"]["nodes"][1])

    response = client.post("/api/workflows/import", json=export)

    assert response.status_code == 400
    assert "Duplicate node id" in response.json()["detail"]


def test_import_preserves_dag_validation():
    export = _sample_export()
    graph = export["graph_json"]
    graph["edges"].append(
        {"id": "cycle", "source": graph["nodes"][-1]["id"], "target": "n1"}
    )

    response = client.post("/api/workflows/import", json=export)

    assert response.status_code == 400
    assert "acyclic" in response.json()["detail"]


def test_rejected_import_does_not_replace_existing_graph():
    export = _sample_export()
    created = client.post("/api/workflows/import", json=export).json()
    original_version = created["latest_version"]
    export["graph_json"]["nodes"][1]["data"]["nodeType"] = "while"

    response = client.post(
        f"/api/workflows/{created['id']}/import",
        json={**export, "save_as_new_version": False},
    )

    assert response.status_code == 400
    current = client.get(f"/api/workflows/{created['id']}").json()["latest_version"]
    assert current["id"] == original_version["id"]
    assert current["graph_json"] == original_version["graph_json"]



def _agent_tool_export():
    export = _sample_export("Agent Tools")
    export["graph_json"] = valid_graph([
        {"id": "agent", "data": {"instruction": "Calculate", "tools": [{"kind": "node", "nodeId": "calc", "requireApproval": True}], "maxToolIterations": 3, "tokenBudget": 100}},
        {"id": "calc", "position": {"x": 10, "y": 20}, "data": {"nodeType": "tool", "toolType": "calculator", "expression": "1+1"}},
    ])
    return export


def test_agent_tool_declarations_round_trip_save_export_import():
    export = _agent_tool_export()
    graph = export["graph_json"]
    created = client.post("/api/workflows", json={"name": export["name"], "graph_json": graph})
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    saved = client.post(f"/api/workflows/{workflow_id}/versions", json={"graph_json": graph})
    assert saved.status_code == 200
    downloaded = client.get(f"/api/workflows/{workflow_id}/export").json()
    imported = client.post("/api/workflows/import", json=downloaded)
    assert imported.status_code == 200
    assert imported.json()["latest_version"]["graph_json"] == graph
    assert "nodeType" not in graph["nodes"][1]["data"]


def test_rejected_tool_reference_import_does_not_replace_existing_graph():
    export = _agent_tool_export()
    created = client.post("/api/workflows/import", json=export)
    assert created.status_code == 200
    original = created.json()
    export["graph_json"]["nodes"][1]["data"]["tools"][0]["nodeId"] = "missing"

    response = client.post(f"/api/workflows/{original['id']}/import", json={**export, "save_as_new_version": False})
    assert response.status_code == 400
    current = client.get(f"/api/workflows/{original['id']}").json()["latest_version"]
    assert current["id"] == original["latest_version"]["id"]
    assert current["graph_json"] == original["latest_version"]["graph_json"]


def test_rejected_tool_reference_save_does_not_replace_existing_graph():
    export = _agent_tool_export()
    original = client.post("/api/workflows/import", json=export).json()
    export["graph_json"]["nodes"][1]["data"]["tools"][0]["nodeId"] = "missing"

    response = client.post(f"/api/workflows/{original['id']}/versions", json={"graph_json": export["graph_json"]})
    assert response.status_code == 400
    current = client.get(f"/api/workflows/{original['id']}").json()["latest_version"]
    assert current["graph_json"] == original["latest_version"]["graph_json"]


def test_mcp_workflow_admission_is_owner_bound_and_atomic():
    import uuid

    from app.auth.deps import DEFAULT_DEV_USER_ID
    from app.db import models
    from app.db.database import SessionLocal

    credential_id = uuid.uuid4()
    export = _sample_export("MCP Bindings")
    export["graph_json"] = valid_graph([{"id": "agent", "data": {"nodeType": "agent", "tools": [{"kind": "mcp", "credentialId": str(credential_id), "toolName": "lookup"}]}}])
    with SessionLocal() as db:
        credential = models.Credential(id=credential_id, user_id=uuid.uuid4(), name="MCP", type="mcp", config={}, mcp_tool_cache={"tools": [{"name": "lookup", "input_schema": {"type": "object"}}]})
        db.add(credential)
        db.commit()
        try:
            assert client.post("/api/workflows/import", json=export).status_code == 400
            credential.user_id = DEFAULT_DEV_USER_ID
            credential.mcp_tool_cache = None
            db.commit()
            assert client.post("/api/workflows", json={"name": "MCP", "graph_json": export["graph_json"]}).status_code == 400
            credential.mcp_tool_cache = {"tools": [{"name": "lookup", "input_schema": {"type": "object"}}]}
            db.commit()
            imported = client.post("/api/workflows/import", json=export)
            assert imported.status_code == 200
            original = imported.json()
            export["graph_json"]["nodes"][1]["data"]["tools"][0]["toolName"] = "missing"
            rejected = client.post(f"/api/workflows/{original['id']}/versions", json={"graph_json": export["graph_json"]})
            assert rejected.status_code == 400
            current = client.get(f"/api/workflows/{original['id']}").json()["latest_version"]
            assert current["graph_json"] == original["latest_version"]["graph_json"]
        finally:
            db.delete(credential)
            db.commit()


def test_import_workflow_creates_new_workflow():
    export = _sample_export("Imported Flow")
    response = client.post("/api/workflows/import", json=export)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Imported Flow"
    assert body["description"] == "Exported for tests"
    assert body["latest_version"]["graph_json"]["nodes"]
    assert body["id"] != export["workflow_id"]


def test_import_into_existing_workflow_versions_graph():
    created = client.post(
        "/api/workflows",
        json={
            "name": "Target",
            "graph_json": valid_graph(
                [
                    {
                        "id": "n1",
                        "position": {"x": 0, "y": 0},
                        "data": {"label": "Delay", "nodeType": "delay", "delaySeconds": 0.001},
                    }
                ],
            ),
        },
    ).json()
    workflow_id = created["id"]

    export = _sample_export("Replacement Graph")
    import_response = client.post(
        f"/api/workflows/{workflow_id}/import",
        json={**export, "save_as_new_version": True},
    )
    assert import_response.status_code == 200
    version = import_response.json()
    assert version["version_number"] == 2
    assert any(
        n["data"]["nodeType"] == "transform"
        for n in version["graph_json"]["nodes"]
    )


def test_export_workflow_matches_import_format():
    created = client.post(
        "/api/workflows",
        json={
            "name": "Round Trip",
            "description": "desc",
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
    ).json()
    workflow_id = created["id"]

    export_response = client.get(f"/api/workflows/{workflow_id}/export")
    assert export_response.status_code == 200
    export = export_response.json()
    assert export["format"] == "aegis-workflow-v1"
    assert export["name"] == "Round Trip"
    assert export["graph_json"]["nodes"]

    disposition = export_response.headers.get("content-disposition", "")
    assert "attachment" in disposition

    import_response = client.post("/api/workflows/import", json=export)
    assert import_response.status_code == 200
    imported = import_response.json()
    assert imported["name"] == "Round Trip"
    assert len(imported["latest_version"]["graph_json"]["nodes"]) == len(export["graph_json"]["nodes"])


def test_import_roundtrips_export_with_runtime_default_agent_type():
    graph = valid_graph(
        [
            {
                "id": "legacy-agent",
                "position": {"x": 240, "y": 0},
                "data": {"label": "Agent", "instruction": "Respond concisely."},
            }
        ]
    )
    created = client.post(
        "/api/workflows", json={"name": "Default Agent", "graph_json": graph}
    )
    assert created.status_code == 200
    workflow_id = created.json()["id"]
    exported = client.get(f"/api/workflows/{workflow_id}/export")
    assert exported.status_code == 200

    imported = client.post("/api/workflows/import", json=exported.json())

    assert imported.status_code == 200
    assert imported.json()["latest_version"]["graph_json"] == graph