"""Published deployments: one-time credentials and raw-body webhook authentication."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import models
from app.config import settings
from app.services.crypto import DecryptionError, decrypt_value, encrypt_value, encryption_enabled, is_encrypted

CredentialKind = Literal["invoke_key", "webhook_secret", "chat_token"]

WEBHOOK_WINDOW_SECONDS = 300


def owner_published_workflow(db: Session, workflow_id: UUID, user_id: UUID) -> models.Workflow:
    workflow = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id, models.Workflow.user_id == user_id
    ).with_for_update().first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not workflow.published_version_id:
        raise HTTPException(status_code=409, detail="Publish a version before deploying")
    version = db.query(models.WorkflowVersion).filter(
        models.WorkflowVersion.id == workflow.published_version_id,
        models.WorkflowVersion.workflow_id == workflow_id,
    ).first()
    if not version:
        raise HTTPException(status_code=409, detail="Published version no longer exists")
    return workflow


def sync_deployment(db: Session, workflow: models.Workflow) -> models.WorkflowDeployment:
    deployment = db.query(models.WorkflowDeployment).filter(
        models.WorkflowDeployment.workflow_id == workflow.id
    ).first()
    if deployment is None:
        deployment = models.WorkflowDeployment(
            workflow_id=workflow.id, version_id=workflow.published_version_id
        )
        db.add(deployment)
        db.flush()
    elif deployment.version_id != workflow.published_version_id:
        deployment.version_id = workflow.published_version_id
        deployment.invoke_key_hash = None
        deployment.webhook_secret_encrypted = None
        deployment.chat_token_hash = None
        deployment.chat_token_expires_at = None
        deployment.chat_token_revoked_at = datetime.now(timezone.utc)
    return deployment


def credential_status(deployment: models.WorkflowDeployment | None) -> dict:
    expires_at = deployment.chat_token_expires_at if deployment else None
    return {
        "deployment_id": str(deployment.id) if deployment else None,
        "invoke_key_active": bool(deployment and deployment.invoke_key_hash),
        "webhook_secret_active": bool(deployment and deployment.webhook_secret_encrypted),
        "chat_token_active": bool(deployment and deployment.chat_token_hash),
        "chat_token_expires_at": expires_at.isoformat() if expires_at else None,
    }


def issue_credential(db: Session, workflow: models.Workflow, kind: CredentialKind) -> tuple[models.WorkflowDeployment, str]:
    if kind == "webhook_secret" and not encryption_enabled():
        raise HTTPException(status_code=503, detail="Set a valid APP_ENCRYPTION_KEY before issuing webhook secrets")
    deployment = sync_deployment(db, workflow)
    secret = "aegis_chat_" + secrets.token_urlsafe(32) if kind == "chat_token" else (
        "aegis_inv_" if kind == "invoke_key" else "aegis_wh_"
    ) + secrets.token_urlsafe(32)
    if kind == "invoke_key":
        deployment.invoke_key_hash = hashlib.sha256(secret.encode()).hexdigest()
    elif kind == "chat_token":
        deployment.chat_token_hash = hashlib.sha256(secret.encode()).hexdigest()
        deployment.chat_token_expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.chat_token_ttl_days
        )
        deployment.chat_token_revoked_at = None
    else:
        encrypted = encrypt_value(secret)
        if not is_encrypted(encrypted):
            raise HTTPException(status_code=503, detail="Webhook secret encryption unavailable")
        deployment.webhook_secret_encrypted = encrypted
    return deployment, secret


def revoke_credential(db: Session, workflow: models.Workflow, kind: CredentialKind) -> models.WorkflowDeployment:
    deployment = sync_deployment(db, workflow)
    if kind == "invoke_key":
        deployment.invoke_key_hash = None
    elif kind == "chat_token":
        deployment.chat_token_hash = None
        deployment.chat_token_expires_at = None
        deployment.chat_token_revoked_at = datetime.now(timezone.utc)
    else:
        deployment.webhook_secret_encrypted = None
    return deployment


def authenticate_invoke(
    db: Session,
    workflow_id: UUID,
    version_id: UUID | None,
    headers: dict[str, str],
    raw_body: bytes,
    path: str,
    *,
    internal: bool = False,
) -> tuple[models.Workflow, models.WorkflowVersion]:
    """Authenticate the pinned target and consume a nonce in the run transaction.

    Locking the workflow serializes publish/rotation against run admission.
    The unique (deployment, nonce) receipt also rejects concurrent replays across
    API processes; it is committed atomically with the invoked run.

    ``internal=True`` is for callers that already authenticated out of band —
    the hosted-chat session token is HMAC-verified and bound to the deployment
    before it reaches here. It skips the invoke-key/webhook credential leg
    only; the deployment/version pin checks above still apply.
    """
    workflow = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).with_for_update().first()
    deployment = db.query(models.WorkflowDeployment).filter(
        models.WorkflowDeployment.workflow_id == workflow_id
    ).first()
    if not workflow or not workflow.published_version_id or not deployment:
        raise HTTPException(status_code=401, detail="Invalid deployment credentials")
    try:
        requested_deployment = UUID(headers.get("x-aegis-deployment-id", ""))
        requested_version = UUID(headers.get("x-aegis-version-id", ""))
    except ValueError:
        raise HTTPException(status_code=401, detail="Deployment and version headers are required") from None
    if (
        requested_deployment != deployment.id
        or requested_version != deployment.version_id
        or workflow.published_version_id != deployment.version_id
        or (version_id is not None and version_id != requested_version)
    ):
        raise HTTPException(status_code=401, detail="Invalid deployment target")
    version = db.query(models.WorkflowVersion).filter(
        models.WorkflowVersion.id == deployment.version_id,
        models.WorkflowVersion.workflow_id == workflow_id,
    ).first()
    if not version:
        raise HTTPException(status_code=401, detail="Invalid deployment target")

    if internal:
        return workflow, version

    key = headers.get("x-aegis-invoke-key")
    if key:
        digest = hashlib.sha256(key.encode()).hexdigest()
        if not deployment.invoke_key_hash or not hmac.compare_digest(digest, deployment.invoke_key_hash):
            raise HTTPException(status_code=401, detail="Invalid deployment credentials")
        return workflow, version

    timestamp = headers.get("x-aegis-timestamp", "")
    nonce = headers.get("x-aegis-nonce", "")
    signature = headers.get("x-aegis-signature", "")
    if not timestamp.isascii() or not timestamp.isdecimal() or len(timestamp) > 12:
        raise HTTPException(status_code=401, detail="Invalid webhook timestamp")
    if abs(time.time() - int(timestamp)) > WEBHOOK_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Expired webhook timestamp")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", nonce):
        raise HTTPException(status_code=401, detail="Invalid webhook nonce")
    encrypted = deployment.webhook_secret_encrypted
    if not encrypted or not is_encrypted(encrypted):
        raise HTTPException(status_code=401, detail="Invalid deployment credentials")
    try:
        secret = decrypt_value(encrypted)
    except DecryptionError:
        raise HTTPException(status_code=401, detail="Webhook secret unavailable") from None
    signed = (
        f"POST\n{path}\n{deployment.id}\n{deployment.version_id}\n{timestamp}\n{nonce}\n".encode()
        + raw_body
    )
    expected = "sha256=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not re.fullmatch(r"sha256=[a-f0-9]{64}", signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    now = datetime.now(timezone.utc)
    db.query(models.DeploymentWebhookReceipt).filter(
        models.DeploymentWebhookReceipt.expires_at < now
    ).delete(synchronize_session=False)
    try:
        db.add(models.DeploymentWebhookReceipt(
            deployment_id=deployment.id,
            nonce=nonce,
            expires_at=datetime.fromtimestamp(int(timestamp) + WEBHOOK_WINDOW_SECONDS + 1, timezone.utc),
        ))
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Webhook replay rejected") from None
    return workflow, version


def authenticate_event_webhook(
    db: Session,
    workflow_id: UUID,
    headers: dict[str, str],
    raw_body: bytes,
    path: str,
) -> tuple[models.Workflow, models.WorkflowDeployment, models.WorkflowVersion]:
    """Authenticate an inbound event webhook POST for a workflow.

    Unlike ``authenticate_invoke`` this is not deployment-header pinned — an
    external app only knows the workflow URL. Two credentials are accepted:

    - ``X-Aegis-Event-Token`` — the deployment's scoped invoke key (same
      sha256 digest check; rotating the invoke key rotates event tokens).
    - ``X-Aegis-Signature`` — raw-body HMAC over
      ``POST\\n{path}\\n{deployment_id}\\n{timestamp}\\n{nonce}\\n`` with the
      webhook signing secret, plus timestamp window + nonce replay receipt
      (same scheme as invoke; version pinning is implied by the deployment).
    """
    workflow = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    deployment = db.query(models.WorkflowDeployment).filter(
        models.WorkflowDeployment.workflow_id == workflow_id
    ).first()
    if (
        not workflow.published_version_id
        or not deployment
        or deployment.version_id != workflow.published_version_id
    ):
        raise HTTPException(status_code=403, detail="Event webhooks require a published deployment")
    version = db.query(models.WorkflowVersion).filter(
        models.WorkflowVersion.id == deployment.version_id,
        models.WorkflowVersion.workflow_id == workflow_id,
    ).first()
    if not version:
        raise HTTPException(status_code=403, detail="Event webhooks require a published deployment")

    token = headers.get("x-aegis-event-token")
    if token:
        digest = hashlib.sha256(token.encode()).hexdigest()
        if deployment.invoke_key_hash and hmac.compare_digest(digest, deployment.invoke_key_hash):
            return workflow, deployment, version
        raise HTTPException(status_code=401, detail="Invalid event token")

    timestamp = headers.get("x-aegis-timestamp", "")
    nonce = headers.get("x-aegis-nonce", "")
    signature = headers.get("x-aegis-signature", "")
    if not timestamp.isascii() or not timestamp.isdecimal() or len(timestamp) > 12:
        raise HTTPException(status_code=401, detail="Invalid webhook timestamp")
    if abs(time.time() - int(timestamp)) > WEBHOOK_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Expired webhook timestamp")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", nonce):
        raise HTTPException(status_code=401, detail="Invalid webhook nonce")
    encrypted = deployment.webhook_secret_encrypted
    if not encrypted or not is_encrypted(encrypted):
        raise HTTPException(status_code=401, detail="Invalid deployment credentials")
    try:
        secret = decrypt_value(encrypted)
    except DecryptionError:
        raise HTTPException(status_code=401, detail="Webhook secret unavailable") from None
    signed = (
        f"POST\n{path}\n{deployment.id}\n{timestamp}\n{nonce}\n".encode()
        + raw_body
    )
    expected = "sha256=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not re.fullmatch(r"sha256=[a-f0-9]{64}", signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    now = datetime.now(timezone.utc)
    db.query(models.DeploymentWebhookReceipt).filter(
        models.DeploymentWebhookReceipt.expires_at < now
    ).delete(synchronize_session=False)
    try:
        db.add(models.DeploymentWebhookReceipt(
            deployment_id=deployment.id,
            nonce=nonce,
            expires_at=datetime.fromtimestamp(int(timestamp) + WEBHOOK_WINDOW_SECONDS + 1, timezone.utc),
        ))
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Webhook replay rejected") from None
    return workflow, deployment, version
