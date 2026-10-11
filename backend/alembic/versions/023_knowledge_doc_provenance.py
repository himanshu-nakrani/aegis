"""Add upload provenance + chunk offsets to knowledge_documents.

Phase 4 RAG: rows created from an uploaded file carry their source document
identity and char-offset span so retrieval can emit citations. All six
columns are nullable (pasted/manual docs leave them NULL), so plain
add_column works on both SQLite and Postgres. ``source_document_id`` uses
sa.Uuid — CHAR(32) on SQLite, native UUID on Postgres (see 021 for why
sa.UUID literal DDL is avoided). Indexed on (workflow_id,
source_document_id) for grouping chunks of one upload.

Revision ID: 023
Revises: 022
"""

from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "023_knowledge_doc_provenance"
down_revision: Union[str, Sequence[str], None] = "022_chat_token_credential"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_documents",
        sa.Column("source_document_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "knowledge_documents",
        sa.Column("source_name", sa.String(512), nullable=True),
    )
    op.add_column(
        "knowledge_documents",
        sa.Column("source_mime", sa.String(128), nullable=True),
    )
    op.add_column(
        "knowledge_documents",
        sa.Column("chunk_index", sa.Integer(), nullable=True),
    )
    op.add_column(
        "knowledge_documents",
        sa.Column("chunk_start", sa.Integer(), nullable=True),
    )
    op.add_column(
        "knowledge_documents",
        sa.Column("chunk_end", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_knowledge_documents_wf_source",
        "knowledge_documents",
        ["workflow_id", "source_document_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_knowledge_documents_wf_source", table_name="knowledge_documents"
    )
    op.drop_column("knowledge_documents", "chunk_end")
    op.drop_column("knowledge_documents", "chunk_start")
    op.drop_column("knowledge_documents", "chunk_index")
    op.drop_column("knowledge_documents", "source_mime")
    op.drop_column("knowledge_documents", "source_name")
    op.drop_column("knowledge_documents", "source_document_id")
