import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.services.credentials import encrypt_credential_config, mask_credential_config, resolve_credential
from app.services.integrations import _PG_ENGINES, clear_pg_engine_for_url, run_slack_integration
from app.services.schedule_worker import cron_matches_now, should_fire_schedule


def test_cron_matches_now_every_minute():
    from datetime import datetime, timezone

    now = datetime(2026, 6, 29, 10, 15, tzinfo=timezone.utc)
    assert cron_matches_now("* * * * *", now) is True


def test_should_fire_schedule_dedupes_same_minute():
    fired: dict[str, str] = {}
    workflow_id = "wf-1"
    minute_key = "2026-06-29T10:15"
    assert should_fire_schedule(workflow_id, minute_key, fired) is True
    assert should_fire_schedule(workflow_id, minute_key, fired) is False


def test_mask_credential_config_hides_secrets():
    masked = mask_credential_config(
        "slack",
        {"webhook_url": "https://hooks.slack.com/secret", "channel": "#general"},
    )
    assert "secret" not in masked["webhook_url"]
    assert masked["channel"] == "#general"


@pytest.mark.asyncio
async def test_slack_integration_posts_message():
    with patch("app.services.integrations.safe_http_request", new_callable=AsyncMock) as mock_request:
        response = AsyncMock()
        response.status_code = 200
        response.text = "ok"
        mock_request.return_value = response

        out = await run_slack_integration(
            "https://hooks.slack.com/test",
            "Hello {{input.name}}",
            {"input": {"name": "Aegis"}, "steps": {}, "last_output": "", "memory": {}},
            "",
        )
        assert out == "Slack 200"
        assert "ok" not in out
        mock_request.assert_awaited_once()


def test_clear_pg_engine_for_url_evicts_cached_engine():
    from unittest.mock import MagicMock

    mock_engine = MagicMock()
    url = "postgresql://user:pass@localhost:5432/db"
    _PG_ENGINES[url] = mock_engine

    clear_pg_engine_for_url(url)

    assert url not in _PG_ENGINES
    mock_engine.dispose.assert_called_once()


def test_resolve_credential_from_record():
    record = {
        "type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/x"},
    }
    assert resolve_credential(record)["webhook_url"].startswith("https://")

def test_signing_secret_masked_and_encrypted_round_trip(monkeypatch):
    """Slack signing_secret must never leave the API unmasked nor sit in
    plaintext when APP_ENCRYPTION_KEY is set (R2-18 secret hygiene)."""
    from app.services.credentials import encrypt_credential_config
    from app.services.crypto import encrypt_value

    masked = mask_credential_config(
        "slack",
        {"webhook_url": "https://hooks.slack.com/x", "signing_secret": "s3cr3t"},
    )
    assert "s3cr3t" not in masked["signing_secret"]
    assert masked["webhook_url"] != "https://hooks.slack.com/x"

    from cryptography.fernet import Fernet

    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    stored = encrypt_credential_config({"signing_secret": "s3cr3t"})
    assert stored["signing_secret"] != "s3cr3t"
    assert stored["signing_secret"].startswith("v1:")
    # And it resolves back through the decrypt path used by verification.
    from app.services.credentials import resolve_credential

    assert resolve_credential({"config": stored})["signing_secret"] == "s3cr3t"
