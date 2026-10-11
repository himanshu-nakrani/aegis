from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.http_client import get_http_client
from app.services.url_safety import safe_http_request, validate_http_url

logger = logging.getLogger("aegis.webhook")


async def dispatch_webhook(url: str, payload: dict[str, Any]) -> bool:
    if not url:
        return False
    try:
        # validate_http_url does blocking DNS — keep it off the event loop.
        # Fail fast before acquiring the shared HTTP client.
        await asyncio.to_thread(validate_http_url, url)
        client = get_http_client()
        response = await safe_http_request(
            client,
            "POST",
            url,
            headers={"Content-Type": "application/json"},
            content=json.dumps(payload).encode("utf-8"),
        )
        if response.status_code >= 400:
            response.raise_for_status()
        logger.info("Webhook delivered", extra={"event": "webhook_success"})
        return True
    except Exception:
        # Exception text may contain a secret webhook URL. Keep logs credential-safe.
        logger.warning("Webhook delivery failed", extra={"event": "webhook_failed"})
        return False
