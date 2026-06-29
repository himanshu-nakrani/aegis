"""Release 2.5: user_id, webhook_url

Revision ID: 002
Revises: 001
Create Date: 2026-06-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, Sequence[str], None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_USER = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.add_column(
        "workflows",
        sa.Column("user_id", sa.UUID(), nullable=False, server_default=DEFAULT_USER),
    )
    op.add_column("workflows", sa.Column("webhook_url", sa.String(length=512), nullable=True))
    op.create_index("ix_workflows_user_id", "workflows", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_workflows_user_id", table_name="workflows")
    op.drop_column("workflows", "webhook_url")
    op.drop_column("workflows", "user_id")