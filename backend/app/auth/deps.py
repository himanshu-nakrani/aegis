from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.config import settings

DEFAULT_DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None,
    x_aegis_api_key: Annotated[str | None, Header(alias="X-Aegis-API-Key")] = None,
) -> uuid.UUID:
    if not settings.auth_enabled:
        return DEFAULT_DEV_USER_ID

    token = x_aegis_api_key
    if not token and authorization:
        parts = authorization.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]

    if not token:
        raise HTTPException(status_code=401, detail="Missing API key. Set X-Aegis-API-Key header.")

    if token == settings.aegis_api_key:
        return DEFAULT_DEV_USER_ID

    raise HTTPException(status_code=401, detail="Invalid API key.")