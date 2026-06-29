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
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS observability_rollups (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL,
            workflow_id UUID,
            bucket_hour TIMESTAMPTZ NOT NULL,
            run_count INTEGER NOT NULL DEFAULT 0,
            completed_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            eval_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
            eval_count INTEGER NOT NULL DEFAULT 0,
            guardrail_blocked_count INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_observability_rollups_bucket
                UNIQUE (user_id, workflow_id, bucket_hour)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_observability_rollups_user_id ON observability_rollups (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_observability_rollups_workflow_id ON observability_rollups (workflow_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_observability_rollups_bucket_hour ON observability_rollups (bucket_hour)"
    )


def downgrade() -> None:
    op.drop_table("observability_rollups")
    op.execute("DROP INDEX IF EXISTS ix_workflow_runs_active_status")