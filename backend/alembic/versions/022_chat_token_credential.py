"""Add chat_token credential columns to workflow_deployments.

Hosted chat links exchange a deployment-scoped ``aegis_chat_`` token for a
short-lived session; only its sha256 digest and expiry are stored. Nullable
add_column only — works on SQLite and Postgres without batch_alter_table.

Revision ID: 022
Revises: 021
"""

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "022_chat_token_credential"
down_revision: Union[str, Sequence[str], None] = "021_sqlite_uuid_affinity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_deployments",
        sa.Column("chat_token_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "workflow_deployments",
        sa.Column("chat_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workflow_deployments", "chat_token_expires_at")
    op.drop_column("workflow_deployments", "chat_token_hash")
