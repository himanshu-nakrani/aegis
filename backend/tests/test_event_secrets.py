"""Contract tests for Slack event-webhook authentication.

Target: ``app/services/event_secrets.py`` (``verify_slack_signature`` and its two
pure helpers) plus the caller seam in ``app/services/deployments.py``
(``authenticate_event_webhook``) that selects the Slack branch.

Why this file exists: ``verify_slack_signature`` is the *only* authentication on
the inbound Slack event path — a real Slack delivery carries no Aegis credential,
so every byte of trust comes from this function. Before this suite it was reached
by exactly two HTTP-level tests in ``test_event_triggers.py`` (a url_verification
happy path and one wrong-workspace rejection). The failure modes that matter here
are silent: a binding rule that stops failing closed turns a 401 into a 202 that
starts a run for an attacker-controlled workspace. These tests pin the contract
at unit level so a regression names the rule it broke instead of showing up as an
unexplained run.

Layout mirrors the module's own decision order — signature format, timestamp
format, replay window, payload team extraction, trigger binding parse, then the
four workspace-binding rules — so a failure points at one stage.

Conventions: AAA per test, ``pytest.mark.parametrize`` for input classes, and a
module-wide frozen clock (see ``clock``) because the ±300s replay window has
exact boundaries that a wall-clock test would flake on.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
import uuid
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import models
from app.db.database import Base
from app.services import event_secrets
from app.services.credentials import encrypt_credential_config
from app.services.deployments import authenticate_event_webhook

# ---------------------------------------------------------------------------
# Shared constants and helpers
# ---------------------------------------------------------------------------

# Fixed epoch. Every timestamp in this module is derived from it so the
# replay-window boundaries (300s in, 301s out) are exact rather than racy.
FROZEN_NOW = 1_700_000_000
WINDOW = event_secrets._SLACK_TS_WINDOW_SECONDS  # 300

SECRET = "alice-workspace-signing-secret"
OTHER_SECRET = "bob-workspace-signing-secret"
TEAM = "TALICE"
OTHER_TEAM = "TBOB"

# Error details are part of the contract: operators grep them, and they must
# never leak the secret or the expected signature.
ERR_SIGNATURE = "Invalid Slack signature"
ERR_TIMESTAMP = "Invalid Slack timestamp"
ERR_EXPIRED = "Expired Slack timestamp"
ERR_BOUND_CRED = "Bound Slack credential unavailable"
ERR_BINDING_REQUIRED = (
    "Slack workspace binding required: set eventTeamId on the webhook "
    "trigger or team_id on the Slack credential"
)


def sign(secret: str, timestamp: str | int, body: bytes) -> str:
    """Produce a genuine Slack ``v0=`` signature over ``v0:{ts}:{body}``."""
    stamped = f"v0:{timestamp}:".encode() + body
    return "v0=" + hmac.new(secret.encode(), stamped, hashlib.sha256).hexdigest()


def event_body(team_id: str | None = TEAM, **extra) -> bytes:
    """A representative ``event_callback`` payload (carries a team id)."""
    payload = {
        "type": "event_callback",
        "event_id": "Ev0001",
        "event": {"type": "app_mention", "text": "<@U0> hi", "user": "U9", "ts": "1.2"},
        **extra,
    }
    if team_id is not None:
        payload["team_id"] = team_id
    return json.dumps(payload).encode()


def handshake_body() -> bytes:
    """Slack's ``url_verification`` challenge — deliberately carries no team."""
    return json.dumps({"type": "url_verification", "challenge": "tok-123"}).encode()


def trigger_graph(
    *,
    trigger_type: str | None = "webhook",
    event_team_id: object | None = None,
    event_credential_id: object | None = None,
) -> dict:
    """Minimal published graph whose trigger node declares the Slack binding."""
    data: dict = {"nodeType": "trigger", "label": "Webhook"}
    if trigger_type is not None:
        data["triggerType"] = trigger_type
    if event_team_id is not None:
        data["eventTeamId"] = event_team_id
    if event_credential_id is not None:
        data["eventCredentialId"] = str(event_credential_id)
    return {"nodes": [{"id": "trigger", "position": {"x": 0, "y": 0}, "data": data}], "edges": []}


def add_credential(
    db,
    user_id,
    *,
    secret: str | None = SECRET,
    team_id: str | None = TEAM,
    cred_type: str = "slack",
    name: str = "slack-events",
    encrypt: bool = False,
    extra: dict | None = None,
) -> models.Credential:
    """Insert a credential row the way the API stores one."""
    config: dict = {"webhook_url": "https://hooks.slack.com/services/T/B/x"}
    if secret is not None:
        config["signing_secret"] = secret
    if team_id is not None:
        config["team_id"] = team_id
    config.update(extra or {})
    row = models.Credential(
        id=uuid.uuid4(),
        user_id=user_id,
        name=name,
        type=cred_type,
        config=encrypt_credential_config(config) if encrypt else config,
    )
    db.add(row)
    db.commit()
    return row


