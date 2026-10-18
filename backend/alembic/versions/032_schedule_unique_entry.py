"""Unique (workflow_id, trigger_node_id, cron_expr) on workflow_schedules.

``sync_workflow_schedule`` read-then-writes with no mutual exclusion: two
concurrent saves of the same graph both miss the entry and both insert,
producing duplicate rows that fire the same cron twice. The unique
constraint turns the race into an IntegrityError the sync retries as a
re-read. Legacy NULL ``trigger_node_id`` rows are backfilled to '' first so
the constraint is NULL-safe on both dialects.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "032_schedule_unique_entry"
down_revision: Union[str, Sequence[str], None] = "031_approval_review_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "uq_workflow_schedules_entry"


def _dedup_existing() -> None:
    """Keep the oldest row per entry; drop newer duplicates (same version pin
    family — the surviving row is re-pinned by the next sync)."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    id_col = "rowid" if dialect == "sqlite" else "ctid"
    conn.execute(
        sa.text(
            "UPDATE workflow_schedules SET trigger_node_id = '' "
            "WHERE trigger_node_id IS NULL"
        )
    )
    dup_groups = conn.execute(
        sa.text(
            "SELECT workflow_id, trigger_node_id, cron_expr, COUNT(*) AS n "
            "FROM workflow_schedules "
            "GROUP BY workflow_id, trigger_node_id, cron_expr HAVING COUNT(*) > 1"
        )
    ).all()
    for workflow_id, trigger_node_id, cron_expr, _n in dup_groups:
        rows = conn.execute(
            sa.text(
                f"SELECT id, {id_col} AS ordering FROM workflow_schedules "
                "WHERE workflow_id = :wid AND trigger_node_id = :tid AND cron_expr = :cron "
                f"ORDER BY {id_col}"
            ),
            {"wid": workflow_id, "tid": trigger_node_id, "cron": cron_expr},
        ).all()
        for row in rows[1:]:
            conn.execute(
                sa.text("DELETE FROM workflow_schedules WHERE id = :rid"),
                {"rid": row[0]},
            )


def upgrade() -> None:
    _dedup_existing()
    with op.batch_alter_table("workflow_schedules") as batch_op:
        batch_op.alter_column("trigger_node_id", existing_type=sa.String(128), nullable=False, server_default="")
        batch_op.create_unique_constraint(
            _CONSTRAINT, ["workflow_id", "trigger_node_id", "cron_expr"]
        )


def downgrade() -> None:
    with op.batch_alter_table("workflow_schedules") as batch_op:
        batch_op.drop_constraint(_CONSTRAINT, type_="unique")
        batch_op.alter_column("trigger_node_id", existing_type=sa.String(128), nullable=True)
