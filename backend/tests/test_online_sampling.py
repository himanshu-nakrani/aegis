import asyncio
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db import models
from app.db.database import Base, get_db
from app.main import app
from app.services import executor
from app.services.online_sampling import get_online_eval_sample_rate, set_online_eval_sample_rate


@pytest.fixture()
def sampling_sessions(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sampling.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    yield sessions
    engine.dispose()


@pytest.fixture()
def sampling_client(sampling_sessions, monkeypatch):
    def override_db():
        with sampling_sessions() as db:
            yield db

    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "aegis_api_key", "sampling-owner")
    monkeypatch.setattr(settings, "aegis_api_key_user_map", json.dumps({
        "sampling-editor": {"user_id": str(uuid4()), "role": "editor"},
        "sampling-viewer": {"user_id": str(uuid4()), "role": "viewer"},
    }))
    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_db
    try:
        yield TestClient(app)
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override


def test_override_persists_and_takes_precedence_over_env(sampling_sessions, monkeypatch):
    monkeypatch.setattr(settings, "online_eval_sample_rate", 0.37)
    with sampling_sessions() as db:
        assert get_online_eval_sample_rate(db) == 0.37
        set_online_eval_sample_rate(db, 0.8)
    monkeypatch.setattr(settings, "online_eval_sample_rate", 0.02)
    with sampling_sessions() as restarted_db:
        assert get_online_eval_sample_rate(restarted_db) == 0.8


@pytest.mark.parametrize("key", ["sampling-owner", "sampling-editor"])
def test_authorized_write_is_instance_wide(sampling_client, sampling_sessions, key):
    response = sampling_client.patch("/api/meta/ops-config", json={"online_eval_sample_rate": 0.6}, headers={"X-Aegis-API-Key": key})
    assert response.status_code == 200
    viewer_response = sampling_client.get("/api/meta/ops-config", headers={"X-Aegis-API-Key": "sampling-viewer"})
    assert viewer_response.json()["online_eval_sample_rate"] == 0.6
    with sampling_sessions() as worker_db:
        assert get_online_eval_sample_rate(worker_db) == 0.6


@pytest.mark.parametrize("key,status", [(None, 401), ("invalid-key", 401), ("sampling-viewer", 403)])
def test_unauthorized_write_cannot_change_rate(sampling_client, sampling_sessions, key, status):
    with sampling_sessions() as db:
        set_online_eval_sample_rate(db, 0.4)
    headers = {"X-Aegis-API-Key": key} if key else {}
    response = sampling_client.patch("/api/meta/ops-config", json={"online_eval_sample_rate": 1}, headers=headers)
    assert response.status_code == status
    with sampling_sessions() as db:
        assert get_online_eval_sample_rate(db) == 0.4


@pytest.mark.parametrize("raw_value", ["-0.01", "1.01", "NaN", "Infinity", "-Infinity", "1e999", '"0.5"', "true", "null"])
def test_invalid_rate_is_rejected_without_changing_override(sampling_client, sampling_sessions, raw_value):
    with sampling_sessions() as db:
        set_online_eval_sample_rate(db, 0.3)
    response = sampling_client.patch(
        "/api/meta/ops-config",
        content='{"online_eval_sample_rate":' + raw_value + '}',
        headers={"X-Aegis-API-Key": "sampling-owner", "Content-Type": "application/json"},
    )
    assert response.status_code == 422
    with sampling_sessions() as db:
        assert get_online_eval_sample_rate(db) == 0.3


@pytest.mark.asyncio
@pytest.mark.parametrize("rate,draw,inline_eval,output,expected", [
    (0, 0, False, "answer", False),
    (1, 0.9999, False, "answer", True),
    (1, 0, True, "answer", False),
    (1, 0, False, "", False),
    (0.25, 0.2499, False, "answer", True),
    (0.25, 0.25, False, "answer", False),
])
async def test_sampler_uses_persisted_rate_and_preserves_eligibility(
    sampling_sessions, monkeypatch, rate, draw, inline_eval, output, expected,
):
    with sampling_sessions() as db:
        workflow = models.Workflow(user_id=uuid4(), name="sampling")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(workflow_id=workflow.id, version_number=1, graph_json={"nodes": [], "edges": []})
        db.add(version)
        db.flush()
        run = models.WorkflowRun(workflow_version_id=version.id, input_text="question", status="completed")
        db.add(run)
        db.flush()
        run_id = run.id
        set_online_eval_sample_rate(db, rate)
    monkeypatch.setattr(settings, "online_eval_sample_rate", 1 if rate == 0 else 0)
    monkeypatch.setattr(executor, "_run_session", sampling_sessions)
    monkeypatch.setattr("random.random", lambda: draw)
    judged = []
    tasks = []

    async def judge(_run_id, _output, _request_text):
        judged.append(_run_id)

    def schedule(coro):
        task = asyncio.create_task(coro)
        tasks.append(task)
        return task

    monkeypatch.setattr(executor, "_sampled_online_eval", judge)
    monkeypatch.setattr(executor, "schedule_task", schedule)
    await executor._maybe_online_eval(run_id, output, "question", has_inline_eval=inline_eval)
    await asyncio.gather(*tasks)
    assert judged == ([run_id] if expected else [])