def build_deployment(
    db,
    *,
    bound_team: object | None = None,
    bound_credential_id: object | None = None,
    trigger_type: str | None = "webhook",
    user_id: uuid.UUID | None = None,
) -> SimpleNamespace:
    """Workflow + published version + deployment, with the trigger binding set."""
    owner = user_id or uuid.uuid4()
    workflow = models.Workflow(id=uuid.uuid4(), user_id=owner, name="Slack target")
    version = models.WorkflowVersion(
        id=uuid.uuid4(),
        workflow_id=workflow.id,
        version_number=1,
        graph_json=trigger_graph(
            trigger_type=trigger_type,
            event_team_id=bound_team,
            event_credential_id=bound_credential_id,
        ),
    )
    workflow.published_version_id = version.id
    deployment = models.WorkflowDeployment(
        id=uuid.uuid4(), workflow_id=workflow.id, version_id=version.id
    )
    db.add_all([workflow, version, deployment])
    db.commit()
    return SimpleNamespace(
        user_id=owner, workflow=workflow, version=version, deployment=deployment
    )


def verify(db, deployment, signature: str, timestamp: str, body: bytes) -> None:
    """Call the subject; a passing verification returns None and raises nothing."""
    assert event_secrets.verify_slack_signature(db, deployment, signature, timestamp, body) is None


def assert_rejected(db, deployment, signature, timestamp, body, detail: str) -> None:
    """Assert a 401 with an exact detail, and that the detail leaks no secret."""
    with pytest.raises(HTTPException) as excinfo:
        event_secrets.verify_slack_signature(db, deployment, signature, timestamp, body)
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == detail
    # The detail is attacker-visible: no branch may echo a signing secret or an
    # HMAC digest, which would turn a 401 into a signature oracle.
    text = str(excinfo.value.detail)
    for secret in (SECRET, OTHER_SECRET):
        assert secret not in text
    assert not re.search(r"[a-f0-9]{32,}", text)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """Freeze ``event_secrets.time`` for the whole module.

    Autouse because every test that gets past the header checks lands in the
    replay window, and a wall-clock ``str(int(time.time()))`` flakes exactly at
    the 300s boundary on a slow machine. Tests that need to move time mutate
    ``clock.now``.
    """

    class _Clock:
        now = float(FROZEN_NOW)

        def time(self) -> float:
            return self.now

    frozen = _Clock()
    monkeypatch.setattr(event_secrets, "time", frozen)
    return frozen


