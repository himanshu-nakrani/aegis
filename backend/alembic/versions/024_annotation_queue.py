"""Add the annotation_tasks review queue.

Phase 5: runs flagged by thumbs-down feedback, low-eval/failed capture, or a
manual "queue for review" wait here for a human label; the label then lands in
a dataset through the shared copy_runs seam. Queue membership is deduped per
(user_id, run_id); all UUID columns use sa.Uuid per the 021 SQLite-affinity
precedent.

Revision ID: 024
Revises: 023
"""

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "024_annotation_queue"
down_revision: Union[str, Sequence[str], None] = "023_knowledge_doc_provenance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "annotation_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "run_id",
            sa.Uuid(),
            sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workflow_id",
            sa.Uuid(),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("assignee", sa.String(255), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("expected_output", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column(
            "dataset_item_id",
            sa.Uuid(),
            sa.ForeignKey("dataset_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("labeled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "run_id", name="uq_annotation_tasks_user_run"),
    )
    op.create_index("ix_annotation_tasks_user_id", "annotation_tasks", ["user_id"])
    op.create_index("ix_annotation_tasks_run_id", "annotation_tasks", ["run_id"])
    op.create_index("ix_annotation_tasks_workflow_id", "annotation_tasks", ["workflow_id"])
    op.create_index(
        "ix_annotation_tasks_status_created", "annotation_tasks", ["status", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_annotation_tasks_status_created", table_name="annotation_tasks")
    op.drop_index("ix_annotation_tasks_workflow_id", table_name="annotation_tasks")
    op.drop_index("ix_annotation_tasks_run_id", table_name="annotation_tasks")
    op.drop_index("ix_annotation_tasks_user_id", table_name="annotation_tasks")
    op.drop_table("annotation_tasks")
