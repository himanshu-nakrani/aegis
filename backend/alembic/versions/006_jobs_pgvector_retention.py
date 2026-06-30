"""Background jobs, scheduler index, optional pgvector column.

Revision ID: 006_jobs_pgvector_retention
Revises: 005_schedule_last_fired
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006_jobs_pgvector_retention"
down_revision = "005_schedule_last_fired"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS background_jobs (
            id UUID PRIMARY KEY,
            job_type VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'queued',
            user_id UUID,
            workflow_id UUID,
            payload_json JSON,
            result_json JSON,
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_background_jobs_job_type ON background_jobs (job_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_background_jobs_status ON background_jobs (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_background_jobs_user_id ON background_jobs (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_background_jobs_workflow_id ON background_jobs (workflow_id)")

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_workflow_schedules_active
        ON workflow_schedules (enabled, cron_valid)
        WHERE enabled IS TRUE AND cron_valid IS TRUE
        """
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        op.execute(
            """
            ALTER TABLE knowledge_documents
            ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE knowledge_documents DROP COLUMN IF EXISTS embedding_vector")
    op.execute("DROP INDEX IF EXISTS ix_workflow_schedules_active")
    op.drop_table("background_jobs")