@pytest.fixture
def db():
    """Fresh in-memory SQLite per test — no cross-test row leakage."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# ---------------------------------------------------------------------------
# Stage 1 — signature format (checked before anything touches the DB)
# ---------------------------------------------------------------------------

# ``_SLACK_SIG_RE`` is ``v0=[a-f0-9]{64}`` matched with ``fullmatch``: lowercase
# hex, exactly 64 chars, exact ``v0=`` prefix, nothing before or after.
MALFORMED_SIGNATURES = [
    pytest.param("", id="empty"),
    pytest.param("v0=", id="prefix-only"),
    pytest.param("v0=" + "a" * 63, id="63-hex-chars"),
    pytest.param("v0=" + "a" * 65, id="65-hex-chars"),
    pytest.param("v0=" + "A" * 64, id="uppercase-hex"),
    pytest.param("v0=" + "g" * 64, id="non-hex-letters"),
    pytest.param("a" * 64, id="missing-v0-prefix"),
    pytest.param("sha256=" + "a" * 64, id="github-style-prefix"),
    pytest.param("V0=" + "a" * 64, id="uppercase-prefix"),
    pytest.param("v0= " + "a" * 64, id="space-after-prefix"),
    pytest.param(" v0=" + "a" * 64, id="leading-space"),
    pytest.param("v0=" + "a" * 64 + "\n", id="trailing-newline"),
    pytest.param("v0=" + "a" * 64 + " v0=" + "b" * 64, id="two-signatures"),
    pytest.param("v0=deadbeef", id="short-hex"),
]


@pytest.mark.parametrize("signature", MALFORMED_SIGNATURES)
def test_malformed_signature_rejected_before_db_access(db, signature):
    """Format failures 401 without a query — a garbage header must not reach
    credential resolution, and must not be mistaken for an expired timestamp."""
    env = build_deployment(db, bound_team=TEAM)
    ts = str(FROZEN_NOW)
    assert_rejected(db, env.deployment, signature, ts, event_body(), ERR_SIGNATURE)


def test_none_signature_rejected_not_crash(db):
    """``signature or ""`` guards the None case (a missing header upstream)."""
    env = build_deployment(db, bound_team=TEAM)
    assert_rejected(db, env.deployment, None, str(FROZEN_NOW), event_body(), ERR_SIGNATURE)


def test_signature_format_checked_before_timestamp_format(db):
    """Both headers invalid → the signature error wins (documented stage order)."""
    env = build_deployment(db, bound_team=TEAM)
    assert_rejected(db, env.deployment, "nope", "not-a-timestamp", b"{}", ERR_SIGNATURE)


# ---------------------------------------------------------------------------
# Stage 2 — timestamp format
# ---------------------------------------------------------------------------

MALFORMED_TIMESTAMPS = [
    pytest.param("", id="empty"),
    pytest.param("1700000000.5", id="float"),
    pytest.param("-1700000000", id="negative"),
    pytest.param("+1700000000", id="plus-sign"),
    pytest.param(" 1700000000", id="leading-space"),
    pytest.param("1700000000 ", id="trailing-space"),
    pytest.param("now", id="word"),
    pytest.param("1700000000000", id="13-digits-over-length-cap"),
    pytest.param("\u0661\u0667\u0660\u0660\u0660\u0660\u0660\u0660\u0660\u0660", id="arabic-indic-digits"),
    pytest.param("\uff11\uff17\uff10\uff10\uff10\uff10\uff10\uff10\uff10\uff10", id="fullwidth-digits"),
]


@pytest.mark.parametrize("timestamp", MALFORMED_TIMESTAMPS)
def test_malformed_timestamp_rejected(db, timestamp):
    """Non-ASCII decimal digits pass ``str.isdecimal()`` — the ``isascii()``
    guard is what stops them reaching ``int()`` with a different value than the
    header showed. Both digit classes must 401 as format errors, not expire."""
    env = build_deployment(db, bound_team=TEAM)
    assert_rejected(
        db, env.deployment, "v0=" + "0" * 64, timestamp, event_body(), ERR_TIMESTAMP
    )


def test_twelve_digit_timestamp_is_a_format_pass_but_expired(db):
    """Boundary of the ``len(timestamp) > 12`` cap: 12 digits parses and is
    judged on the window; 13 digits never gets that far."""
    env = build_deployment(db, bound_team=TEAM)
    twelve = "1" + "0" * 11  # 12 digits, far outside the window
    thirteen = "1" + "0" * 12  # 13 digits
    assert_rejected(db, env.deployment, "v0=" + "0" * 64, twelve, b"{}", ERR_EXPIRED)
    assert_rejected(db, env.deployment, "v0=" + "0" * 64, thirteen, b"{}", ERR_TIMESTAMP)


@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECT: `timestamp or ''` guards the isascii() call but the next clause "
        "dereferences `timestamp` unguarded, so None raises AttributeError instead "
        "of a 401. Unreachable via HTTP today (Starlette header lookups default to "
        "'' in authenticate_event_webhook) but a direct/worker caller would 500. "
        "Fix: `(timestamp or '').isdecimal()`. Remove this marker once fixed."
    ),
)
def test_none_timestamp_should_401_not_attribute_error(db):
    env = build_deployment(db, bound_team=TEAM)
    assert_rejected(db, env.deployment, "v0=" + "0" * 64, None, event_body(), ERR_TIMESTAMP)


# ---------------------------------------------------------------------------
# Stage 3 — replay window (±300s, inclusive)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "offset",
    [0, -1, 1, -(WINDOW - 1), WINDOW - 1, -WINDOW, WINDOW],
    ids=["now", "-1s", "+1s", "-299s", "+299s", "-300s", "+300s"],
)
def test_timestamp_inside_window_accepted(db, offset):
    """``abs(now - ts) > 300`` is a strict comparison: exactly ±300s is in."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW + offset)
    body = event_body()
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


@pytest.mark.parametrize(
    "offset",
    [-(WINDOW + 1), WINDOW + 1, -3600, 3600, -FROZEN_NOW],
    ids=["-301s", "+301s", "-1h", "+1h", "epoch-zero"],
)
def test_timestamp_outside_window_rejected(db, offset):
    """Clock-skew tolerance is bounded in both directions — a captured delivery
    cannot be replayed a minute later, and a future-dated one cannot be pre-signed."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW + offset)
    body = event_body()
    # Correctly signed, correctly bound — only the timestamp is wrong.
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_EXPIRED)


def test_window_follows_the_clock_not_the_request(db, clock):
    """The window is evaluated against current time, so the same signature
    expires as the clock advances past it."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body()
    signature = sign(SECRET, ts, body)

    verify(db, env.deployment, signature, ts, body)

    clock.now = float(FROZEN_NOW + WINDOW + 1)
    assert_rejected(db, env.deployment, signature, ts, body, ERR_EXPIRED)


def test_window_checked_before_credential_lookup(db):
    """An expired delivery 401s as expired even when no credential exists at all
    — the window is not a fallback message for a missing binding."""
    env = build_deployment(db, bound_team=TEAM)
    ts = str(FROZEN_NOW - WINDOW - 1)
    assert_rejected(db, env.deployment, "v0=" + "0" * 64, ts, event_body(), ERR_EXPIRED)


# ---------------------------------------------------------------------------
# Stage 4 — payload team extraction
# ---------------------------------------------------------------------------


def test_payload_team_prefers_top_level_over_event_team():
    assert event_secrets._payload_team_id(b'{"team_id":"T1","event":{"team":"T2"}}') == "T1"


def test_payload_team_falls_back_to_event_team():
    """Interaction payloads put the workspace on ``event.team``."""
    assert event_secrets._payload_team_id(b'{"event":{"team":"T2"}}') == "T2"


