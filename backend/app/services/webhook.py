from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.http_client import get_http_client

logger = logging.getLogger("aegis.webhook")


async def dispatch_webhook(url: str, payload: dict[str, Any]) -> None:
    if not url:
        return
    try:
        client = get_http_client()
        response = await client.post(
            url,
            json=payload,
            timeout=settings.webhook_timeout_seconds,
        )
        response.raise_for_status()
        logger.info("Webhook delivered", extra={"event": "webhook_success"})
    except Exception as exc:
        logger.warning(
            f"Webhook delivery failed: {exc}",
            extra={"event": "webhook_failed"},
        )