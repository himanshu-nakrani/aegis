"""Per-run rollup ledger: a logical run counts once however many attempts.

``execute_run``'s ``finally`` records an observability rollup on every exit,
so a crash + checkpoint resume counted the same logical run twice (attempt 1
and resume attempt 2 each +1). The ledger holds one row per run_id with the
last-counted attempt and its bucket contribution: a same-attempt refire is a
no-op, and a newer attempt replaces the prior contribution (subtracted from
its original bucket, added to the new one) instead of double-counting.

Revision ID: 030_rollup_ledger
Revises: 029_version_number_unique
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "030_rollup_ledger"
down_revision: Union[str, Sequence[str], None] = "029_version_number_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "run_rollup_ledger",
        sa.Column("run_id", sa.Uuid, nullable=False),
        sa.Column("attempt", sa.Integer, nullable=False, server_default="1"),
        sa.Column("bucket_hour", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="completed"),
        sa.Column("completed_inc", sa.Integer, nullable=False, server_default="0"),
        sa.Column("failed_inc", sa.Integer, nullable=False, server_default="0"),
        sa.Column("guardrail_inc", sa.Integer, nullable=False, server_default="0"),
        sa.Column("eval_inc", sa.Integer, nullable=False, server_default="0"),
        sa.Column("eval_sum_inc", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("run_id", name="pk_run_rollup_ledger"),
    )
    op.create_index("ix_run_rollup_ledger_bucket", "run_rollup_ledger", ["bucket_hour"])


def downgrade() -> None:
    op.drop_index("ix_run_rollup_ledger_bucket", table_name="run_rollup_ledger")
    op.drop_table("run_rollup_ledger")
