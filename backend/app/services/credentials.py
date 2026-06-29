"""Named credential resolution for integration nodes."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models

SECRET_KEYS = frozenset(
    {
        "webhook_url",
        "password",
        "api_key",
        "token",
        "connection_url",
        "smtp_password",
    }
)


def mask_credential_config(cred_type: str, config: dict[str, Any]) -> dict[str, Any]:
    masked: dict[str, Any] = {}
    for key, value in (config or {}).items():
        if key in SECRET_KEYS and value:
            masked[key] = "••••••••"
        else:
            masked[key] = value
    return masked


def resolve_credential(record: dict[str, Any] | models.Credential | None) -> dict[str, Any]:
    if record is None:
        return {}
    if isinstance(record, models.Credential):
        return dict(record.config or {})
    return dict(record.get("config") or {})


def get_user_credential(
    db: Session,
    user_id: UUID,
    credential_id: UUID | None = None,
    name: str | None = None,
) -> models.Credential | None:
    query = db.query(models.Credential).filter(models.Credential.user_id == user_id)
    if credential_id:
        return query.filter(models.Credential.id == credential_id).first()
    if name:
        return query.filter(models.Credential.name == name).first()
    return None