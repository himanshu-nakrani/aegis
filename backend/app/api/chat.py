"""Hosted-chat surface: exchange a deployment-scoped token for a session.

These endpoints are public by design — no account key. The ``aegis_chat_``
token (issued alongside the invoke key in the Deploy sheet) only exchanges
into a short-lived HMAC session; the session token carries the pinned
deployment/workflow/version so the client can never pick a different target.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import models
from app.db.database import get_db
from app.services.chat_session import mint_session_token, verify_session_token
from app.services.invoke_runner import InvokeRequestData, invoke_and_wait

router = APIRouter(tags=["chat"])


class ChatSessionRequest(BaseModel):
    deployment_id: UUID
    token: str = Field(min_length=1, max_length=256)


class ChatInvokeRequest(BaseModel):
    input: str = Field(min_length=1, max_length=20_000)
    session_id: str | None = Field(default=None, max_length=128)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/v1/chat/session")
def create_chat_session(payload: ChatSessionRequest, db: Session = Depends(get_db)):
    """Exchange an ``aegis_chat_`` token for a deployment-bound session token."""
    deployment = (
        db.query(models.WorkflowDeployment)
        .filter(models.WorkflowDeployment.id == payload.deployment_id)
        .first()
    )
    digest = hashlib.sha256(payload.token.encode()).hexdigest()
    # Constant-time digest compare plus expiry — a single uniform 401 keeps
    # existence/expiry indistinguishable to the caller.
    valid = (
        deployment is not None
        and deployment.chat_token_hash is not None
        and hmac.compare_digest(digest, deployment.chat_token_hash)
    )
    expires_at = deployment.chat_token_expires_at if valid else None
    if not valid or expires_at is None:
        raise HTTPException(status_code=401, detail="Invalid chat token")
    # SQLite round-trips naive datetimes; compare in aware UTC either way.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= _utcnow():
        raise HTTPException(status_code=401, detail="Invalid chat token")

    session_token, session_expires = mint_session_token(
        deployment.id, deployment.workflow_id, deployment.version_id
    )
    return {"session_token": session_token, "expires_at": session_expires.isoformat()}


@router.post("/v1/chat/invoke")
async def chat_invoke(
    payload: ChatInvokeRequest,
    x_aegis_chat_session: str | None = Header(default=None, alias="X-Aegis-Chat-Session"),
    db: Session = Depends(get_db),
):
    """Run the session's pinned workflow; the token — never the client — picks it."""
    claims = verify_session_token(x_aegis_chat_session or "")
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid chat session")

    request_data = InvokeRequestData(
        input=payload.input,
        session_id=payload.session_id,
        version_id=UUID(claims["ver"]),
    )
    # The session token already bound deployment+version after HMAC
    # verification, so the run is created under the internal auth path —
    # the credential legs (invoke key / webhook signature) don't apply.
    headers = {
        "x-aegis-deployment-id": claims["dep"],
        "x-aegis-version-id": claims["ver"],
    }
    raw_body = json.dumps(payload.model_dump()).encode()
    return await invoke_and_wait(
        db,
        UUID(claims["wf"]),
        request_data,
        headers,
        raw_body,
        "/v1/chat/invoke",
        internal=True,
    )