@pytest.mark.parametrize(
    "raw",
    [
        pytest.param(b'{"team_id":""}', id="empty-team-id"),
        pytest.param(b'{"team_id":123}', id="non-string-team-id"),
        pytest.param(b'{"team_id":null,"event":{"team":42}}', id="non-string-event-team"),
        pytest.param(b'{"event":{"team":""}}', id="empty-event-team"),
        pytest.param(b'{"event":"not-a-dict"}', id="event-not-dict"),
        pytest.param(b'[]', id="json-array"),
        pytest.param(b'"TALICE"', id="json-string"),
        pytest.param(b"null", id="json-null"),
        pytest.param(b"not json at all", id="invalid-json"),
        pytest.param(b"", id="empty-body"),
        pytest.param(None, id="none-body"),
        pytest.param(b'{"type":"url_verification","challenge":"c"}', id="handshake"),
    ],
)
def test_payload_team_is_none_for_bodies_without_a_usable_team(raw):
    """``None`` is a meaningful result, not an error: it is what lets the
    url_verification handshake verify signature-only while every teamless
    delivery against a team-bound deployment still fails closed."""
    assert event_secrets._payload_team_id(raw) is None


def test_payload_team_survives_undecodable_bytes():
    """Slack bodies are signed as bytes; a non-UTF-8 body must not raise.
    ``errors="replace"`` yields U+FFFD rather than a 500."""
    assert event_secrets._payload_team_id(b'{"team_id":"\xff\xfe"}') == "\ufffd\ufffd"


# ---------------------------------------------------------------------------
# Stage 5 — trigger-node binding parse
# ---------------------------------------------------------------------------


def test_binding_reads_credential_and_team_from_webhook_trigger(db):
    cred_id = uuid.uuid4()
    env = build_deployment(db, bound_team="  TALICE  ", bound_credential_id=cred_id)
    assert event_secrets._webhook_trigger_binding(env.version) == (str(cred_id), TEAM)


def test_binding_coerces_non_string_ids_and_teams(db):
    """Canvas fields can arrive as JSON numbers; the ``str()`` normalization is
    what makes them comparable to a credential's string ``team_id``/``id``."""
    env = build_deployment(db)
    env.version.graph_json = {
        "nodes": [
            {
                "id": "t",
                "data": {
                    "nodeType": "trigger",
                    "triggerType": "webhook",
                    "eventTeamId": 12345,
                    "eventCredentialId": 67890,
                },
            }
        ],
        "edges": [],
    }
    db.commit()
    assert event_secrets._webhook_trigger_binding(env.version) == ("67890", "12345")


@pytest.mark.parametrize(
    "trigger_type",
    [pytest.param("WEBHOOK", id="uppercase"), pytest.param("Webhook", id="mixed-case")],
)
def test_binding_trigger_type_match_is_case_insensitive(db, trigger_type):
    env = build_deployment(db, bound_team=TEAM, trigger_type=trigger_type)
    assert event_secrets._webhook_trigger_binding(env.version) == (None, TEAM)


@pytest.mark.parametrize(
    "graph",
    [
        pytest.param(None, id="null-graph"),
        pytest.param({}, id="empty-graph"),
        pytest.param({"nodes": []}, id="no-nodes"),
        pytest.param({"nodes": None}, id="null-nodes"),
        pytest.param({"nodes": [{}], "edges": []}, id="node-without-data"),
        pytest.param({"nodes": [{"data": None}], "edges": []}, id="null-node-data"),
        pytest.param(
            {"nodes": [{"data": {"nodeType": "transform"}}], "edges": []},
            id="no-trigger-node",
        ),
        pytest.param(
            trigger_graph(trigger_type="schedule", event_team_id=TEAM),
            id="non-webhook-trigger",
        ),
        pytest.param(
            trigger_graph(trigger_type=None, event_team_id=TEAM),
            id="trigger-without-type",
        ),
    ],
)
def test_binding_is_absent_for_graphs_that_declare_nothing(db, graph):
    """``(None, None)`` is the fail-closed default — an unparseable or
    non-webhook trigger must never be read as "no binding needed"."""
    env = build_deployment(db)
    env.version.graph_json = graph if graph is not None else None
    db.commit()
    assert event_secrets._webhook_trigger_binding(env.version) == (None, None)


def test_binding_is_absent_when_version_row_is_missing(db):
    """A dangling ``deployment.version_id`` yields no version and no binding."""
    assert event_secrets._webhook_trigger_binding(None) == (None, None)


@pytest.mark.parametrize(
    "team",
    [pytest.param("   ", id="whitespace-only"), pytest.param("", id="empty")],
)
def test_blank_declared_team_normalizes_to_absent(db, team):
    """A whitespace ``eventTeamId`` is treated as unset, not as a team named
    ``"   "`` that no delivery could ever match."""
    env = build_deployment(db, bound_team=team)
    assert event_secrets._webhook_trigger_binding(env.version) == (None, None)


