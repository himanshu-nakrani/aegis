"""Slack event-webhook signature verification (R2-18).

Real Slack deliveries carry only ``X-Slack-Signature`` /
``X-Slack-Request-Timestamp`` — never an Aegis credential — so the Aegis
token/HMAC schemes in ``authenticate_event_webhook`` 401 every genuine Slack
event. The signing secret lives on the caller's Slack credential
(``config.signing_secret``, same record family as the outbound
``webhook_url``); verification is HMAC-SHA256 over
``v0:{timestamp}:{raw_body}`` with a ±5-minute replay window, mirroring
Slack's documented scheme.

Workspace binding is via the credential's ``team_id`` (Slack workspace id,
pasted from Slack admin alongside the signing secret): when set, the
payload's team must match or the delivery is rejected, so one workspace's
secret cannot fire another workspace's deployment. Team-less credentials
still verify (single-workspace setups keep working) but log a warning
nudging the operator to set ``team_id``.
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

def _payload_team_id(raw_body: bytes) -> str | None:
    """Slack workspace id for team binding (event_callback carries it)."""
    try:
        import json as _json

        parsed = _json.loads(bytes(raw_body or b"").decode("utf-8", errors="replace"))
    except Exception:
        return None
    if isinstance(parsed, dict):
        team = parsed.get("team_id")
        if isinstance(team, str) and team:
            return team
        event = parsed.get("event")
        if isinstance(event, dict):
            team = event.get("team")
            if isinstance(team, str) and team:
                return team
    return None


def _deployment_workflow_user(db: Session, deployment: models.WorkflowDeployment):
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == deployment.workflow_id)
        .first()
    )
    return workflow.user_id if workflow else None


def _webhook_trigger_binding(version) -> tuple[str | None, str | None]:
    """Deployment-side Slack binding from the published trigger node.

    Returns ``(event_credential_id, event_team_id)`` declared on the webhook
    trigger (``data.eventCredentialId`` / ``data.eventTeamId``). This is the
    binding that closes the cross-workspace hole for receivers without
    outbound Slack nodes: the deployment itself names its workspace.
    """
    graph = (getattr(version, "graph_json", None) or {}) if version else {}
    for node in graph.get("nodes", []) or []:
        data = node.get("data") or {}
        if data.get("nodeType") != "trigger":
            continue
        if str(data.get("triggerType") or "").lower() != "webhook":
            continue
        cid = data.get("eventCredentialId")
        team = data.get("eventTeamId")
        return (
            str(cid) if cid else None,
            str(team).strip() or None if team else None,
        )
    return (None, None)

def verify_slack_signature(
    db: Session,
    deployment: models.WorkflowDeployment,
    signature: str,
    timestamp: str,
    raw_body: bytes,
) -> None:
    """Verify a Slack event delivery against a bound Slack workspace.

    Raises 401 on any failure. Binding is explicit and fail-closed: the
    webhook trigger's ``eventCredentialId``/``eventTeamId`` and the
    credential's ``team_id`` must agree with the delivery — a holder of
    another workspace's secret cannot sign their way in by claiming the
    right team, because the credential itself must carry it. With nothing
    declared anywhere, deliveries fail closed (every Slack-events setup is
    new — pre-fix all Slack deliveries 401d). The url_verification
    handshake (no team in body) verifies signature-only; the echo creates
    no run. The timestamp window is the replay protection.
    """
    if not _SLACK_SIG_RE.fullmatch(signature or ""):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")
    if not (timestamp or "").isascii() or not timestamp.isdecimal() or len(timestamp) > 12:
        raise HTTPException(status_code=401, detail="Invalid Slack timestamp")
    if abs(time.time() - int(timestamp)) > _SLACK_TS_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Expired Slack timestamp")

    version = (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.id == deployment.version_id)
        .first()
    )
    bound_cred_id, bound_team = _webhook_trigger_binding(version)
    user_id = _deployment_workflow_user(db, deployment)
    candidates: list[tuple[str, str | None]] = []
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
            if bound_cred_id is not None and str(cred.id) != bound_cred_id:
                # Deployment names its credential: no other workspace's
                # secret validates here, even with a self-consistent team.
                continue
            try:
                from app.services.credentials import resolve_credential

                config = resolve_credential(cred) or {}
            except Exception:
                continue
            secret = config.get("signing_secret")
            if not (isinstance(secret, str) and secret):
                continue
            team = config.get("team_id")
            candidates.append((secret, team if isinstance(team, str) and team else None))
    if bound_cred_id is not None and not candidates:
        raise HTTPException(status_code=401, detail="Bound Slack credential unavailable")
    payload_team = _payload_team_id(raw_body)
    for secret, team in candidates:
        signed = f"v0:{timestamp}:".encode() + (raw_body or b"")
        expected = "v0=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            continue
        # Binding, strictest first:
        # 1. Trigger-declared credential already restricted candidates; the
        #    credential's own team (when set) must equal the declared team —
        #    otherwise a holder of another workspace's secret signs a body
        #    claiming the declared team and walks in.
        # 2. Trigger-declared team alone: the signing credential must carry
        #    the same team (a team-less credential at a team-bound deployment
        #    is misconfiguration, failed closed with a clear message).
        # 3. Credential team alone: the payload team must match it.
        # 4. Nothing declared anywhere: fail closed — every Slack-events
        #    setup is new (pre-fix all Slack deliveries 401d), so requiring
        #    an explicit binding costs no working legacy. The url_verification
        #    handshake (no team in body) verifies signature-only; the echo
        #    creates no run and follow-up events still enforce the team.
        if bound_team is not None:
            if team != bound_team:
                continue
            if payload_team is not None and payload_team != bound_team:
                continue
            return
        if team is not None:
            if payload_team is not None and payload_team != team:
                continue
            return
        if payload_team is None:
            return
    raise HTTPException(
        status_code=401,
        detail=(
            "Slack workspace binding required: set eventTeamId on the webhook "
            "trigger or team_id on the Slack credential"
            if not candidates
            else "Invalid Slack signature"
        ),
    )
