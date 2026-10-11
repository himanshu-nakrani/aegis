"""Per-deployment invoke credentials and durable webhook replay receipts.

Revision ID: 016_deployment_credentials
Revises: 015_run_overrides_and_index

Existing publications deliberately receive no credentials: owners must provision
an invoke key or encrypted webhook secret before accepting deployed traffic.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "016_deployment_credentials"
down_revision = "015_run_overrides_and_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_deployments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Uuid(), sa.ForeignKey("workflow_versions.id"), nullable=False),
        sa.Column("invoke_key_hash", sa.String(64), nullable=True),
        sa.Column("webhook_secret_encrypted", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workflow_id"),
    )
    op.create_table(
        "deployment_webhook_receipts",
        sa.Column("deployment_id", sa.Uuid(), sa.ForeignKey("workflow_deployments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("nonce", sa.String(128), primary_key=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_deployment_webhook_receipts_expires_at", "deployment_webhook_receipts", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_deployment_webhook_receipts_expires_at", table_name="deployment_webhook_receipts")
    op.drop_table("deployment_webhook_receipts")
    op.drop_table("workflow_deployments")
