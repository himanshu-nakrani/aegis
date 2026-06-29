import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.credentials import mask_credential_config, resolve_credential
from app.services.integrations import run_slack_integration
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
    with patch("app.services.integrations.get_http_client") as mock_client:
        response = AsyncMock()
        response.status_code = 200
        response.text = "ok"
        client = AsyncMock()
        client.post = AsyncMock(return_value=response)
        mock_client.return_value = client

        out = await run_slack_integration(
            "https://hooks.slack.com/test",
            "Hello {{input.name}}",
            {"input": {"name": "Aegis"}, "steps": {}, "last_output": "", "memory": {}},
            "",
        )
        assert "200" in out
        client.post.assert_awaited_once()


def test_resolve_credential_from_record():
    record = {
        "type": "slack",
        "config": {"webhook_url": "https://hooks.slack.com/x"},
    }
    assert resolve_credential(record)["webhook_url"].startswith("https://")