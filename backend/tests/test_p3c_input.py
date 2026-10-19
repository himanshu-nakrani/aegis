"""P3-C / M8: request inputs that previously sailed through Pydantic and
crashed (or silently misbehaved) against Postgres column bounds.

Every case posts the previously-500ing / silently-bad payload and asserts a
4xx — the constraint lives at the schema layer so all endpoints sharing the
model are covered.
"""

from __future__ import annotations

import json
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from tests.conftest import valid_graph

client = TestClient(app)


def _post_raw_json(path: str, payload: dict):
    """Send a body with non-standard JSON (NaN/Infinity) — requests' strict
    serializer refuses them, but real HTTP clients (and the server's parser)
    happily carry them, which is exactly the bug vector under test."""
    return client.post(
        path,
        content=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )


def _make_workflow() -> dict:
    response = client.post(
        "/api/workflows",
        json={
            "name": f"p3c-{uuid4()}",
            "graph_json": valid_graph([{"id": "t1", "type": "text", "data": {"text": "hi"}}]),
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


def _make_run(workflow: dict) -> str:
    db = SessionLocal()
    try:
        run = models.WorkflowRun(
            id=uuid4(),
            workflow_version_id=UUID(workflow["latest_version"]["id"]),
            input_text="x",
            status="completed",
        )
        db.add(run)
        db.commit()
        return str(run.id)
    finally:
        db.close()


# ---------- alerts: NaN/inf thresholds must not persist as dead rules ----------

def test_alert_threshold_nan_rejected():
    response = _post_raw_json(
        "/api/alerts",
        {"metric": "failure_rate", "threshold": float("nan")},
    )
    assert response.status_code == 422


def test_alert_threshold_inf_rejected():
    response = _post_raw_json(
        "/api/alerts",
        {"metric": "failure_rate", "threshold": float("inf")},
    )
    assert response.status_code == 422


def test_alert_channel_url_bounded_to_column():
    response = client.post(
        "/api/alerts",
        json={
            "metric": "failure_rate",
            "threshold": 0.5,
            "channel_url": "https://x/" + "y" * 512,
        },
    )
    assert response.status_code == 422


def test_alert_metric_bounded_to_column():
    response = client.post(
        "/api/alerts",
        json={"metric": "m" * 49, "threshold": 0.5},
    )
    assert response.status_code == 422


def test_alert_update_threshold_nan_rejected():
    response = client.patch(
        f"/api/alerts/{uuid4()}",
        content=json.dumps({"threshold": float("nan")}),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_alert_rule_still_creatable():
    response = client.post(
        "/api/alerts",
        json={"metric": "failure_rate", "threshold": 0.5, "channel_url": "https://ok/hook"},
    )
    assert response.status_code == 201, response.text


# ---------- feedback: node_id lands in String(128) ----------

def test_feedback_node_id_bounded_to_column():
    run_id = _make_run(_make_workflow())
    response = client.post(
        "/api/feedback",
        json={"run_id": run_id, "rating": 1, "node_id": "n" * 129},
    )
    assert response.status_code == 422


def test_feedback_node_id_at_bound_accepted():
    run_id = _make_run(_make_workflow())
    response = client.post(
        "/api/feedback",
        json={"run_id": run_id, "rating": 1, "node_id": "n" * 128},
    )
    assert response.status_code == 201, response.text


# ---------- ingest: node/result columns + int32 bounds ----------

def test_ingest_node_id_bounded_to_column():
    response = client.post(
        "/v1/ingest/runs",
        json={
            "workflow_name": "p3c-ingest",
            "node_events": [{"node_id": "n" * 129}],
        },
    )
    assert response.status_code == 422


def test_ingest_latency_ms_int32_overflow():
    response = client.post(
        "/v1/ingest/runs",
        json={"workflow_name": "p3c-ingest", "latency_ms": 2_147_483_648},
    )
    assert response.status_code == 422


def test_ingest_total_cost_nan_rejected():
    response = _post_raw_json(
        "/v1/ingest/runs",
        {"workflow_name": "p3c-ingest", "total_cost_usd": float("nan")},
    )
    assert response.status_code == 422


def test_ingest_node_label_bounded_to_column():
    response = client.post(
        "/v1/ingest/runs",
        json={
            "workflow_name": "p3c-ingest",
            "node_events": [{"node_id": "n1", "label": "L" * 256}],
        },
    )
    assert response.status_code == 422


def test_ingest_within_bounds_still_accepted():
    response = client.post(
        "/v1/ingest/runs",
        json={
            "workflow_name": "p3c-ingest-ok",
            "input": "hi",
            "output": "hello",
            "latency_ms": 42,
            "total_tokens": 10,
            "total_cost_usd": 0.001,
            "node_events": [{"node_id": "n1", "label": "node one", "latency_ms": 5}],
        },
    )
    assert response.status_code == 201, response.text


# ---------- knowledge bulk: payload_json must stay bounded ----------

def test_knowledge_doc_text_capped():
    response = client.post(
        f"/api/workflows/{uuid4()}/knowledge/bulk",
        json={"documents": [{"text": "x" * 1_000_001}]},
    )
    assert response.status_code == 422


def test_knowledge_doc_title_capped():
    response = client.post(
        f"/api/workflows/{uuid4()}/knowledge/bulk",
        json={"documents": [{"title": "t" * 256, "text": "x"}]},
    )
    assert response.status_code == 422


def test_knowledge_bulk_total_chars_capped():
    docs = [{"text": "x" * 900_000} for _ in range(6)]  # 5.4M total > 5M cap
    response = client.post(
        f"/api/workflows/{uuid4()}/knowledge/bulk",
        json={"documents": docs},
    )
    assert response.status_code == 422


# ---------- workflows: name/webhook_url land in String(N) ----------

def test_workflow_name_bounded_to_column():
    response = client.post(
        "/api/workflows",
        json={
            "name": "w" * 256,
            "graph_json": valid_graph([{"id": "t1", "type": "text", "data": {"text": "hi"}}]),
        },
    )
    assert response.status_code == 422


def test_workflow_update_webhook_url_bounded():
    wf = _make_workflow()
    response = client.patch(
        f"/api/workflows/{wf['id']}",
        json={"webhook_url": "https://x/" + "y" * 512},
    )
    assert response.status_code == 422


# ---------- eval presets: finite score weights, bounded text ----------

def test_eval_preset_score_weight_nan_rejected():
    response = _post_raw_json(
        "/api/eval-presets",
        {
            "name": "p3c-preset",
            "label": "P3C",
            "criteria": "ok?",
            "score_weights": {"accuracy": float("nan")},
        },
    )
    assert response.status_code == 422


def test_eval_preset_eval_type_bounded_to_column():
    response = client.post(
        "/api/eval-presets",
        json={
            "name": "p3c-preset",
            "label": "P3C",
            "criteria": "ok?",
            "eval_type": "e" * 33,
        },
    )
    assert response.status_code == 422
