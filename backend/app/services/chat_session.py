"""Hosted-chat session tokens: short-lived HMAC-bound deployment handles.

A deployment-scoped ``aegis_chat_`` exchange token (sha256-verified against
``workflow_deployments.chat_token_hash``) is traded once for a session token
carrying the pinned deployment/workflow/version ids plus an expiry, signed
HMAC-SHA256. Format::

    <b64url(JSON{dep,wf,ver,sid,exp})>.<hex hmac>

The signing key is the account/encryption secret when configured, else a
boot-random value — sessions are cookies, so a restart simply invalidates
outstanding sessions. Stateless: nothing is persisted per session.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from uuid import UUID

from app.config import settings

_boot_secret = secrets.token_hex(32)


def _session_secret() -> str:
    return settings.aegis_api_key or settings.app_encryption_key or _boot_secret


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def mint_session_token(
    deployment_id: UUID,
    workflow_id: UUID,
    version_id: UUID,
    *,
    ttl_hours: float | None = None,
) -> tuple[str, datetime]:
    """Mint a session token bound to one deployment's pinned version."""
    expires_at = datetime.now(timezone.utc).timestamp() + (
        (ttl_hours if ttl_hours is not None else settings.chat_session_ttl_hours) * 3600
    )
    payload = _b64url(
        json.dumps(
            {
                "dep": str(deployment_id),
                "wf": str(workflow_id),
                "ver": str(version_id),
                "sid": secrets.token_urlsafe(16),
                "exp": int(expires_at),
            },
            separators=(",", ":"),
        ).encode()
    )
    signature = hmac.new(_session_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}", datetime.fromtimestamp(int(expires_at), timezone.utc)


def verify_session_token(token: str) -> dict | None:
    """Return the bound claims when the signature and expiry hold, else None."""
    try:
        payload, signature = token.split(".", 1)
        expected = hmac.new(
            _session_secret().encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(_b64url_decode(payload))
        if int(claims["exp"]) < time.time():
            return None
        # Normalize the bound ids — malformed shapes fail closed.
        return {
            "dep": str(UUID(claims["dep"])),
            "wf": str(UUID(claims["wf"])),
            "ver": str(UUID(claims["ver"])),
            "sid": str(claims["sid"]),
            "exp": int(claims["exp"]),
        }
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
