"""Schedule created_at, so restart catch-up can skip minutes before the row existed.

Existing rows are stamped at the epoch. They predate the column and must stay
eligible for the catch-up window. New inserts take the current time.

Revision ID: 036_schedule_created_at
Revises: 035_run_schedule_minute_claim
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "036_schedule_created_at"
down_revision: Union[str, Sequence[str], None] = "035_run_schedule_minute_claim"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("workflow_schedules") as batch_op:
        batch_op.add_column(
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            )
        )
    # ADD COLUMN stamps every existing row with the migration time. That would
    # make the next restart treat those schedules as brand new and drop the
    # catch-up window. Epoch keeps them eligible.
    op.execute("UPDATE workflow_schedules SET created_at = '1970-01-01 00:00:00'")


def downgrade() -> None:
    with op.batch_alter_table("workflow_schedules") as batch_op:
        batch_op.drop_column("created_at")