def test_binding_takes_the_first_webhook_trigger_and_skips_others(db):
    """Only one trigger is legal in a valid graph; the parse must still be
    deterministic and must not pick up a non-webhook trigger's (absent) binding."""
    env = build_deployment(db)
    cred_id = uuid.uuid4()
    env.version.graph_json = {
        "nodes": [
            {"id": "a", "data": {"nodeType": "transform"}},
            {"id": "b", "data": {"nodeType": "trigger", "triggerType": "schedule"}},
            {
                "id": "c",
                "data": {
                    "nodeType": "trigger",
                    "triggerType": "webhook",
                    "eventTeamId": TEAM,
                    "eventCredentialId": str(cred_id),
                },
            },
            {"id": "d", "data": {"nodeType": "trigger", "triggerType": "webhook", "eventTeamId": OTHER_TEAM}},
        ],
        "edges": [],
    }
    db.commit()
    assert event_secrets._webhook_trigger_binding(env.version) == (str(cred_id), TEAM)


# ---------------------------------------------------------------------------
# Stage 6 — happy paths
# ---------------------------------------------------------------------------


def test_valid_delivery_against_team_bound_trigger_accepted(db):
    """Rule 1: trigger declares ``eventTeamId`` and the signing credential
    carries the same team."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_valid_delivery_against_credential_bound_trigger_accepted(db):
    """Rule 1, credential-pinned variant: ``eventCredentialId`` narrows the
    candidate set to exactly the named credential."""
    owner = uuid.uuid4()
    cred = add_credential(db, owner, team_id=TEAM)  # signing_secret defaults to SECRET
    env = build_deployment(db, bound_credential_id=cred.id, user_id=owner)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_url_verification_handshake_accepted_without_a_team(db):
    """The handshake body has no team, so a team-bound deployment verifies it
    signature-only. Slack requires a 200 here or the endpoint cannot be created."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = handshake_body()
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_teamless_handshake_accepted_on_a_teamless_deployment(db):
    """Rule 4's one accepting branch: nothing declared anywhere *and* no team in
    the payload. Follow-up events (which do carry a team) still fail closed."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=None)
    ts = str(FROZEN_NOW)
    body = handshake_body()
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_credential_team_alone_binds_the_deployment(db):
    """Rule 3: no trigger binding, but the credential names its workspace and
    the payload agrees."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_any_of_several_credentials_may_sign(db):
    """A workspace migration leaves two Slack credentials on the account; the
    loop must accept whichever one actually signed."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret="old-secret", team_id=TEAM, name="slack-old")
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM, name="slack-new")
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_encrypted_signing_secret_is_decrypted_for_verification(db, monkeypatch):
    """Secrets at rest are Fernet-encrypted; verification must use the
    plaintext, so a correctly stored credential still validates."""
    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    env = build_deployment(db, bound_team=TEAM)
    row = add_credential(db, env.user_id, secret=SECRET, team_id=TEAM, encrypt=True)
    assert row.config["signing_secret"].startswith("v1:")  # actually encrypted
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_signature_survives_a_non_json_body(db):
    """The HMAC covers raw bytes, so an opaque body verifies as long as the
    bytes match — JSON parsing is only for team extraction."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=None)
    ts = str(FROZEN_NOW)
    body = b"token=gone&team_id=" + TEAM.encode()  # form-encoded, not JSON
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)


def test_empty_body_verifies(db):
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=None)
    ts = str(FROZEN_NOW)
    verify(db, env.deployment, sign(SECRET, ts, b""), ts, b"")


def test_none_body_treated_as_empty(db):
    """``(raw_body or b"")`` — a None body signs and verifies as empty rather
    than raising on bytes concatenation."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=None)
    ts = str(FROZEN_NOW)
    verify(db, env.deployment, sign(SECRET, ts, b""), ts, None)


# ---------------------------------------------------------------------------
# Stage 7 — cryptographic negative cases
# ---------------------------------------------------------------------------


def test_wrong_secret_rejected(db):
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(OTHER_SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_tampered_body_rejected(db):
    """Sign one body, deliver another: the signature must not transfer."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    signature = sign(SECRET, ts, event_body(team_id=TEAM))
    tampered = event_body(team_id=TEAM) + b" "
    assert_rejected(db, env.deployment, signature, ts, tampered, ERR_SIGNATURE)


def test_signature_cannot_be_moved_to_a_fresh_timestamp(db):
    """Both timestamps are inside the window, but the HMAC covers the timestamp
    — so a captured signature cannot be replayed with a newer one."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    body = event_body(team_id=TEAM)
    captured = sign(SECRET, FROZEN_NOW - 60, body)
    fresh_ts = str(FROZEN_NOW)
    assert_rejected(db, env.deployment, captured, fresh_ts, body, ERR_SIGNATURE)


def test_signature_cannot_be_replayed_against_another_deployment(db):
    """Same owner, two deployments, two workspaces: A's signature is not B's."""
    env_a = build_deployment(db, bound_team=TEAM)
    add_credential(db, env_a.user_id, secret=SECRET, team_id=TEAM)
    env_b = build_deployment(db, bound_team=OTHER_TEAM, user_id=env_a.user_id)
    add_credential(db, env_b.user_id, secret=OTHER_SECRET, team_id=OTHER_TEAM, name="slack-b")
    ts = str(FROZEN_NOW)
    body = event_body(team_id=OTHER_TEAM)
    verify(db, env_b.deployment, sign(OTHER_SECRET, ts, body), ts, body)
    assert_rejected(db, env_a.deployment, sign(OTHER_SECRET, ts, body), ts, body, ERR_SIGNATURE)


@pytest.mark.parametrize("position", [0, 31, 63], ids=["first-hex", "middle-hex", "last-hex"])
def test_single_character_signature_change_rejected(db, position):
    """No prefix matching, no truncation tolerance: flipping one hex digit of a
    correctly signed delivery fails."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    digest = sign(SECRET, ts, body)[3:]
    flipped = ("0" if digest[position] != "0" else "1")
    mutated = "v0=" + digest[:position] + flipped + digest[position + 1 :]
    assert_rejected(db, env.deployment, mutated, ts, body, ERR_SIGNATURE)


