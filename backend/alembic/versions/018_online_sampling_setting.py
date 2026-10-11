"""Persist the instance-wide online evaluation sampling override.

Revision ID: 018_online_sampling_setting
Revises: 017_approval_requests
"""

import sqlalchemy as sa
from alembic import op

from app.db.models import JSONType

revision = "018_online_sampling_setting"
down_revision = "017_approval_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operational_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value_json", JSONType(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("operational_settings")
