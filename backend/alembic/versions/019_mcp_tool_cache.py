"""Cache public MCP tool descriptors on owner-scoped credentials.

Revision ID: 019_mcp_tool_cache
Revises: 018_online_sampling_setting
"""

import sqlalchemy as sa
from alembic import op

from app.db.models import JSONType

revision = "019_mcp_tool_cache"
down_revision = "018_online_sampling_setting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("credentials", sa.Column("mcp_tool_cache", JSONType(), nullable=True))


def downgrade() -> None:
    op.drop_column("credentials", "mcp_tool_cache")
