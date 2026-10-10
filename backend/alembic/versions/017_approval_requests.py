"""Record approval metadata without making process-local waits durable.

Revision ID: 017_approval_requests
Revises: 016_deployment_credentials
"""

import sqlalchemy as sa
from alembic import op

from app.db.models import JSONType

revision = "017_approval_requests"
down_revision = "016_deployment_credentials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "approval_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(128), nullable=False),
        sa.Column("assignee", sa.String(255), nullable=True),
        sa.Column("escalation_timeout_seconds", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("notification_channels", JSONType(), nullable=False),
        sa.Column("notification_errors", JSONType(), nullable=False),
        sa.Column("parked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
    )
    op.create_index("ix_approval_requests_run_node", "approval_requests", ["run_id", "node_id"])


def downgrade() -> None:
    op.drop_index("ix_approval_requests_run_node", table_name="approval_requests")
    op.drop_table("approval_requests")