def test_valid_signature_over_a_truncated_body_rejected(db):
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body[:-1], ERR_SIGNATURE)


# ---------------------------------------------------------------------------
# Stage 8 — workspace binding matrix (the fail-closed core)
# ---------------------------------------------------------------------------


def test_cross_workspace_secret_rejected_even_when_self_consistent(db):
    """The attack this module exists for: the holder of workspace B's secret
    controls both the signature *and* the claimed team. Credential metadata
    alone cannot bind a deployment — the trigger's ``eventTeamId`` does."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM, name="slack-a")
    add_credential(db, env.user_id, secret=OTHER_SECRET, team_id=OTHER_TEAM, name="slack-b")
    ts = str(FROZEN_NOW)
    # Attacker signs a body claiming to be from the bound team, with B's secret.
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(OTHER_SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_bound_team_rejects_a_delivery_claiming_another_team(db):
    """Rule 1, payload check: A's secret, but the body says team B."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=OTHER_TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_teamless_credential_at_a_team_bound_deployment_fails_closed(db):
    """Rule 1's documented misconfiguration case: a credential with no
    ``team_id`` cannot satisfy a deployment that declared one."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=None)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_credential_team_must_match_declared_team(db):
    """Rule 1, credential check: correctly signed by a credential whose own team
    differs from the deployment's declared team."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=OTHER_TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_credential_team_alone_rejects_a_foreign_payload(db):
    """Rule 3: no trigger binding, credential says TALICE, payload says TBOB."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=OTHER_TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_teamless_everything_rejects_a_team_bearing_payload(db):
    """Rule 4: nothing declared anywhere and the payload *does* carry a team →
    fail closed. This is the branch that makes an unconfigured deployment
    unusable rather than world-writable."""
    env = build_deployment(db)
    add_credential(db, env.user_id, secret=SECRET, team_id=None)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_event_team_fallback_is_bound_too(db):
    """Interaction payloads carry the workspace on ``event.team``; binding must
    read it, or those deliveries bypass the team check entirely."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = json.dumps({"type": "event_callback", "event": {"type": "app_mention", "team": OTHER_TEAM}}).encode()
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_SIGNATURE)


# ---------------------------------------------------------------------------
# Stage 9 — candidate set construction and credential hygiene
# ---------------------------------------------------------------------------


def test_bound_credential_id_that_does_not_exist_fails_closed(db):
    """A deployment naming an unknown credential 401s with its own message: the
    candidate set is empty, so no signature is ever evaluated — however well
    signed the delivery is."""
    env = build_deployment(db, bound_credential_id=uuid.uuid4())
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)  # right secret, unpinned id
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BOUND_CRED)


def test_bound_credential_id_owned_by_another_user_is_unavailable(db):
    """Cross-tenant: naming someone else's credential id must not make their
    secret a candidate for this deployment."""
    stranger = uuid.uuid4()
    cred = add_credential(db, stranger, secret=SECRET, team_id=TEAM)
    env = build_deployment(db, bound_credential_id=cred.id)  # owner is a different user
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BOUND_CRED)


def test_bound_credential_id_narrows_the_candidate_set(db):
    """With the credential pinned, the *other* workspace's credential is not a
    candidate even though it belongs to the same user."""
    owner = uuid.uuid4()
    pinned = add_credential(db, owner, secret=SECRET, team_id=TEAM, name="slack-a")
    add_credential(db, owner, secret=OTHER_SECRET, team_id=TEAM, name="slack-b")
    env = build_deployment(db, bound_credential_id=pinned.id, user_id=owner)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)
    assert_rejected(db, env.deployment, sign(OTHER_SECRET, ts, body), ts, body, ERR_SIGNATURE)


def test_credentials_of_another_user_are_never_candidates(db):
    """The candidate query is scoped to the deployment owner's rows."""
    env = build_deployment(db)
    add_credential(db, uuid.uuid4(), secret=SECRET, team_id=None)  # stranger's cred
    ts = str(FROZEN_NOW)
    body = handshake_body()
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


