"""Add context_patch to run_checkpoints.

A completed checkpoint stored only the node's output, not the mutations that
node made to the shared workflow context (``set_fields`` writing ``input.*``,
memory writes). On resume those side effects were lost, so a downstream
``{{input.customer_id}}`` set before the crash resolved empty. The nullable
JSON column snapshots the mutable context (``input`` + ``memory``) at
completion; resume restores the latest patch.

Nullable add_column only — works on SQLite and Postgres without
batch_alter_table.

Revision ID: 028_checkpoint_context_patch
Revises: 027_chat_token_revocation
"""

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "028_checkpoint_context_patch"
down_revision: Union[str, Sequence[str], None] = "027_chat_token_revocation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "run_checkpoints",
        sa.Column("context_patch", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("run_checkpoints", "context_patch")
