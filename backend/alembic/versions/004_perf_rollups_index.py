"""Performance: partial active-run index and observability rollups.

Revision ID: 004_perf_rollups_index
Revises: 003_performance_indexes
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004_perf_rollups_index"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_workflow_runs_active_status
        ON workflow_runs (status)
        WHERE status IN ('pending', 'running', 'awaiting_approval')
        """
    )
    op.create_table(
        "observability_rollups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("bucket_hour", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("eval_sum", sa.Float(), nullable=False, server_default="0"),
        sa.Column("eval_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("guardrail_blocked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "workflow_id", "bucket_hour", name="uq_observability_rollups_bucket"),
    )


def downgrade() -> None:
    op.drop_table("observability_rollups")
    op.execute("DROP INDEX IF EXISTS ix_workflow_runs_active_status")