def test_non_slack_credentials_are_never_candidates(db):
    """A ``generic``/``mcp`` credential holding the same signing secret must not
    authenticate a Slack delivery."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM, cred_type="mcp")
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


@pytest.mark.parametrize(
    "config_override",
    [
        pytest.param({}, id="key-absent"),
        pytest.param({"signing_secret": ""}, id="empty-string"),
        pytest.param({"signing_secret": None}, id="explicit-null"),
        pytest.param({"signing_secret": 12345}, id="non-string"),
        pytest.param({"signing_secret": {"nested": "value"}}, id="dict"),
    ],
)
def test_credentials_without_a_usable_signing_secret_are_skipped(db, config_override):
    """A half-configured credential is not a candidate, so it can neither
    satisfy a delivery nor mask the real "no binding" error."""
    env = build_deployment(db, bound_team=TEAM)
    db.add(
        models.Credential(
            id=uuid.uuid4(),
            user_id=env.user_id,
            name="slack-events",
            type="slack",
            config={
                "webhook_url": "https://hooks.slack.com/services/T/B/x",
                "team_id": TEAM,
                **config_override,
            },
        )
    )
    db.commit()
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


def test_credential_resolution_failure_is_a_401_not_a_500(db, monkeypatch):
    """``resolve_credential`` raising (corrupt ciphertext, storage fault) is
    caught per-credential; the delivery is rejected, not errored."""
    from app.services import credentials as credentials_service

    def _boom(_cred):
        raise RuntimeError("credential backend unavailable")

    monkeypatch.setattr(credentials_service, "resolve_credential", _boom)
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


def test_undecryptable_secret_resolves_blank_and_fails_closed(db, monkeypatch):
    """Encryption key rotated away after the credential was stored: the secret
    resolves to "" (never the ciphertext) and the delivery is rejected."""
    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM, encrypt=True)
    monkeypatch.setattr(settings, "app_encryption_key", "")  # key removed
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


def test_deployment_whose_workflow_row_is_missing_fails_closed(db):
    """A dangling ``deployment.workflow_id`` yields no owner, hence no
    candidates — the delivery must not be waved through."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    db.delete(env.workflow)
    db.commit()
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


def test_deployment_whose_version_row_is_missing_falls_back_to_credential_binding(db):
    """No version → no trigger binding. The credential's own team still binds,
    and a foreign payload is still rejected (not silently accepted)."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    db.delete(env.version)
    db.commit()
    ts = str(FROZEN_NOW)
    good = event_body(team_id=TEAM)
    verify(db, env.deployment, sign(SECRET, ts, good), ts, good)
    bad = event_body(team_id=OTHER_TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, bad), ts, bad, ERR_SIGNATURE)


def test_no_credentials_at_all_reports_the_binding_requirement(db):
    """Distinct operator-facing message: "you never configured Slack" reads
    differently from "your signature is wrong"."""
    env = build_deployment(db)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    assert_rejected(db, env.deployment, sign(SECRET, ts, body), ts, body, ERR_BINDING_REQUIRED)


# ---------------------------------------------------------------------------
# Stage 10 — caller seam: authenticate_event_webhook
# ---------------------------------------------------------------------------


def slack_headers(secret: str, body: bytes, timestamp: str | None = None) -> dict[str, str]:
    ts = timestamp or str(FROZEN_NOW)
    return {
        "x-slack-signature": sign(secret, ts, body),
        "x-slack-request-timestamp": ts,
    }


def test_webhook_auth_accepts_a_slack_only_delivery(db):
    """No Aegis credential present — the Slack branch must authenticate it and
    return the workflow/deployment/version triple the run needs."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    body = event_body(team_id=TEAM)
    path = f"/v1/webhooks/{env.workflow.id}"

    workflow, deployment, version = authenticate_event_webhook(
        db, env.workflow.id, slack_headers(SECRET, body), body, path
    )
    assert workflow.id == env.workflow.id
    assert deployment.id == env.deployment.id
    assert version.id == env.version.id


def test_webhook_auth_answers_the_url_verification_handshake(db):
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    body = handshake_body()
    workflow, _deployment, _version = authenticate_event_webhook(
        db, env.workflow.id, slack_headers(SECRET, body), body, f"/v1/webhooks/{env.workflow.id}"
    )
    assert workflow.id == env.workflow.id


def test_webhook_auth_rejects_a_bad_slack_signature(db):
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    body = event_body(team_id=TEAM)
    with pytest.raises(HTTPException) as excinfo:
        authenticate_event_webhook(
            db,
            env.workflow.id,
            slack_headers(OTHER_SECRET, body),
            body,
            f"/v1/webhooks/{env.workflow.id}",
        )
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == ERR_SIGNATURE


def test_webhook_auth_takes_the_slack_branch_when_only_one_slack_header_present(db):
    """``if slack_sig or slack_ts`` — a lone timestamp header must not silently
    fall through to the Aegis HMAC scheme and produce a confusing error."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    body = event_body(team_id=TEAM)
    with pytest.raises(HTTPException) as excinfo:
        authenticate_event_webhook(
            db, env.workflow.id, {"x-slack-request-timestamp": str(FROZEN_NOW)}, body, "/v1/webhooks/x"
        )
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == ERR_SIGNATURE


def test_event_token_takes_precedence_over_slack_headers(db):
    """Header precedence is part of the contract: a *bad* event token must not
    be rescued by an otherwise valid Slack signature."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    body = event_body(team_id=TEAM)
    headers = slack_headers(SECRET, body) | {"x-aegis-event-token": "bogus"}
    with pytest.raises(HTTPException) as excinfo:
        authenticate_event_webhook(db, env.workflow.id, headers, body, "/v1/webhooks/x")
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == "Invalid event token"


