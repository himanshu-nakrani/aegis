"""Repair SQLite type affinity for columns declared with sa.UUID() in older
revisions.

Those revisions emit literal ``UUID`` DDL, which SQLite resolves to NUMERIC
affinity: a hex UUID string that happens to be all digits (e.g. the default
user ``00000000-...-0001``) is stored as an INTEGER, and later reads crash in
the UUID type processor. This revision recreates each affected table via
batch_alter_table with sa.Uuid (CHAR(32) on SQLite, native UUID on Postgres)
and converts any already-integer-stored values back to 32-char hex.

Postgres is unaffected (native UUID type) and skipped. Fresh builds get correct
DDL from the patched source revisions; this migration still normalizes any
values written while the wrong affinity was in effect.

Revision ID: 021
Revises: 020
"""

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "021_sqlite_uuid_affinity"
down_revision: Union[str, Sequence[str], None] = "020_durable_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column, nullable, server_default) captured from the schema produced
# by revisions 001-020 on SQLite (pragma_table_info where type='UUID').
_UUID_COLUMNS: list[tuple[str, str, bool, str | None]] = [
    ("alert_events", "id", False, None),
    ("alert_events", "rule_id", False, None),
    ("alert_rules", "id", False, None),
    ("alert_rules", "workflow_id", True, None),
    ("audit_log", "id", False, None),
    ("background_jobs", "id", False, None),
    ("background_jobs", "user_id", True, None),
    ("background_jobs", "workflow_id", True, None),
    ("credentials", "id", False, None),
    ("credentials", "user_id", False, None),
    ("dataset_items", "id", False, None),
    ("dataset_items", "dataset_id", False, None),
    ("datasets", "id", False, None),
    ("datasets", "workflow_id", False, None),
    ("evaluation_presets", "id", False, None),
    ("evaluation_presets", "user_id", False, None),
    ("experiments", "id", False, None),
    ("experiments", "workflow_id", False, None),
    ("experiments", "dataset_id", False, None),
    ("experiments", "version_id", False, None),
    ("experiments", "baseline_version_id", True, None),
    ("feedback", "id", False, None),
    ("feedback", "run_id", False, None),
    ("guardrail_policies", "id", False, None),
    ("knowledge_documents", "id", False, None),
    ("knowledge_documents", "workflow_id", False, None),
    ("llm_calls", "id", False, None),
    ("llm_calls", "run_id", False, None),
    ("node_results", "id", False, None),
    ("node_results", "run_id", False, None),
    ("observability_rollups", "id", False, None),
    ("observability_rollups", "user_id", False, None),
    ("observability_rollups", "workflow_id", True, None),
    ("run_spans", "id", False, None),
    ("run_spans", "run_id", False, None),
    ("run_spans", "parent_span_id", True, None),
    ("workflow_memory", "id", False, None),
    ("workflow_memory", "workflow_id", False, None),
    ("workflow_runs", "id", False, None),
    ("workflow_runs", "workflow_version_id", False, None),
    ("workflow_schedules", "id", False, None),
    ("workflow_schedules", "workflow_id", False, None),
    ("workflow_schedules", "workflow_version_id", False, None),
    ("workflow_templates", "id", False, None),
    ("workflow_templates", "source_workflow_id", True, None),
    ("workflow_versions", "id", False, None),
    ("workflow_versions", "workflow_id", False, None),
    ("workflows", "id", False, None),
    ("workflows", "user_id", False, "'00000000-0000-0000-0000-000000000001'"),
]


def _columns_with_broken_affinity(bind, table: str) -> set[str]:
    """Columns whose declared type yields NUMERIC affinity — ``UUID`` (the
    original defect) or ``NUMERIC`` (left behind if a batch recreate ran under
    the wrong existing_type on a partially repaired database)."""
    cols: set[str] = set()
    for row in bind.exec_driver_sql(f"PRAGMA table_info({table})"):
        # cid, name, type, notnull, dflt_value, pk
        if str(row[2]).upper() in {"UUID", "NUMERIC"}:
            cols.add(str(row[1]))
    return cols


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        return

    for table, column, nullable, default in _UUID_COLUMNS:
        # Table may not exist if its creating revision was skipped in a
        # squashed baseline — guard cheaply.
        exists = bind.exec_driver_sql(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=:t",
            {"t": table},
        ).scalar()
        if not exists:
            continue
        if column not in _columns_with_broken_affinity(bind, table):
            continue
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column(
                column,
                # The on-disk (NUMERIC-affinity) decl, then the corrected type.
                existing_type=sa.UUID(),
                type_=sa.Uuid(),
                existing_nullable=nullable,
                # batch recreate would otherwise drop a quoted text default.
                existing_server_default=sa.text(default) if default is not None else None,
            )

        # An integer stored under NUMERIC affinity comes back as either int or
        # short all-digit text after the CHAR(32) recreate; normalize both to
        # canonical 32-char lowercase hex. length<32 + digits only matches
        # corruption (a real UUID is exactly 32 hex chars).
        bind.exec_driver_sql(
            f"UPDATE {table} SET {column} = "
            f"lower(printf('%032x', CAST({column} AS INTEGER))) "
            f"WHERE typeof({column}) = 'integer' "
            f"OR (typeof({column}) = 'text' AND length({column}) < 32 "
            f"AND {column} GLOB '[0-9]*')"
        )


def downgrade() -> None:
    # Downgrading would reintroduce lossy NUMERIC affinity — intentionally a
    # no-op; stored data is unchanged either way.
    pass
