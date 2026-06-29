from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("aegis.webhook")


async def dispatch_webhook(url: str, payload: dict[str, Any]) -> None:
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=settings.webhook_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        logger.info("Webhook delivered", extra={"event": "webhook_success"})
    except Exception as exc:
        logger.warning(
            f"Webhook delivery failed: {exc}",
            extra={"event": "webhook_failed"},
        )