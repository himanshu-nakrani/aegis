"""Durable per-minute schedule claim on workflow_runs.

The scheduler used to claim a fire minute by CAS-ing
``workflow_schedules.last_fired_at``. With multi-minute catch-up one row cannot
record several claimed minutes: a later claim overwrites the stamp, so
releasing an earlier minute matches nothing (lost fire), and clearing the stamp
to NULL erases the evidence that earlier minutes already ran (double fire).

The pending run row IS the claim now: ``(schedule_id, minute_key)`` unique on
``workflow_runs`` makes a duplicate claim fail atomically at insert, survives
process restarts, and needs no release path — a minute without a run row was
never claimed.

NULL-pairs stay non-conflicting on both dialects, so non-scheduled runs are
unaffected.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "035_run_schedule_minute_claim"
down_revision: Union[str, Sequence[str], None] = "034_external_wf_name_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "uq_workflow_runs_schedule_minute"


def upgrade() -> None:
    with op.batch_alter_table("workflow_runs") as batch_op:
        batch_op.add_column(sa.Column("schedule_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("minute_key", sa.String(32), nullable=True))
        batch_op.create_index(_INDEX, ["schedule_id", "minute_key"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("workflow_runs") as batch_op:
        batch_op.drop_index(_INDEX)
        batch_op.drop_column("minute_key")
        batch_op.drop_column("schedule_id")
