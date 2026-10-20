"""Named credential resolution for integration nodes."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models
from app.services.crypto import DecryptionError, decrypt_value, encrypt_value

SECRET_KEYS = frozenset(
    {
        "webhook_url",
        "password",
        "api_key",
        "token",
        "connection_url",
        "smtp_password",
        "signing_secret",
    }
)


def _transform_config(value: Any, transform, *, secret: bool = False) -> Any:
    if isinstance(value, dict):
        return {
            key: _transform_config(child, transform, secret=secret or key in SECRET_KEYS or key in {"env", "headers"})
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [_transform_config(child, transform, secret=secret) for child in value]
    if secret and isinstance(value, str) and value:
        return transform(value)
    return value


def mask_credential_config(cred_type: str, config: dict[str, Any]) -> dict[str, Any]:
    return _transform_config(config or {}, lambda value: "••••••••")


def encrypt_credential_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """Encrypt secret values, including nested MCP environment and headers."""
    return _transform_config(config or {}, encrypt_value)


def decrypt_credential_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """Decrypt secret values on the resolution path; never mutate stored config.

    A value that cannot be decrypted (rotated/missing key) resolves to an
    empty string rather than leaking the ciphertext downstream as the secret.
    Callers treat a missing key as unavailable, which fails closed.
    """
    import logging

    logger = logging.getLogger("aegis.credentials")

    def _decrypt_or_blank(value: str) -> str:
        try:
            return decrypt_value(value)
        except DecryptionError:
            logger.warning(
                "Credential secret undecryptable; resolving as blank",
                extra={"event": "credential_undecryptable"},
            )
            return ""

    return _transform_config(config or {}, _decrypt_or_blank)


def resolve_credential(record: dict[str, Any] | models.Credential | None) -> dict[str, Any]:
    if record is None:
        return {}
    if isinstance(record, models.Credential):
        return decrypt_credential_config(record.config or {})
    return decrypt_credential_config(record.get("config") or {})


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


def mcp_cached_tools(cache: object) -> list[dict[str, Any]]:
    """Tool dicts from an MCP credential cache.

    A missing cache, a non-dict cache, or a non-list ``tools`` value yields
    an empty list so callers never attribute-error on a bad shape.
    """
    if not isinstance(cache, dict):
        return []
    tools = cache.get("tools")
    if not isinstance(tools, list):
        return []
    return [tool for tool in tools if isinstance(tool, dict)]


def load_mcp_credential(user_id: UUID, credential_id: UUID) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    from app.db.database import SessionLocal
    from app.services.mcp_client import MCPClientError, validate_mcp_config

    with SessionLocal() as db:
        row = get_user_credential(db, user_id, credential_id=credential_id)
        if row is None or row.type != "mcp":
            raise MCPClientError("MCP credential is unavailable for this workflow owner")
        config = validate_mcp_config(resolve_credential(row))
        return config, mcp_cached_tools(row.mcp_tool_cache)


def store_mcp_tool_cache(user_id: UUID, credential_id: UUID, tools: list[dict[str, Any]]) -> None:
    from app.db.database import SessionLocal
    from app.services.mcp_client import MCPClientError, make_mcp_tool_cache

    with SessionLocal() as db:
        row = get_user_credential(db, user_id, credential_id=credential_id)
        if row is None or row.type != "mcp":
            raise MCPClientError("MCP credential is unavailable for this workflow owner")
        row.mcp_tool_cache = make_mcp_tool_cache(tools, resolve_credential(row))
        db.commit()