"""P3-C observability/session/cron fixes.

Covers: the shared nearest-rank percentile helper used identically by
dashboards, trust rollups, and alert-rule latency metrics; deterministic
session-history ordering on ``created_at`` ties; chat-session signing-key
precedence (app_encryption_key outranks aegis_api_key); and rejection of
6-field (seconds-granularity) cron expressions the scheduler can't honor.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.auth.deps import DEFAULT_DEV_USER_ID
from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.alerts import _metric_value
from app.services.chat_session import mint_session_token, verify_session_token
from app.services.cron_utils import cron_is_valid, cron_next_runs
from app.services.invoke_runner import _load_session_history
from app.services.observability_service import (
    build_dashboards,
    build_trust,
    percentile_value,
)


# ---------------------------------------------------------------------------
# L16 — one nearest-rank percentile everywhere
# ---------------------------------------------------------------------------


def test_percentile_value_is_standard_nearest_rank():
    values = [100, 200]
    # p50 of an even sample is the FIRST element under ceil(p*n), not the max.
    assert percentile_value(values, 0.50) == 100
    assert percentile_value(values, 1.0) == 200
    assert percentile_value(values, 0.95) == 200
    assert percentile_value([], 0.50) is None
    # 20 samples: p95 → ceil(0.95*20)=19 → index 18 (not index 19).
    assert percentile_value(list(range(100, 2100, 100)), 0.95) == 1900
    assert percentile_value(list(range(100, 2100, 100)), 0.99) == 2000


def _seed_latency_runs(db, count=20):
    workflow = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Pct WF")
    version = models.WorkflowVersion(
        id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json={"nodes": [], "edges": []}
    )
    db.add_all([workflow, version])
    db.flush()
    created = datetime.now(timezone.utc) - timedelta(minutes=1)
    for i in range(1, count + 1):
        db.add(
            models.WorkflowRun(
                id=uuid4(),
                workflow_version_id=version.id,
                input_text="x",
                status="completed",
                created_at=created,
                metrics_json={"latency_ms": i * 100},
            )
        )
    db.commit()
    return workflow, version


def test_dashboards_trust_and_alerts_report_identical_percentiles():
    db = SessionLocal()
    try:
        workflow, _version = _seed_latency_runs(db)

        dashboards = build_dashboards(db, DEFAULT_DEV_USER_ID)
        assert dashboards["latency_ms"]["sample_size"] == 20
        assert dashboards["latency_ms"]["p50"] == 1000
        assert dashboards["latency_ms"]["p95"] == 1900
        assert dashboards["latency_ms"]["p99"] == 2000

        trust = build_trust(db, DEFAULT_DEV_USER_ID)
        assert trust["latency_p50_ms"] == 1000
        assert trust["latency_p95_ms"] == 1900
        assert trust["latency_p99_ms"] == 2000

        # The trust surface previously used int(p*n) — a different rank than
        # dashboards for the exact same data. This assertion pins agreement.
        rule = models.AlertRule(
            id=uuid4(), user_id=DEFAULT_DEV_USER_ID, workflow_id=workflow.id,
            metric="latency_p95", operator="gt", threshold=1, window_minutes=60,
        )
        assert _metric_value(db, rule) == float(trust["latency_p95_ms"])
        assert _metric_value(db, rule) == float(dashboards["latency_ms"]["p95"])
    finally:
        db.close()


# ---------------------------------------------------------------------------
# M15 — deterministic session-history ordering on created_at ties
# ---------------------------------------------------------------------------


def test_session_history_ordering_is_deterministic_on_timestamp_ties():
    db = SessionLocal()
    try:
        workflow = models.Workflow(id=uuid4(), user_id=DEFAULT_DEV_USER_ID, name="Sess WF")
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=workflow.id, version_number=1,
            graph_json={"nodes": [], "edges": []},
        )
        db.add_all([workflow, version])
        db.flush()
        same_stamp = datetime.now(timezone.utc) - timedelta(minutes=1)
        ids = sorted([uuid4() for _ in range(3)])
        for rid in ids:
            db.add(
                models.WorkflowRun(
                    id=rid,
                    workflow_version_id=version.id,
                    input_text="in",
                    final_output="out",
                    status="completed",
                    session_id="s1",
                    created_at=same_stamp,
                )
            )
        db.commit()

        first = _load_session_history(db, version.id, "s1")
        second = _load_session_history(db, version.id, "s1")
        assert len(first) == 3
        assert first == second
        # Oldest-first after the id tiebreak: ascending id order.
        assert [t["run_id"] for t in first] == [str(rid) for rid in ids]
    finally:
        db.close()


# ---------------------------------------------------------------------------
# M16 — chat sessions survive API-key rotation when encryption key is set
# ---------------------------------------------------------------------------


def test_chat_session_survives_api_key_rotation_with_encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "app_encryption_key", "enc-key-1")
    monkeypatch.setattr(settings, "aegis_api_key", "api-key-old")
    token, _ = mint_session_token(uuid4(), uuid4(), uuid4())

    # Rotating (or enabling/disabling) the account API key must NOT kill
    # sessions minted under the dedicated app secret.
    monkeypatch.setattr(settings, "aegis_api_key", "api-key-new")
    assert verify_session_token(token) is not None

    # The encryption key IS the identity of the secret: rotating it does
    # invalidate sessions (by design).
    monkeypatch.setattr(settings, "app_encryption_key", "enc-key-2")
    assert verify_session_token(token) is None


def test_chat_session_api_key_fallback_still_works(monkeypatch):
    monkeypatch.setattr(settings, "app_encryption_key", "")
    monkeypatch.setattr(settings, "aegis_api_key", "api-key-only")
    token, _ = mint_session_token(uuid4(), uuid4(), uuid4())
    assert verify_session_token(token) is not None


# ---------------------------------------------------------------------------
# P4 — 6-field (seconds) cron rejected; scheduler is minute-granularity only
# ---------------------------------------------------------------------------


def test_cron_is_valid_rejects_seconds_field_expressions():
    # croniter parses the 6th field as SECONDS; our tick fires per-minute so
    # these would run on a silently wrong cadence.
    assert cron_is_valid("*/5 * * * * *") is False
    assert cron_is_valid("0 */1 * * * *") is False
    assert cron_next_runs("*/5 * * * * *") == []


def test_cron_is_valid_keeps_five_field_and_macros():
    assert cron_is_valid("*/5 * * * *") is True
    assert cron_is_valid("0 9 * * 1-5") is True
    assert cron_is_valid("@daily") is True
    assert cron_is_valid("@hourly") is True
    assert cron_is_valid("not a cron") is False
    assert cron_is_valid("") is False
    assert len(cron_next_runs("*/5 * * * *", count=2)) == 2
