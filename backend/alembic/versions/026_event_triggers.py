"""Multi-schedule workflows + inbound event webhooks.

Drops the UNIQUE constraint on ``workflow_schedules.workflow_id`` so one
workflow can carry N schedule rows (canvas ``scheduleCrons`` list, keyed
per-row by schedule id downstream). SQLite's unnamed inline UNIQUE has no
addressable name, so the table is batch-recreated from an explicit constraint
-free definition (``copy_from``); Postgres drops the named ``..._key``
constraint directly. Indexes are recreated after the SQLite recreate —
``ix_workflow_schedules_active`` keeps its partial WHERE.

sa.Uuid everywhere (CHAR(32) on SQLite, native UUID on Postgres — see 021).

Revision ID: 026_event_triggers
Revises: 025_prompt_registry
"""

from __future__ import annotations

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "026_event_triggers"
down_revision: Union[str, Sequence[str], None] = "025_prompt_registry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TS_DEFAULT = sa.text("CURRENT_TIMESTAMP")
_ACTIVE_WHERE = sa.text("enabled IS TRUE AND cron_valid IS TRUE")


def _schedule_table(meta: sa.MetaData, *, unique_workflow: bool) -> sa.Table:
    args: list = [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), nullable=False),
        sa.Column("workflow_version_id", sa.Uuid(), nullable=False),
        sa.Column("cron_expr", sa.String(length=128), nullable=False),
        sa.Column("trigger_node_id", sa.String(length=128), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cron_valid", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_TS_DEFAULT,
        ),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"]),
        sa.ForeignKeyConstraint(["workflow_version_id"], ["workflow_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    ]
    if unique_workflow:
        args.append(sa.UniqueConstraint("workflow_id"))
    return sa.Table("workflow_schedules", meta, *args)


def _workflow_id_unique_names(bind) -> set[str]:
    return {
        c["name"]
        for c in sa.inspect(bind).get_unique_constraints("workflow_schedules")
        if c.get("column_names") == ["workflow_id"] and c.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        meta = sa.MetaData()
        copy_from = _schedule_table(meta, unique_workflow=False)
        with op.batch_alter_table(
            "workflow_schedules", copy_from=copy_from, recreate="always"
        ) as batch_op:
            batch_op.alter_column(
                "workflow_id",
                existing_type=sa.Uuid(),
                type_=sa.Uuid(),
                existing_nullable=False,
            )
        existing_indexes = {
            ix["name"] for ix in sa.inspect(bind).get_indexes("workflow_schedules")
        }
        if "ix_workflow_schedules_workflow_id" not in existing_indexes:
            op.create_index(
                "ix_workflow_schedules_workflow_id",
                "workflow_schedules",
                ["workflow_id"],
            )
        if "ix_workflow_schedules_active" not in existing_indexes:
            op.create_index(
                "ix_workflow_schedules_active",
                "workflow_schedules",
                ["enabled", "cron_valid"],
                sqlite_where=_ACTIVE_WHERE,
            )
        return

    for name in _workflow_id_unique_names(bind):
        op.drop_constraint(name, "workflow_schedules", type_="unique")


def downgrade() -> None:
    bind = op.get_bind()

    # Re-applying UNIQUE requires single-tenant rows; keep the newest
    # updated_at per workflow (same dedupe shape as 014).
    op.execute(
        sa.text(
            """
            DELETE FROM workflow_schedules
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY workflow_id
                               ORDER BY updated_at DESC
                           ) AS rn
                    FROM workflow_schedules
                ) ranked
                WHERE rn = 1
            )
            """
        )
    )

    if bind.dialect.name == "sqlite":
        meta = sa.MetaData()
        copy_from = _schedule_table(meta, unique_workflow=True)
        with op.batch_alter_table(
            "workflow_schedules", copy_from=copy_from, recreate="always"
        ) as batch_op:
            batch_op.alter_column(
                "workflow_id",
                existing_type=sa.Uuid(),
                type_=sa.Uuid(),
                existing_nullable=False,
            )
        existing_indexes = {
            ix["name"] for ix in sa.inspect(bind).get_indexes("workflow_schedules")
        }
        if "ix_workflow_schedules_workflow_id" not in existing_indexes:
            op.create_index(
                "ix_workflow_schedules_workflow_id",
                "workflow_schedules",
                ["workflow_id"],
            )
        if "ix_workflow_schedules_active" not in existing_indexes:
            op.create_index(
                "ix_workflow_schedules_active",
                "workflow_schedules",
                ["enabled", "cron_valid"],
                sqlite_where=_ACTIVE_WHERE,
            )
        return

    if not _workflow_id_unique_names(bind):
        op.create_unique_constraint(
            "workflow_schedules_workflow_id_key",
            "workflow_schedules",
            ["workflow_id"],
        )
