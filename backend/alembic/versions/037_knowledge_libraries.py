"""Knowledge libraries and persisted playground runs.

Libraries own chunk rows independently of a workflow. Existing workflow
documents keep workflow_id and a null knowledge_base_id.

Revision ID: 037_knowledge_libraries
Revises: 036_schedule_created_at
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "037_knowledge_libraries"
down_revision: Union[str, Sequence[str], None] = "036_schedule_created_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("settings_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_bases_user", "knowledge_bases", ["user_id"])
    op.create_table(
        "playground_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("prompt_id", sa.Uuid(), nullable=True),
        sa.Column("prompt_version", sa.Integer(), nullable=True),
        sa.Column("template", sa.Text(), nullable=False),
        sa.Column("rendered", sa.Text(), nullable=False),
        sa.Column("variables_json", sa.JSON(), nullable=True),
        sa.Column("results_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_playground_runs_user_created", "playground_runs", ["user_id", "created_at"])
    with op.batch_alter_table("knowledge_documents") as batch:
        batch.alter_column("workflow_id", existing_type=sa.Uuid(), nullable=True)
        batch.add_column(sa.Column("knowledge_base_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("tags_json", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("source_url", sa.String(2048), nullable=True))
        batch.create_foreign_key(
            "fk_knowledge_documents_base",
            "knowledge_bases",
            ["knowledge_base_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_check_constraint(
            "ck_knowledge_documents_owner",
            "workflow_id IS NOT NULL OR knowledge_base_id IS NOT NULL",
        )
    op.create_index("ix_knowledge_documents_base", "knowledge_documents", ["knowledge_base_id"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_documents_base", table_name="knowledge_documents")
    op.execute("DELETE FROM knowledge_documents WHERE workflow_id IS NULL")
    with op.batch_alter_table("knowledge_documents") as batch:
        batch.drop_constraint("ck_knowledge_documents_owner", type_="check")
        batch.drop_constraint("fk_knowledge_documents_base", type_="foreignkey")
        batch.drop_column("source_url")
        batch.drop_column("tags_json")
        batch.drop_column("knowledge_base_id")
        batch.alter_column("workflow_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_index("ix_playground_runs_user_created", table_name="playground_runs")
    op.drop_table("playground_runs")
    op.drop_index("ix_knowledge_bases_user", table_name="knowledge_bases")
    op.drop_table("knowledge_bases")
