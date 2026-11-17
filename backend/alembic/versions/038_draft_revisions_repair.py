"""Draft pointers, knowledge revisions, and repair evidence.

Revision ID: 038_draft_revisions_repair
Revises: 037_knowledge_libraries
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "038_draft_revisions_repair"
down_revision: Union[str, Sequence[str], None] = "037_knowledge_libraries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SCOPE = (
    "(knowledge_base_id IS NOT NULL AND workflow_id IS NULL) OR "
    "(knowledge_base_id IS NULL AND workflow_id IS NOT NULL)"
)


def upgrade() -> None:
    op.add_column("workflows", sa.Column("draft_version_id", sa.Uuid(), nullable=True))
    op.add_column(
        "workflows",
        sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("workflows", sa.Column("active_knowledge_revision_id", sa.Uuid(), nullable=True))
    op.add_column(
        "workflows",
        sa.Column("knowledge_activation_generation", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "workflows",
        sa.Column("knowledge_access_generation", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("workflow_versions", sa.Column("graph_hash", sa.String(length=64), nullable=True))
    op.add_column(
        "workflow_versions",
        sa.Column("version_kind", sa.String(length=32), nullable=False, server_default="authoring"),
    )
    op.add_column("knowledge_bases", sa.Column("active_revision_id", sa.Uuid(), nullable=True))
    op.add_column(
        "knowledge_bases",
        sa.Column("activation_generation", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "knowledge_bases",
        sa.Column("access_generation", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("knowledge_documents", sa.Column("document_version_id", sa.Uuid(), nullable=True))
    op.add_column("knowledge_documents", sa.Column("chunk_hash", sa.String(length=64), nullable=True))
    op.add_column(
        "knowledge_documents",
        sa.Column("embedding_profile_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_knowledge_documents_document_version_id",
        "knowledge_documents",
        ["document_version_id"],
    )
    op.add_column("background_jobs", sa.Column("lease_token", sa.Uuid(), nullable=True))
    op.add_column("background_jobs", sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("background_jobs", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "background_jobs",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("background_jobs", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "background_jobs",
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("background_jobs", sa.Column("idempotency_key", sa.String(length=128), nullable=True))
    op.add_column("background_jobs", sa.Column("payload_hash", sa.String(length=64), nullable=True))
    op.add_column(
        "credentials",
        sa.Column("execution_generation", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("datasets", sa.Column("revision", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "knowledge_source_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=True),
        sa.Column("workflow_id", sa.Uuid(), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("origin_kind", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("remote_file_id", sa.String(length=256), nullable=True),
        sa.Column("availability", sa.String(length=32), nullable=False, server_default="available"),
        sa.Column("denial_reason", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(_SCOPE, name="ck_knowledge_source_docs_scope"),
    )
    op.create_index("ix_knowledge_source_documents_user_id", "knowledge_source_documents", ["user_id"])
    op.create_index(
        "ix_knowledge_source_docs_base",
        "knowledge_source_documents",
        ["knowledge_base_id", "availability"],
    )
    op.create_index(
        "ix_knowledge_source_docs_workflow",
        "knowledge_source_documents",
        ["workflow_id", "availability"],
    )
    op.create_table(
        "knowledge_document_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=True),
        sa.Column("workflow_id", sa.Uuid(), nullable=True),
        sa.Column("source_document_id", sa.Uuid(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding_profile_hash", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=512), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("sealed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(_SCOPE, name="ck_knowledge_document_versions_scope"),
    )
    op.create_index(
        "ix_knowledge_doc_versions_source",
        "knowledge_document_versions",
        ["source_document_id", "created_at"],
    )
    op.create_table(
        "knowledge_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=True),
        sa.Column("workflow_id", sa.Uuid(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("parent_revision_id", sa.Uuid(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("settings_json", sa.JSON(), nullable=False),
        sa.Column("embedding_profile_json", sa.JSON(), nullable=False),
        sa.Column("member_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("origin", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("sealed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(_SCOPE, name="ck_knowledge_revisions_scope"),
    )
    op.create_index("ix_knowledge_revisions_user_id", "knowledge_revisions", ["user_id"])
    op.create_index(
        "uq_knowledge_revisions_base_seq",
        "knowledge_revisions",
        ["knowledge_base_id", "sequence"],
        unique=True,
        postgresql_where=sa.text("knowledge_base_id IS NOT NULL"),
        sqlite_where=sa.text("knowledge_base_id IS NOT NULL"),
    )
    op.create_index(
        "uq_knowledge_revisions_workflow_seq",
        "knowledge_revisions",
        ["workflow_id", "sequence"],
        unique=True,
        postgresql_where=sa.text("workflow_id IS NOT NULL"),
        sqlite_where=sa.text("workflow_id IS NOT NULL"),
    )
    op.create_table(
        "knowledge_revision_members",
        sa.Column("revision_id", sa.Uuid(), primary_key=True),
        sa.Column("source_document_id", sa.Uuid(), primary_key=True),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.UniqueConstraint("revision_id", "ordinal", name="uq_knowledge_revision_member_ordinal"),
    )
    op.create_index(
        "ix_knowledge_revision_members_document_version_id",
        "knowledge_revision_members",
        ["document_version_id"],
    )
    op.create_table(
        "knowledge_access_denials",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=True),
        sa.Column("workflow_id", sa.Uuid(), nullable=True),
        sa.Column("source_document_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(_SCOPE, name="ck_knowledge_access_denials_scope"),
    )
    op.create_index("ix_knowledge_access_denials_user_id", "knowledge_access_denials", ["user_id"])
    op.create_index(
        "ix_knowledge_access_denials_source_document_id",
        "knowledge_access_denials",
        ["source_document_id"],
    )
    op.create_table(
        "knowledge_connections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="google_drive"),
        sa.Column("oauth_client_identity", sa.String(length=128), nullable=False),
        sa.Column("google_sub", sa.String(length=128), nullable=False),
        sa.Column("email_display", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="connected"),
        sa.Column("credential_generation", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("encrypted_token_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            "oauth_client_identity",
            "google_sub",
            name="uq_knowledge_connections_grant",
        ),
    )
    op.create_index("ix_knowledge_connections_user_id", "knowledge_connections", ["user_id"])
    op.create_table(
        "knowledge_oauth_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=False),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("browser_binding_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("state_hash"),
    )
    op.create_index("ix_knowledge_oauth_attempts_user_id", "knowledge_oauth_attempts", ["user_id"])
    op.create_table(
        "knowledge_sources",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=False),
        sa.Column("connection_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "knowledge_base_id",
            "connection_id",
            name="uq_knowledge_sources_base_connection",
        ),
    )
    op.create_index("ix_knowledge_sources_user_id", "knowledge_sources", ["user_id"])
    op.create_index("ix_knowledge_sources_knowledge_base_id", "knowledge_sources", ["knowledge_base_id"])
    op.create_table(
        "knowledge_source_roots",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("remote_file_id", sa.String(length=256), nullable=False),
        sa.Column("root_kind", sa.String(length=16), nullable=False),
        sa.Column("recursive", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("display_name", sa.String(length=512), nullable=True),
        sa.UniqueConstraint("source_id", "remote_file_id", name="uq_knowledge_source_roots_file"),
    )
    op.create_index("ix_knowledge_source_roots_source_id", "knowledge_source_roots", ["source_id"])
    op.create_table(
        "execution_manifests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), nullable=False),
        sa.Column("workflow_version_id", sa.Uuid(), nullable=False),
        sa.Column("graph_hash", sa.String(length=64), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("knowledge_revision_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_graph_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_execution_manifests_user_id", "execution_manifests", ["user_id"])
    op.create_index("ix_execution_manifests_workflow_id", "execution_manifests", ["workflow_id"])
    op.create_table(
        "evaluation_snapshots",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=True),
        sa.Column("dataset_revision", sa.Integer(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_evaluation_snapshots_user_id", "evaluation_snapshots", ["user_id"])
    op.create_index("ix_evaluation_snapshots_workflow_id", "evaluation_snapshots", ["workflow_id"])
    op.create_table(
        "evaluation_snapshot_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("source_run_id", sa.Uuid(), nullable=True),
        sa.Column("origin", sa.String(length=32), nullable=False, server_default="repair_focal"),
        sa.Column("input_text", sa.Text(), nullable=False),
        sa.Column("expected_output", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.UniqueConstraint("snapshot_id", "ordinal", name="uq_evaluation_snapshot_items_ordinal"),
    )
    op.create_index(
        "ix_evaluation_snapshot_items_snapshot_id",
        "evaluation_snapshot_items",
        ["snapshot_id"],
    )
    op.create_table(
        "run_repairs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_run_id", sa.Uuid(), nullable=True),
        sa.Column("base_version_id", sa.Uuid(), nullable=False),
        sa.Column("base_graph_hash", sa.String(length=64), nullable=True),
        sa.Column("base_draft_revision", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("state", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("candidate_version_id", sa.Uuid(), nullable=True),
        sa.Column("adopted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("adoption_mode", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_run_repairs_user_id", "run_repairs", ["user_id"])
    op.create_index("ix_run_repairs_workflow_id", "run_repairs", ["workflow_id"])
    op.create_table(
        "run_repair_contexts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "repair_id",
            sa.Uuid(),
            sa.ForeignKey("run_repairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("redacted_bundle_json", sa.JSON(), nullable=False),
        sa.Column("consent_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("repair_id", "ordinal", name="uq_run_repair_contexts_ordinal"),
    )
    op.create_index("ix_run_repair_contexts_repair_id", "run_repair_contexts", ["repair_id"])
    op.create_table(
        "run_repair_proposals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "repair_id",
            sa.Uuid(),
            sa.ForeignKey("run_repairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("origin", sa.String(length=32), nullable=False),
        sa.Column("diagnosis_json", sa.JSON(), nullable=True),
        sa.Column("proposed_graph_json", sa.JSON(), nullable=True),
        sa.Column("proposed_graph_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("repair_id", "ordinal", name="uq_run_repair_proposals_ordinal"),
    )
    op.create_index("ix_run_repair_proposals_repair_id", "run_repair_proposals", ["repair_id"])
    op.create_table(
        "run_repair_validations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "repair_id",
            sa.Uuid(),
            sa.ForeignKey("run_repairs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("candidate_version_id", sa.Uuid(), nullable=False),
        sa.Column("base_manifest_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_manifest_id", sa.Uuid(), nullable=False),
        sa.Column("evaluation_snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_run_repair_validations_repair_id", "run_repair_validations", ["repair_id"])

    op.execute(
        """
        UPDATE workflows
        SET draft_version_id = (
            SELECT id FROM workflow_versions
            WHERE workflow_versions.workflow_id = workflows.id
            ORDER BY version_number DESC
            LIMIT 1
        )
        WHERE draft_version_id IS NULL
          AND EXISTS (
            SELECT 1 FROM workflow_versions
            WHERE workflow_versions.workflow_id = workflows.id
          )
        """
    )
    op.execute(
        """
        UPDATE workflows
        SET draft_revision = 1
        WHERE draft_version_id IS NOT NULL AND draft_revision = 0
        """
    )

    from sqlalchemy.orm import Session

    from app.db import models
    from app.services.draft_graph import graph_hash
    from app.services.knowledge_revisions import backfill_all

    session = Session(bind=op.get_bind())
    for version in session.query(models.WorkflowVersion).all():
        if not version.graph_hash and version.graph_json:
            version.graph_hash = graph_hash(version.graph_json)
        if not version.version_kind:
            version.version_kind = "authoring"
    session.flush()
    backfill_all(session)
    session.flush()


def downgrade() -> None:
    op.drop_table("run_repair_validations")
    op.drop_table("run_repair_proposals")
    op.drop_table("run_repair_contexts")
    op.drop_table("run_repairs")
    op.drop_table("evaluation_snapshot_items")
    op.drop_table("evaluation_snapshots")
    op.drop_table("execution_manifests")
    op.drop_table("knowledge_source_roots")
    op.drop_table("knowledge_sources")
    op.drop_table("knowledge_oauth_attempts")
    op.drop_table("knowledge_connections")
    op.drop_table("knowledge_access_denials")
    op.drop_table("knowledge_revision_members")
    op.drop_table("knowledge_revisions")
    op.drop_table("knowledge_document_versions")
    op.drop_table("knowledge_source_documents")
    op.drop_column("datasets", "revision")
    op.drop_column("credentials", "execution_generation")
    op.drop_column("background_jobs", "payload_hash")
    op.drop_column("background_jobs", "idempotency_key")
    op.drop_column("background_jobs", "cancel_requested_at")
    op.drop_column("background_jobs", "next_attempt_at")
    op.drop_column("background_jobs", "attempt_count")
    op.drop_column("background_jobs", "heartbeat_at")
    op.drop_column("background_jobs", "lease_expires_at")
    op.drop_column("background_jobs", "lease_token")
    op.drop_index("ix_knowledge_documents_document_version_id", table_name="knowledge_documents")
    op.drop_column("knowledge_documents", "embedding_profile_hash")
    op.drop_column("knowledge_documents", "chunk_hash")
    op.drop_column("knowledge_documents", "document_version_id")
    op.drop_column("knowledge_bases", "access_generation")
    op.drop_column("knowledge_bases", "activation_generation")
    op.drop_column("knowledge_bases", "active_revision_id")
    op.drop_column("workflow_versions", "version_kind")
    op.drop_column("workflow_versions", "graph_hash")
    op.drop_column("workflows", "knowledge_access_generation")
    op.drop_column("workflows", "knowledge_activation_generation")
    op.drop_column("workflows", "active_knowledge_revision_id")
    op.drop_column("workflows", "draft_revision")
    op.drop_column("workflows", "draft_version_id")
