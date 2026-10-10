"""Phase 5 #2: prompt registry CRUD/versioning, promptRef resolution, playground.

LLM calls are mocked — no external provider traffic.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services import prompt_service

client = TestClient(app)


def _create(name: str = "greeter", template: str = "Say hi to {{name}}") -> dict:
    # Unique-per-call: rows persist in the shared test.db across suite runs, and
    # prompt names are unique per user — a bare literal collides on re-run.
    resp = client.post("/api/prompts", json={"name": f"{name}-{uuid4().hex[:8]}", "template": template})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_prompt_crud_and_versioning():
    prompt = _create()
    assert prompt["current_version"] == 1
    assert prompt["versions"][0]["template"] == "Say hi to {{name}}"
    assert prompt["versions"][0]["variables"] == ["name"]

    # List reflects the new prompt.
    listed = client.get("/api/prompts")
    assert listed.status_code == 200
    assert any(p["id"] == prompt["id"] for p in listed.json())

    # New version advances the current pointer.
    resp = client.post(
        f"/api/prompts/{prompt['id']}/versions",
        json={"template": "Hello {{name}}, welcome to {{place}}", "notes": "v2"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["version"] == 2

    detail = client.get(f"/api/prompts/{prompt['id']}").json()
    assert detail["current_version"] == 2
    assert detail["version_count"] == 2
    assert detail["versions"][1]["variables"] == ["name", "place"]

    # Pinned version fetch works; rollback repoints current_version.
    v1 = client.get(f"/api/prompts/{prompt['id']}/versions/1")
    assert v1.status_code == 200
    assert v1.json()["template"] == "Say hi to {{name}}"

    rb = client.post(f"/api/prompts/{prompt['id']}/versions/1/rollback")
    assert rb.status_code == 200
    assert rb.json()["current_version"] == 1
    assert rb.json()["version_count"] == 2  # rollback keeps history

    # Missing prompt / missing version 404.
    assert client.get(f"/api/prompts/{uuid4()}").status_code == 404
    assert client.get(f"/api/prompts/{prompt['id']}/versions/99").status_code == 404


def test_prompt_ref_resolves_at_enrich(monkeypatch=None):
    prompt = _create("support", "Be terse for {{topic}}")
    db = SessionLocal()
    try:
        graph = {
            "nodes": [
                {
                    "id": "a1",
                    "data": {
                        "nodeType": "agent",
                        "instruction": "inline fallback",
                        "promptRef": {"prompt_id": prompt["id"]},
                    },
                },
                {
                    "id": "a2",
                    "data": {
                        "nodeType": "agent",
                        "instruction": "keep me",
                        "promptRef": {"prompt_id": str(uuid4())},
                    },
                },
                {"id": "a3", "data": {"nodeType": "agent", "instruction": "untouched"}},
            ]
        }
        prompt_service.resolve_prompt_refs(graph, db, DEFAULT_DEV_USER_ID)
    finally:
        db.close()
    assert graph["nodes"][0]["data"]["instruction"] == "Be terse for {{topic}}"
    # Unresolvable ref falls back to the inline instruction (non-breaking).
    assert graph["nodes"][1]["data"]["instruction"] == "keep me"
    assert graph["nodes"][2]["data"]["instruction"] == "untouched"


def test_prompt_ref_pinned_version():
    prompt = _create("pinned", "v1 text")
    client.post(f"/api/prompts/{prompt['id']}/versions", json={"template": "v2 text"})
    db = SessionLocal()
    try:
        graph = {
            "nodes": [
                {
                    "id": "a1",
                    "data": {
                        "nodeType": "agent",
                        "promptRef": {"prompt_id": prompt["id"], "version": 1},
                    },
                }
            ]
        }
        prompt_service.resolve_prompt_refs(graph, db, DEFAULT_DEV_USER_ID)
    finally:
        db.close()
    # current_version is 2 but the pin forces v1.
    assert graph["nodes"][0]["data"]["instruction"] == "v1 text"


def test_playground_inline_template(monkeypatch):
    from app.api import playground

    calls = []

    def fake_generate(pm, *, system_instruction, contents, extra_config=None):
        calls.append((pm.provider, pm.model, contents))
        return f"out-{pm.provider}-{pm.model}"

    monkeypatch.setattr(playground, "generate_text", fake_generate)

    resp = client.post(
        "/api/playground/run",
        json={
            "template": "Translate {{word}}",
            "variables": {"word": "hola"},
            "models": [
                {"provider": "google", "model": "gemini-test"},
                {"provider": "openai", "model": "gpt-test"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rendered_template"] == "Translate hola"
    assert [r["output"] for r in body["results"]] == [
        "out-google-gemini-test",
        "out-openai-gpt-test",
    ]
    assert calls[0][2] == "Translate hola"


def test_playground_from_prompt_and_variant_error(monkeypatch):
    prompt = _create("pg", "Summarize {{doc}}")

    from app.api import playground

    def fake_generate(pm, *, system_instruction, contents, extra_config=None):
        if pm.provider == "openai":
            raise RuntimeError("boom")
        return "ok"

    monkeypatch.setattr(playground, "generate_text", fake_generate)

    resp = client.post(
        "/api/playground/run",
        json={
            "prompt_id": prompt["id"],
            "variables": {"doc": "the thing"},
            "models": [
                {"provider": "google", "model": "m1"},
                {"provider": "openai", "model": "m2"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["prompt_version"] == 1
    assert body["results"][0]["output"] == "ok"
    assert body["results"][1]["error"] == "boom"

    # Neither template nor prompt_id -> 400.
    bad = client.post(
        "/api/playground/run",
        json={"models": [{"provider": "google", "model": "m"}]},
    )
    assert bad.status_code == 400


def test_render_prompt_unknown_vars_left_literal():
    out = prompt_service.render_prompt("A {{x}} B {{y}}", {"x": "1"})
    assert out == "A 1 B {{y}}"
