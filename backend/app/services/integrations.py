"""Integration node handlers — Slack, Email, Postgres (n8n-style)."""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.http_client import get_http_client
from app.services.expressions import render_template

MAX_EMAIL_BODY = 10_000
MAX_PG_ROWS = 50
_READ_ONLY_SQL = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)


async def run_discord_integration(
    webhook_url: str,
    message_template: str,
    context: dict[str, Any],
    node_input: str,
) -> str:
    message = render_template(message_template or "{{last_output}}", context, node_input)
    client = get_http_client()
    response = await client.post(
        webhook_url,
        json={"content": message[:2000]},
        timeout=15.0,
    )
    return f"Discord {response.status_code}: {response.text[:500]}"


async def run_slack_integration(
    webhook_url: str,
    message_template: str,
    context: dict[str, Any],
    node_input: str,
) -> str:
    message = render_template(message_template or "{{last_output}}", context, node_input)
    client = get_http_client()
    response = await client.post(
        webhook_url,
        json={"text": message},
        timeout=15.0,
    )
    return f"Slack {response.status_code}: {response.text[:500]}"


async def run_email_integration(
    config: dict[str, Any],
    subject_template: str,
    body_template: str,
    context: dict[str, Any],
    node_input: str,
) -> str:
    subject = render_template(subject_template or "Aegis notification", context, node_input)
    body = render_template(body_template or "{{last_output}}", context, node_input)[:MAX_EMAIL_BODY]
    to_addr = render_template(str(config.get("to") or ""), context, node_input)
    from_addr = config.get("from") or config.get("smtp_user") or "noreply@aegis.local"

    if not to_addr:
        return "Email error: missing 'to' address in credential config"

    # MVP: log-style delivery when SMTP is not configured
    if not config.get("smtp_host"):
        payload = {"from": from_addr, "to": to_addr, "subject": subject, "body": body}
        return f"Email queued (SMTP not configured): {json.dumps(payload, ensure_ascii=False)[:800]}"

    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg.set_content(body)

        host = config["smtp_host"]
        port = int(config.get("smtp_port") or 587)
        user = config.get("smtp_user")
        password = config.get("smtp_password")

        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return f"Email sent to {to_addr}"
    except Exception as exc:
        return f"Email error: {exc}"


def _pg_engine(connection_url: str) -> Engine:
    return create_engine(connection_url, pool_pre_ping=True)


async def run_postgres_integration(
    config: dict[str, Any],
    query_template: str,
    context: dict[str, Any],
    node_input: str,
) -> str:
    connection_url = config.get("connection_url")
    if not connection_url:
        return "Postgres error: missing connection_url in credential"

    query = render_template(query_template or "SELECT 1", context, node_input).strip()
    if not _READ_ONLY_SQL.match(query):
        return "Postgres error: only read-only SELECT/WITH queries are allowed"

    try:
        engine = _pg_engine(connection_url)

        def _run() -> list[dict[str, Any]]:
            with engine.connect() as conn:
                result = conn.execute(text(query))
                rows = result.mappings().fetchmany(MAX_PG_ROWS)
                return [dict(row) for row in rows]

        import asyncio

        rows = await asyncio.to_thread(_run)
        return json.dumps({"rows": rows, "count": len(rows)}, default=str, ensure_ascii=False)
    except Exception as exc:
        return f"Postgres error: {exc}"