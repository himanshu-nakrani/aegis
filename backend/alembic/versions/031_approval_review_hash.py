"""Persist tool-approval invocation identity for resume reuse.

``park_approval`` re-parks the same deterministic key on resume, but until
now it always inserted a fresh row: a pre-crash approval decision sat on the
old row while the resumed waiter polled the new one until timeout. The
``review_hash`` lets park find the durable row for the same invocation
(tool + arguments) and reuse its decision instead of re-asking.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "031_approval_review_hash"
down_revision: Union[str, Sequence[str], None] = "030_rollup_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("approval_requests") as batch_op:
        batch_op.add_column(sa.Column("review_hash", sa.String(64), nullable=True))
        batch_op.create_index(
            "ix_approval_requests_run_review", ["run_id", "review_hash"]
        )


def downgrade() -> None:
    with op.batch_alter_table("approval_requests") as batch_op:
        batch_op.drop_index("ix_approval_requests_run_review")
        batch_op.drop_column("review_hash")
