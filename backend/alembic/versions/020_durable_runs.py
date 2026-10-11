"""Durable run transport: run_events replay log + run_checkpoints resume table.

Revision ID: 020_durable_runs
Revises: 019_mcp_tool_cache
"""

import sqlalchemy as sa
from alembic import op

from app.db.models import JSONType

revision = "020_durable_runs"
down_revision = "019_mcp_tool_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # (run_id, seq) composite PK already covers replay lookups — no secondary index.
    op.create_table(
        "run_events",
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("seq", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("payload", JSONType(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "run_checkpoints",
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("node_id", sa.String(128), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="started"),
        sa.Column("output", JSONType(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("run_checkpoints")
    op.drop_table("run_events")
