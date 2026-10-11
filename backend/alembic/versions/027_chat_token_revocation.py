"""Add chat_token_revoked_at to workflow_deployments.

Sessions minted from an ``aegis_chat_`` exchange token live up to 12h, but
revocation/rotation only cleared the token hash — outstanding HMAC sessions
kept invoking. The nullable timestamp records when the backing token was
revoked or rotated so ``chat_invoke`` can reject sessions minted before it.

Nullable add_column only — works on SQLite and Postgres without
batch_alter_table.

Revision ID: 027_chat_token_revocation
Revises: 026_event_triggers
"""

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "027_chat_token_revocation"
down_revision: Union[str, Sequence[str], None] = "026_event_triggers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_deployments",
        sa.Column("chat_token_revoked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workflow_deployments", "chat_token_revoked_at")
