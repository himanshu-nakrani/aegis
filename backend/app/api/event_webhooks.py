"""Inbound event webhooks: ``POST /v1/webhooks/{workflow_id}``.

The generic inbound-app trigger primitive. The request body becomes the run
input — ``input.event`` holds the parsed JSON payload (``input.body`` the raw
text), so trigger expressions can bind ``{{input.event.<field>}}``.

Authentication is the deployment credential scheme (no account key): either
``X-Aegis-Event-Token`` (the scoped invoke key) or raw-body HMAC
(``X-Aegis-Timestamp``/``X-Aegis-Nonce``/``X-Aegis-Signature``) over
``POST\\n{path}\\n{deployment_id}\\n{ts}\\n{nonce}\\n`` + body — see
``deployments.authenticate_event_webhook``.

Slack's ``url_verification`` handshake is answered without auth (it carries a
challenge, not an event); ``?source=slack`` (or Slack's own signature headers)
also lifts ``event.text``/``user``/``channel`` into ``input.slack``.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.executor import schedule_run
from app.services.invoke_runner import create_event_run as _create_event_run
from app.services.run_concurrency import schedule_committed_run
from app.config import settings

router = APIRouter(tags=["webhooks"])

_MAX_BODY_BYTES = 1_048_576

def _event_source(headers: dict[str, str], explicit: str | None) -> str | None:
    if explicit:
        return explicit.strip().lower() or None
    if "x-slack-signature" in headers or "x-slack-retry-num" in headers:
        return "slack"
    return None


def _build_input(body_text: str, source: str | None) -> tuple[dict[str, Any], dict | None]:
    """Map the raw body into the run's ``input`` payload.

    Returns ``(input_payload, url_verification_challenge_response)``.
    """
    parsed: Any = None
    try:
        parsed = json.loads(body_text)
    except (json.JSONDecodeError, UnicodeDecodeError):
        parsed = None

    if isinstance(parsed, dict) and parsed.get("type") == "url_verification":
        # Slack endpoint handshake — not an event, echo and skip auth/run.
        return {}, {"challenge": parsed.get("challenge")}

    payload: dict[str, Any] = {
        "trigger": "webhook",
        "event": parsed,
        "body": body_text,
    }
    if source:
        payload["source"] = source
    if source == "slack" and isinstance(parsed, dict):
        event = parsed.get("event")
        if isinstance(event, dict):
            payload["slack"] = {
                "type": event.get("type"),
                "text": event.get("text"),
                "user": event.get("user"),
                "channel": event.get("channel"),
                "ts": event.get("ts") or parsed.get("event_id"),
            }
    return payload, None


@router.post("/v1/webhooks/{workflow_id}", status_code=202)
async def receive_event_webhook(
    workflow_id: UUID,
    request: Request,
    source: str | None = Query(default=None, description="Source mapper (e.g. slack)"),
    db: Session = Depends(get_db),
):
    """Start a run on the published version from an inbound app event."""
    raw_body = await request.body()
    if len(raw_body) > _MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Event payload too large")

    headers = dict(request.headers)
    try:
        body_text = raw_body.decode("utf-8")
    except UnicodeDecodeError:
        body_text = raw_body.decode("utf-8", errors="replace")

    source = _event_source(headers, source)
    input_payload, challenge = _build_input(body_text, source)
    if challenge is not None:
        # Slack handshake still verifies: an unauthenticated echo lets anyone
        # probe/verify the URL. Reuse the request-scoped session — no commit
        # happens on this path, so sharing it is safe.
        from app.services.deployments import authenticate_event_webhook as _authenticate

        _authenticate(db, workflow_id, headers, raw_body, request.url.path)
        # Slack expects a 200 with the challenge echoed back.
        return JSONResponse(challenge, status_code=200)
    create = asyncio.ensure_future(
        asyncio.to_thread(
            _create_event_run,
            db,
            workflow_id,
            headers,
            raw_body,
            request.url.path,
            input_payload=input_payload,
            tags=["event", f"event:{input_payload.get('source')}"] if input_payload.get("source") else ["event"],
        )
    )
    try:
        run_id, version_number = await asyncio.shield(create)
    except asyncio.CancelledError:
        # to_thread is not cancellable — the commit still lands. Preserve the
        # pre-thread contract (a committed run always gets scheduled).
        run_id, _ = await create
        if settings.run_execution_mode != "worker":
            schedule_run(run_id)
        raise

    if settings.run_execution_mode != "worker":
        if not await schedule_committed_run(run_id):
            raise HTTPException(
                status_code=429,
                detail=f"Too many concurrent runs (limit: {settings.max_concurrent_runs})",
            )

    return {"run_id": str(run_id), "status": "pending", "version": version_number}
