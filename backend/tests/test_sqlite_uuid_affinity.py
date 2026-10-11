"""Regression coverage for the SQLite NUMERIC-affinity UUID defect fixed by
revision 021 (sa.UUID() DDL → integer-stored all-digit UUIDs).

conftest builds the schema via create_all (sa.Uuid → CHAR(32)), so this needs
a real Alembic-migrated database — a dedicated fixture, not the shared one.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_CFG = BACKEND_DIR / "alembic.ini"
DEFAULT_DEV_USER = "00000000-0000-0000-0000-000000000001"


def _upgrade(tmp_path: Path) -> Path:
    """Run `alembic upgrade head` against a scratch file. env.py resolves the
    URL from the settings singleton, not from this Config — override it and
    restore afterward."""
    db_path = tmp_path / "migrated.db"
    cfg = Config(str(ALEMBIC_CFG))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    os.environ.setdefault("GOOGLE_API_KEY", "test-key")
    from app.config import settings
    original = settings.database_url
    settings.database_url = f"sqlite:///{db_path}"
    try:
        command.upgrade(cfg, "head")
    finally:
        settings.database_url = original
    return db_path

def _broken_db(tmp_path: Path) -> Path:
    """Hand-build the pre-021 defect: UUID-affinity column + an int-stored
    all-digit UUID (what bound hex collapses to under NUMERIC affinity)."""
    db_path = tmp_path / "broken.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE workflows ("
        "id UUID PRIMARY KEY, name TEXT NOT NULL, "
        "user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL)"
    )
    conn.execute(
        "INSERT INTO workflows (id, name, user_id) VALUES (?, 'x', ?)",
        (uuid.uuid4().hex, "00000000000000000000000000000001"),
    )
    conn.commit()
    # NUMERIC affinity has already collapsed the all-digit string to int.
    assert conn.execute("SELECT typeof(user_id) FROM workflows").fetchone() == ("integer",)
    conn.close()
    return db_path


def _run_021(db_path: Path) -> None:
    """Apply only revision 021's upgrade() against an already-built DB."""
    import importlib.util
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    spec = importlib.util.spec_from_file_location(
        "mig021", BACKEND_DIR / "alembic" / "versions" / "021_sqlite_uuid_affinity.py"
    )
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)

    engine = sa.create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            mig.upgrade()
        conn.commit()


def test_fresh_alembic_build_declares_uuid_columns_as_char32(tmp_path):
    """Fresh `alembic upgrade head` must produce TEXT-affinity UUID columns —
    the sa.Uuid patch, not just 021's repair."""
    db_path = _upgrade(tmp_path)
    conn = sqlite3.connect(db_path)
    try:
        cols = conn.execute("PRAGMA table_info(workflows)").fetchall()
        types = {row[1]: row[2].upper() for row in cols}
        assert types["id"] == "CHAR(32)", types
        assert types["user_id"] == "CHAR(32)", types
        # Spot-check a second table from the 021 inventory.
        wr = conn.execute("PRAGMA table_info(workflow_runs)").fetchall()
        assert {r[1]: r[2].upper() for r in wr}["id"] == "CHAR(32)"
    finally:
        conn.close()


def test_revision_021_repairs_int_stored_uuid(tmp_path):
    db_path = _broken_db(tmp_path)
    _run_021(db_path)
    conn = sqlite3.connect(db_path)
    try:
        stored_type, value, declared = conn.execute(
            "SELECT typeof(user_id), user_id, "
            "(SELECT sql FROM sqlite_master WHERE name='workflows') FROM workflows"
        ).fetchone()
        assert stored_type == "text"
        assert value == "00000000000000000000000000000001"
        assert "user_id CHAR(32)" in declared
    finally:
        conn.close()


def test_revision_021_leaves_normal_uuid_rows_untouched(tmp_path):
    """Rows that were always fine (mixed-case hex, letters present) survive
    the repair with their value unchanged."""
    db_path = _broken_db(tmp_path)
    conn = sqlite3.connect(db_path)
    good = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO workflows (id, name, user_id) VALUES (?, 'y', ?)",
        (uuid.uuid4().hex, good),
    )
    conn.commit()
    conn.close()
    _run_021(db_path)
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute("SELECT name, user_id, typeof(user_id) FROM workflows ORDER BY name").fetchall()
        assert rows[0][1] == "00000000000000000000000000000001"  # repaired
        assert rows[1][1] == good and rows[1][2] == "text"       # untouched
    finally:
        conn.close()

def test_revision_021_restores_decimal_digits_not_hex(tmp_path):
    """A numeric UUID like …0010 collapses to integer 10; the repair must
    restore the DECIMAL string …0010, not hex …000a (a different UUID)."""
    db_path = tmp_path / "ten.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE workflows ("
        "id UUID PRIMARY KEY, name TEXT NOT NULL, "
        "user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL)"
    )
    conn.execute(
        "INSERT INTO workflows (id, name, user_id) VALUES (?, 'ten', ?)",
        (uuid.uuid4().hex, "00000000000000000000000000000010"),
    )
    conn.commit()
    assert conn.execute("SELECT typeof(user_id) FROM workflows").fetchone() == ("integer",)
    conn.close()
    _run_021(db_path)
    conn = sqlite3.connect(db_path)
    try:
        value, kind = conn.execute("SELECT user_id, typeof(user_id) FROM workflows").fetchone()
        assert value == "00000000000000000000000000000010", "must restore decimal, not hex 000a"
        assert kind == "text"
    finally:
        conn.close()


def test_migrated_db_serves_workflow_create_and_refresh(tmp_path):
    """End-to-end the original crash: insert via the real models on a migrated
    DB and refresh — db.refresh must not hit the int→UUID AttributeError."""
    db_path = _upgrade(tmp_path)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ.setdefault("GOOGLE_API_KEY", "test-key")

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import models

    engine = create_engine(f"sqlite:///{db_path}")
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        from app.auth.deps import DEFAULT_DEV_USER_ID
        wf = models.Workflow(name="migrated", user_id=DEFAULT_DEV_USER_ID)
        session.add(wf)
        session.commit()
        session.refresh(wf)  # the call that raised 'int' has no attribute 'replace'
        assert wf.user_id == DEFAULT_DEV_USER_ID
        # And the value round-trips as a UUID on read.
        loaded = session.query(models.Workflow).filter(models.Workflow.id == wf.id).one()
        assert loaded.user_id == DEFAULT_DEV_USER_ID
    finally:
        session.close()
        engine.dispose()