def test_valid_event_token_ignores_a_bogus_slack_signature(db):
    """The mirror case: the token authenticates, so a garbage Slack header pair
    must not reject an otherwise authorized caller."""
    token = "aegis_event_" + uuid.uuid4().hex
    env = build_deployment(db, bound_team=TEAM)
    env.deployment.invoke_key_hash = hashlib.sha256(token.encode()).hexdigest()
    db.commit()
    body = event_body(team_id=OTHER_TEAM)
    headers = slack_headers(OTHER_SECRET, body) | {"x-aegis-event-token": token}

    workflow, _deployment, _version = authenticate_event_webhook(
        db, env.workflow.id, headers, body, f"/v1/webhooks/{env.workflow.id}"
    )
    assert workflow.id == env.workflow.id


def test_absent_slack_headers_fall_through_to_the_aegis_scheme(db):
    """No Slack headers → the Aegis HMAC path runs and reports its own error,
    proving the Slack branch was not taken."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    with pytest.raises(HTTPException) as excinfo:
        authenticate_event_webhook(db, env.workflow.id, {}, b"{}", "/v1/webhooks/x")
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == "Invalid webhook timestamp"


def test_unpublished_workflow_rejected_before_signature_verification(db):
    """Deployment state is checked first: an unpublished workflow 403s even with
    a perfectly valid Slack signature."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    env.workflow.published_version_id = None
    db.commit()
    body = event_body(team_id=TEAM)
    with pytest.raises(HTTPException) as excinfo:
        authenticate_event_webhook(
            db, env.workflow.id, slack_headers(SECRET, body), body, "/v1/webhooks/x"
        )
    assert excinfo.value.status_code == 403


def test_unknown_workflow_is_a_404(db):
    with pytest.raises(HTTPException) as excinfo:
        authenticate_event_webhook(db, uuid.uuid4(), {}, b"{}", "/v1/webhooks/x")
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "Workflow not found"


# ---------------------------------------------------------------------------
# Stage 11 — replay over time (the window is the only replay protection)
# ---------------------------------------------------------------------------


def test_same_delivery_replays_inside_the_window(db, clock):
    """DOCUMENTED BEHAVIOUR, not an endorsement: unlike the Aegis HMAC scheme
    there is no nonce/receipt store on the Slack path, so a captured delivery
    re-verifies until its timestamp ages out. Pinned so that adding receipt
    storage (or removing the window) is a deliberate, test-visible change.
    Slack mitigates this upstream by deduplicating on ``event_id``."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    signature = sign(SECRET, ts, body)

    verify(db, env.deployment, signature, ts, body)
    clock.now = float(FROZEN_NOW + 60)
    verify(db, env.deployment, signature, ts, body)  # still inside ±300s
    clock.now = float(FROZEN_NOW + WINDOW + 1)
    assert_rejected(db, env.deployment, signature, ts, body, ERR_EXPIRED)


def test_verification_is_stateless_across_sessions(db):
    """No counter, no receipt row: a second session sees the same verdict, which
    is what lets the API and a separate worker process both verify deliveries."""
    env = build_deployment(db, bound_team=TEAM)
    add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    signature = sign(SECRET, ts, body)

    verify(db, env.deployment, signature, ts, body)
    before = db.query(models.DeploymentWebhookReceipt).count()
    verify(db, env.deployment, signature, ts, body)
    assert db.query(models.DeploymentWebhookReceipt).count() == before == 0


def test_verification_does_not_mutate_the_deployment_or_credentials(db):
    """Read-only auth path: nothing on the hot path writes rows."""
    env = build_deployment(db, bound_team=TEAM)
    cred = add_credential(db, env.user_id, secret=SECRET, team_id=TEAM)
    ts = str(FROZEN_NOW)
    body = event_body(team_id=TEAM)
    snapshot = (
        env.deployment.invoke_key_hash,
        env.deployment.webhook_secret_encrypted,
        json.dumps(cred.config, sort_keys=True, default=str),
    )

    verify(db, env.deployment, sign(SECRET, ts, body), ts, body)

    db.refresh(env.deployment)
    db.refresh(cred)
    assert (
        env.deployment.invoke_key_hash,
        env.deployment.webhook_secret_encrypted,
        json.dumps(cred.config, sort_keys=True, default=str),
    ) == snapshot


# ---------------------------------------------------------------------------
# Stage 12 — real-clock sanity (the frozen clock is a test artifact)
# ---------------------------------------------------------------------------


def test_current_wall_clock_timestamp_is_accepted(monkeypatch):
    """Guard against the frozen clock hiding a unit mismatch: a signature built
    from ``time.time()`` right now must verify under the real clock."""
    monkeypatch.undo()  # restore event_secrets.time to the real module
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        env = build_deployment(session, bound_team=TEAM)
        add_credential(session, env.user_id, secret=SECRET, team_id=TEAM)
        ts = str(int(time.time()))
        body = event_body(team_id=TEAM)
        verify(session, env.deployment, sign(SECRET, ts, body), ts, body)
    finally:
        session.close()
        engine.dispose()
