"""Slack event-webhook signature verification (R2-18).

Real Slack deliveries carry only ``X-Slack-Signature`` /
``X-Slack-Request-Timestamp`` — never an Aegis credential — so the Aegis
token/HMAC schemes in ``authenticate_event_webhook`` 401 every genuine Slack
event. The signing secret lives on the caller's Slack credential
(``config.signing_secret``, same record family as the outbound
``webhook_url``); verification is HMAC-SHA256 over
``v0:{timestamp}:{raw_body}`` with a ±5-minute replay window, mirroring
Slack's documented scheme.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import time
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import models

_SLACK_SIG_RE = re.compile(r"v0=[a-f0-9]{64}")
_SLACK_TS_WINDOW_SECONDS = 300


def _deployment_workflow_user(db: Session, deployment: models.WorkflowDeployment):
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == deployment.workflow_id)
        .first()
    )
    return workflow.user_id if workflow else None


def verify_slack_signature(
    db: Session,
    deployment: models.WorkflowDeployment,
    signature: str,
    timestamp: str,
    raw_body: bytes,
) -> None:
    """Verify a Slack event delivery against the owner's Slack credential.

    Raises 401 on any failure (missing/unparseable headers, stale timestamp,
    no Slack credential with a signing secret, signature mismatch). The
    timestamp window is the replay protection — no nonce receipt needed.
    """
    if not _SLACK_SIG_RE.fullmatch(signature or ""):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")
    if not (timestamp or "").isascii() or not timestamp.isdecimal() or len(timestamp) > 12:
        raise HTTPException(status_code=401, detail="Invalid Slack timestamp")
    if abs(time.time() - int(timestamp)) > _SLACK_TS_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Expired Slack timestamp")

    user_id = _deployment_workflow_user(db, deployment)
    secret: str | None = None
    if user_id is not None:
        creds = (
            db.query(models.Credential)
            .filter(
                models.Credential.user_id == user_id,
                models.Credential.type == "slack",
            )
            .all()
        )
        for cred in creds:
            try:
                from app.services.credentials import resolve_credential

                config = resolve_credential(cred) or {}
            except Exception:
                continue
            candidate = config.get("signing_secret")
            if isinstance(candidate, str) and candidate:
                secret = candidate
                break
    if not secret:
        raise HTTPException(status_code=401, detail="Slack signing secret not configured")

    signed = f"v0:{timestamp}:".encode() + (raw_body or b"")
    expected = "v0=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")
