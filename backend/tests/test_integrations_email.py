import pytest

from app.services.integrations import run_email_integration


@pytest.mark.asyncio
async def test_email_without_smtp_does_not_leak_payload():
    secret_body = "super-secret-memory-content"
    result = await run_email_integration(
        {"to": "ops@example.com"},
        "Secret subject line",
        secret_body,
        {"input": {}, "steps": {}, "last_output": "", "memory": {}},
        "",
    )
    assert result == "Email queued (SMTP not configured)"
    assert secret_body not in result
    assert "Secret subject line" not in result