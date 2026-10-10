"""Approval audit transitions, deadline boundaries, and notification failures."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import models
from app.db.database import Base
from app.services import approval_service as approvals
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from conftest import valid_graph


@pytest.fixture
def approval_run(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'approvals.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(approvals, "SessionLocal", sessions)
    with sessions() as db:
        user_id = uuid4()
        workflow = models.Workflow(user_id=user_id, name="Approval", webhook_url="https://hooks.example.com/approval")
        db.add(workflow)
        db.flush()
        version = models.WorkflowVersion(workflow_id=workflow.id, version_number=1, graph_json={})
        db.add(version)
        db.flush()
        run = models.WorkflowRun(workflow_version_id=version.id, input_text="Review this", status="awaiting_approval")
        db.add(run)
        db.commit()
        run_id = str(run.id)
    yield run_id, user_id, sessions
    approvals.clear_approval_state(run_id)
    engine.dispose()


def record(sessions, approval_id):
    with sessions() as db:
        row = db.get(models.ApprovalRequest, UUID(approval_id))
        return row.status, row.assignee, row.escalation_timeout_seconds, row.escalated_at, row.notification_errors


def backdate(sessions, approval_id, seconds):
    """Move parked_at into the past — deadlines must track the row, not wait start."""
    with sessions() as db:
        row = db.get(models.ApprovalRequest, UUID(approval_id))
        parked_at = row.parked_at or datetime.now(timezone.utc)
        row.parked_at = parked_at - timedelta(seconds=seconds)
        db.commit()


def resolve_row(sessions, approval_id, status, comment=""):
    """Resolve the row directly — a decision committed by another process."""
    with sessions() as db:
        row = db.get(models.ApprovalRequest, UUID(approval_id))
        row.status = status
        row.comment = comment
        row.resolved_at = datetime.now(timezone.utc)
        db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("approved,status", [(True, "approved"), (False, "denied")])
async def test_request_webhook_can_resolve_immediately(approval_run, monkeypatch, approved, status):
    run_id, _, sessions = approval_run
    events = []

    async def deliver(url, payload):
        events.append(payload["event"])
        assert payload["status"] == "parked"
        approvals.submit_approval(run_id, node_id="review", approved=approved, comment="Decision")
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", deliver)
    metadata = await approvals.park_approval(run_id, "review", "Review", assignee="Team", escalation_timeout_seconds=1)
    decision = await approvals.wait_for_approval(run_id, node_id="review", timeout=2)
    assert decision == {"approved": approved, "comment": "Decision"}
    assert events == ["approval_requested"]
    assert record(sessions, metadata["approval_id"])[:4] == (status, "Team", 1, None)


@pytest.mark.asyncio
async def test_escalation_once_only_while_pending_then_timeout(approval_run, monkeypatch):
    run_id, _, sessions = approval_run
    events = []

    async def deliver(url, payload):
        events.append(payload["event"])
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", deliver)
    metadata = await approvals.park_approval(run_id, "review", "Review", escalation_timeout_seconds=1)
    # Parked_at, rather than wait start, controls the escalation boundary.
    key = approvals._approval_key(run_id, "review")
    backdate(sessions, metadata["approval_id"], 0.98)
    with pytest.raises(approvals.HumanApprovalTimeout):
        await approvals.wait_for_approval(run_id, node_id="review", timeout=1.12)
    assert events == ["approval_requested", "approval_escalated"]
    assert await approvals.notify_approval(metadata["approval_id"], escalated=True) is None
    status, _, _, escalated_at, _ = record(sessions, metadata["approval_id"])
    assert status == "timed_out"
    assert escalated_at is not None
    assert key not in approvals._approval_events and key not in approvals._approval_timers


@pytest.mark.asyncio
async def test_resolution_cancels_future_escalation(approval_run, monkeypatch):
    run_id, _, sessions = approval_run
    requested = asyncio.Event()
    events = []

    async def deliver(url, payload):
        events.append(payload["event"])
        requested.set()
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", deliver)
    metadata = await approvals.park_approval(run_id, "review", "Review", escalation_timeout_seconds=1)
    # Escalation fires off the row's parked_at; keep it just inside the 1s window.
    backdate(sessions, metadata["approval_id"], 0.95)
    waiter = asyncio.create_task(approvals.wait_for_approval(run_id, node_id="review", timeout=2))
    await requested.wait()
    approvals.submit_approval(run_id, node_id="review", approved=False)
    assert (await waiter)["approved"] is False
    await asyncio.sleep(0.08)
    assert events == ["approval_requested"]
    assert record(sessions, metadata["approval_id"])[0] == "denied"


@pytest.mark.asyncio
async def test_cancellation_records_terminal_metadata(approval_run, monkeypatch):
    run_id, _, sessions = approval_run
    requested = asyncio.Event()

    async def deliver(url, payload):
        requested.set()
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", deliver)
    metadata = await approvals.park_approval(run_id, "review", "Review", escalation_timeout_seconds=1)
    waiter = asyncio.create_task(approvals.wait_for_approval(run_id, node_id="review", timeout=2))
    await requested.wait()
    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter
    assert record(sessions, metadata["approval_id"])[0] == "cancelled"
    assert not approvals._keys_for_run(run_id)


@pytest.mark.asyncio
async def test_real_slack_and_email_transports_use_bound_credentials(approval_run, monkeypatch):
    run_id, user_id, sessions = approval_run
    with sessions() as db:
        db.add_all([
            models.Credential(user_id=user_id, name="Slack", type="slack", config={"webhook_url": "https://hooks.example.com/slack-secret"}),
            models.Credential(user_id=user_id, name="Email", type="email", config={"smtp_host": "smtp.example.com", "to": "reviewer@example.com"}),
        ])
        db.commit()
    posts = []
    mail = []

    async def request(client, method, url, **kwargs):
        posts.append((url, kwargs["content"]))
        return httpx.Response(200, request=httpx.Request(method, url))

    class SMTP:
        def __init__(self, host, port, timeout):
            assert (host, port, timeout) == ("smtp.example.com", 587, 15)
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def starttls(self):
            pass
        def send_message(self, message):
            mail.append(message)

    monkeypatch.setattr("app.services.webhook.validate_http_url", lambda url: None)
    monkeypatch.setattr("app.services.integrations.validate_http_url", lambda url: None)
    monkeypatch.setattr("app.services.webhook.safe_http_request", request)
    monkeypatch.setattr("app.services.integrations.safe_http_request", request)
    monkeypatch.setattr("smtplib.SMTP", SMTP)
    metadata = await approvals.park_approval(run_id, "review", "Review", notifications=[
        {"channel": "slack", "credentialName": "Slack"}, {"channel": "email", "credentialName": "Email"},
    ])
    await approvals.notify_approval(metadata["approval_id"])
    assert [url for url, _ in posts] == ["https://hooks.example.com/approval", "https://hooks.example.com/slack-secret"]
    assert mail[0]["To"] == "reviewer@example.com"
    assert "approval_requested" in mail[0].get_content()
    assert record(sessions, metadata["approval_id"])[4] == []
    with sessions() as db:
        row = db.get(models.ApprovalRequest, UUID(metadata["approval_id"]))
        assert "slack-secret" not in str(row.notification_channels)


@pytest.mark.asyncio
async def test_delivery_errors_and_missing_smtp_do_not_approve(approval_run, monkeypatch):
    run_id, user_id, sessions = approval_run
    with sessions() as db:
        db.add(models.Credential(user_id=user_id, name="Email", type="email", config={"to": "reviewer@example.com"}))
        db.commit()

    async def failed(url, payload):
        return False

    monkeypatch.setattr(approvals, "dispatch_webhook", failed)
    metadata = await approvals.park_approval(run_id, "review", "Review", notifications=[{"channel": "email", "credentialName": "Email"}])
    with pytest.raises(approvals.HumanApprovalTimeout):
        await approvals.wait_for_approval(run_id, node_id="review", timeout=0.08)
    status, _, _, _, errors = record(sessions, metadata["approval_id"])
    assert status == "timed_out"
    assert {error["channel"] for error in errors} == {"webhook", "email"}
    assert all(error["error"] == "delivery_failed" for error in errors)


@pytest.mark.parametrize("data", [
    {"escalationTimeoutSeconds": 0}, {"escalationTimeoutSeconds": -1},
    {"escalationTimeoutSeconds": True}, {"escalationTimeoutSeconds": 1.5},
    {"approvalNotifications": [{"channel": "email", "credentialName": "Mail", "smtp_password": "secret"}]},
    {"approvalNotifications": [{"channel": "slack"}]},
])
def test_approval_config_rejects_invalid_bounds_and_inline_secrets(data):
    graph = valid_graph([{"id": "review", "data": {"nodeType": "human_approval", **data}}])
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


# ---------------------------------------------------------------------------
# Durable cross-process waits — the parked row is the wait truth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_waiter_without_in_process_event_sees_remote_decision(approval_run, monkeypatch):
    """A waiter whose Event was never signalled still resolves via the DB poll."""
    run_id, _, sessions = approval_run

    async def noop(url, payload):
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", noop)
    monkeypatch.setattr(approvals, "_POLL_SECONDS", 0.05)
    metadata = await approvals.park_approval(run_id, "review", "Review")
    key = approvals._approval_key(run_id, "review")
    # Drop the fast-path signal so only the row poll can wake the waiter.
    approvals._approval_events.pop(key, None)
    waiter = asyncio.create_task(approvals.wait_for_approval(run_id, node_id="review", timeout=5))
    await asyncio.sleep(0.15)  # let the waiter start its poll loop
    assert key not in approvals._approval_results
    # Decision committed by "another process": row only, no local submit.
    resolve_row(sessions, metadata["approval_id"], "denied", "Remote rejection")
    decision = await asyncio.wait_for(waiter, timeout=5)
    assert decision == {"approved": False, "comment": "Remote rejection"}
    # The waiter synthesizes the result — it must NOT re-persist the row.
    status, _, _, escalated_at, _ = record(sessions, metadata["approval_id"])
    assert status == "denied"
    assert escalated_at is None


@pytest.mark.asyncio
async def test_wait_deadline_anchors_to_parked_at(approval_run, monkeypatch):
    """An old parked_at means the timeout already elapsed — immediate timeout."""
    run_id, _, sessions = approval_run

    async def noop(url, payload):
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", noop)
    metadata = await approvals.park_approval(run_id, "review", "Review")
    # The parked row is older than the caller's timeout budget: the deadline is
    # computed from the durable row, so it fires without any real waiting.
    backdate(sessions, metadata["approval_id"], 3600)
    with pytest.raises(approvals.HumanApprovalTimeout):
        await approvals.wait_for_approval(run_id, node_id="review", timeout=60)
    assert record(sessions, metadata["approval_id"])[0] == "timed_out"


@pytest.mark.asyncio
async def test_remote_dispatcher_resolves_local_waiter_from_db(approval_run, monkeypatch):
    """_on_remote_decision (event-bus callback) wakes local waiters from the row."""
    run_id, _, sessions = approval_run

    async def noop(url, payload):
        return True

    monkeypatch.setattr(approvals, "dispatch_webhook", noop)
    metadata = await approvals.park_approval(run_id, "review", "Review")
    waiter = asyncio.create_task(approvals.wait_for_approval(run_id, node_id="review", timeout=5))
    await asyncio.sleep(0.15)  # let the waiter register its Event
    resolve_row(sessions, metadata["approval_id"], "denied", "Denied elsewhere")
    # What the event-bus listener invokes on NOTIFY; no local submit_approval.
    approvals._on_remote_decision(run_id)
    decision = await asyncio.wait_for(waiter, timeout=5)
    assert decision == {"approved": False, "comment": "Denied elsewhere"}
    assert record(sessions, metadata["approval_id"])[0] == "denied"
