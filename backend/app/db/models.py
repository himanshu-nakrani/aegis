import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class JSONType(TypeDecorator):
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    published_version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    budget_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["WorkflowVersion"]] = relationship(back_populates="workflow", cascade="all, delete-orphan")
    deployment: Mapped["WorkflowDeployment | None"] = relationship(
        cascade="all, delete-orphan", uselist=False
    )


class WorkflowDeployment(Base):
    __tablename__ = "workflow_deployments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_versions.id"), nullable=False
    )
    invoke_key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    webhook_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Hosted-chat exchange credential: one-way sha256 of the aegis_chat_ token
    # plus its TTL. Revoked together with the other credentials on re-publish.
    chat_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chat_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Set when the chat token is revoked or rotated (NULL = never revoked).
    # ``chat_invoke`` rejects sessions whose backing token was revoked after
    # the session was minted — revocation must kill live sessions, not just
    # block new exchanges.
    chat_token_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    version: Mapped["WorkflowVersion"] = relationship()
    webhook_receipts: Mapped[list["DeploymentWebhookReceipt"]] = relationship(
        cascade="all, delete-orphan"
    )


class DeploymentWebhookReceipt(Base):
    __tablename__ = "deployment_webhook_receipts"

    deployment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_deployments.id", ondelete="CASCADE"), primary_key=True
    )
    nonce: Mapped[str] = mapped_column(String(128), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"
    # Mirrors migration 003 so create_all() and the Alembic chain describe the
    # same schema (schema-parity).
    __table_args__ = (
        Index("ix_workflow_versions_workflow_id", "workflow_id"),
        Index("ix_workflow_versions_workflow_version", "workflow_id", "version_number"),
        UniqueConstraint("workflow_id", "version_number", name="uq_workflow_versions_workflow_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workflows.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    graph_json: Mapped[dict] = mapped_column(JSONType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workflow: Mapped["Workflow"] = relationship(back_populates="versions")
    runs: Mapped[list["WorkflowRun"]] = relationship(back_populates="version", cascade="all, delete-orphan")


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"
    __table_args__ = (
        Index("ix_workflow_runs_status_created_at", "status", "created_at"),
        # Partial active-run index — mirrors migration 004 so create_all() and
        # the Alembic chain describe the same schema (schema-parity).
        Index(
            "ix_workflow_runs_active_status",
            "status",
            postgresql_where=text("status IN ('pending', 'running', 'awaiting_approval')"),
            sqlite_where=text("status IN ('pending', 'running', 'awaiting_approval')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_versions.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), default="pending")
    input_text: Mapped[str] = mapped_column(Text, nullable=False)
    final_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    # Authoring-only pin/run-from-here overrides, persisted on the run row so the
    # worker process (which never shares the API process's in-memory registry)
    # re-applies pins and run-from-here pruning. Never set by /v1/invoke.
    authoring_overrides_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    # Trust-layer: group multi-turn runs into a session/thread, and attach
    # arbitrary key/value tags for filtering (e.g. {"env":"prod","variant":"A"}).
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    tags_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    version: Mapped["WorkflowVersion"] = relationship(back_populates="runs")
    node_results: Mapped[list["NodeResult"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    spans: Mapped[list["RunSpan"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    events: Mapped[list["RunEvent"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    checkpoints: Mapped[list["RunCheckpoint"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class WorkflowMemory(Base):
    __tablename__ = "workflow_memory"
    __table_args__ = (
        UniqueConstraint(
            "workflow_id",
            "namespace",
            "key",
            name="uq_workflow_memory_wf_ns_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id"), nullable=False, index=True
    )
    namespace: Mapped[str] = mapped_column(String(128), nullable=False, default="default")
    key: Mapped[str] = mapped_column(String(256), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    # Group the chunk rows of one uploaded file (per workflow) — added in 023.
    __table_args__ = (
        Index("ix_knowledge_documents_wf_source", "workflow_id", "source_document_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    embedding_vector: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provenance for file-uploaded chunks (NULL for pasted/manual docs):
    # source_document_id groups the chunks of one upload; chunk_start/end are
    # char offsets into the parsed source text used for retrieval citations.
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_mime: Mapped[str | None] = mapped_column(String(128), nullable=True)
    chunk_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkflowSchedule(Base):
    __tablename__ = "workflow_schedules"
    # Partial index over the active-schedule scan — mirrors migration 006
    # (schema-parity).
    __table_args__ = (
        Index(
            "ix_workflow_schedules_active",
            "enabled",
            "cron_valid",
            postgresql_where=text("enabled IS TRUE AND cron_valid IS TRUE"),
            sqlite_where=text("enabled IS TRUE AND cron_valid IS TRUE"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id"), nullable=False, index=True
    )
    workflow_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_versions.id"), nullable=False
    )
    cron_expr: Mapped[str] = mapped_column(String(128), nullable=False)
    trigger_node_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    cron_valid: Mapped[bool] = mapped_column(default=False)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    workflow: Mapped["Workflow"] = relationship()


class ObservabilityRollup(Base):
    __tablename__ = "observability_rollups"
    __table_args__ = (
        UniqueConstraint("user_id", "workflow_id", "bucket_hour", name="uq_observability_rollups_bucket"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    bucket_hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    completed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    eval_sum: Mapped[float] = mapped_column(default=0.0)
    eval_count: Mapped[int] = mapped_column(Integer, default=0)
    guardrail_blocked_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    payload_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EvaluationPreset(Base):
    __tablename__ = "evaluation_presets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    criteria: Mapped[str] = mapped_column(Text, nullable=False)
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    score_weights: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    eval_type: Mapped[str] = mapped_column(String(32), default="llm")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Credential(Base):
    __tablename__ = "credentials"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    config: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    mcp_tool_cache: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NodeResult(Base):
    __tablename__ = "node_results"
    # Mirrors migration 003's ix_node_results_run_id (schema-parity).
    __table_args__ = (Index("ix_node_results_run_id", "run_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False
    )
    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    node_type: Mapped[str] = mapped_column(String(64), nullable=False)
    node_label: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_scores: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    guardrail_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_usage: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped["WorkflowRun"] = relationship(back_populates="node_results")

class LlmCall(Base):
    """One model invocation within a run — the trace primitive for the waterfall view."""

    __tablename__ = "llm_calls"
    __table_args__ = (Index("ix_llm_calls_run_id", "run_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False
    )
    node_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RunSpan(Base):
    """A node in a run's nested execution trace tree (Trust-layer headline).

    Unlike the flat NodeResult/LlmCall rows (kept for back-compat), RunSpan is a
    self-referential tree: a node span parents its agent-step / tool-call /
    llm-call / guardrail / eval child spans, so the waterfall can drill from a
    node into the agent's internal reasoning. Geometry (offset_ms/duration_ms) is
    relative to the run start, so every level shares one axis.
    """

    __tablename__ = "run_spans"
    __table_args__ = (
        Index("ix_run_spans_run_id", "run_id"),
        Index("ix_run_spans_run_parent", "run_id", "parent_span_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False
    )
    # Self-FK: null for root (node) spans; set for nested children.
    parent_span_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("run_spans.id", ondelete="CASCADE"), nullable=True
    )
    node_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # kind ∈ node | agent_step | tool_call | llm_call | guardrail | eval
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="completed")
    offset_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attributes_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    tokens_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped["WorkflowRun"] = relationship(back_populates="spans")

class RunEvent(Base):
    """Durable replay log for run-stream events.

    Every executor-emitted run event lands here with a per-run monotonically
    increasing seq before it fans out to in-process subscribers. Postgres
    NOTIFY wakes remote listeners; the table itself is the source of truth for
    SSE reconnect/resume (replay seq > Last-Event-ID). Rows are deleted when
    the run reaches a terminal state — terminal clients get the synthesized
    events from the run row instead — so the table only tracks live runs.
    """

    __tablename__ = "run_events"
    # (run_id, seq) composite PK already indexes replay lookups — no secondary index.

    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), primary_key=True
    )
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped["WorkflowRun"] = relationship(back_populates="events")


class RunCheckpoint(Base):
    """Per-node execution checkpoint for crash/restart resume.

    Status mirrors node lifecycle: 'started' rows are re-executed on resume,
    'completed' rows are pinned (their output seeds the resume context and the
    node is pruned from the resume graph). 'skipped' covers nodes pinned by
    run-from-here authoring overrides so they are never re-executed.
    """

    __tablename__ = "run_checkpoints"

    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), primary_key=True
    )
    node_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="started")
    output: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    # Snapshot of the mutable workflow context (`input` + `memory`) as of this
    # node's completion. Resume restores the latest patch so state-mutating
    # nodes (set_fields writing input.*, memory writes) survive a crash — the
    # output alone does not carry those side effects.
    context_patch: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    run: Mapped["WorkflowRun"] = relationship(back_populates="checkpoints")


class Dataset(Base):
    """Golden input set for a workflow — the substrate for experiments and regression gates."""

    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["DatasetItem"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class DatasetItem(Base):
    __tablename__ = "dataset_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    input_text: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dataset: Mapped["Dataset"] = relationship(back_populates="items")


class Experiment(Base):
    """A dataset run against one version (batch) or two (regression)."""

    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), default="batch")  # batch | regression
    version_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    baseline_version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|running|completed|failed
    summary_json: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Feedback(Base):
    """Human rating on a run (thumbs + optional comment)."""

    __tablename__ = "feedback"
    __table_args__ = (Index("ix_feedback_run_id", "run_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False
    )
    node_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # +1 / -1
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GuardrailPolicy(Base):
    """Named, reusable guardrail rule bundle."""

    __tablename__ = "guardrail_policies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rules_json: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AlertRule(Base):
    """Threshold rule evaluated by the scheduler tick."""

    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    metric: Mapped[str] = mapped_column(String(48), nullable=False)  # failure_rate|eval_avg|guardrail_blocks|cost_usd
    operator: Mapped[str] = mapped_column(String(8), default="gt")  # gt | lt
    threshold: Mapped[float] = mapped_column(nullable=False)
    window_minutes: Mapped[int] = mapped_column(Integer, default=60)
    # absolute: value vs threshold. baseline: value/baseline ratio vs threshold
    # (anomaly detection against a trailing window).
    comparison: Mapped[str] = mapped_column(String(16), default="absolute", server_default="absolute")
    baseline_window_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    channel_url: Mapped[str | None] = mapped_column(String(512), nullable=True)  # webhook target
    enabled: Mapped[bool] = mapped_column(default=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AlertEvent(Base):
    __tablename__ = "alert_events"
    __table_args__ = (Index("ix_alert_events_rule_id", "rule_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("alert_rules.id"), nullable=False)
    value: Mapped[float] = mapped_column(nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkflowTemplate(Base):
    """A user-published, reusable workflow snapshot (persisted templates).

    Complements the static built-in templates in app/data/templates.py: those
    remain code constants; these are DB-backed and carry provenance (author,
    usage_count, source_workflow_id).
    """

    __tablename__ = "workflow_templates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    graph_json: Mapped[dict] = mapped_column(JSONType, nullable=False)
    # Author is the publishing user id, or null for system/built-in provenance.
    author: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_workflow_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(48), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApprovalRequest(Base):
    """Durable approval wait truth; any process can resolve, waiters poll the row."""

    __tablename__ = "approval_requests"
    __table_args__ = (Index("ix_approval_requests_run_node", "run_id", "node_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False
    )
    node_id: Mapped[str] = mapped_column(String(128), nullable=False)
    assignee: Mapped[str | None] = mapped_column(String(255), nullable=True)
    escalation_timeout_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="parked")
    notification_channels: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    notification_errors: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    parked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)


class OperationalSetting(Base):
    """Instance-wide operational overrides, shared by API and workers."""

    __tablename__ = "operational_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value_json: Mapped[float] = mapped_column(JSONType, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Prompt(Base):
    """Registry prompt — a named, versioned instruction template.

    ``current_version`` points at the version number served by default; an
    agent node may pin a different number via ``promptRef`` in its node data.
    """

    __tablename__ = "prompts"
    __table_args__ = (Index("ix_prompts_user_name", "user_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["PromptVersion"]] = relationship(
        back_populates="prompt", cascade="all, delete-orphan", order_by="PromptVersion.version"
    )


class PromptVersion(Base):
    """One immutable snapshot of a registry prompt's template."""

    __tablename__ = "prompt_versions"
    __table_args__ = (
        UniqueConstraint("prompt_id", "version", name="uq_prompt_versions_prompt_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    template: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prompt: Mapped[Prompt] = relationship(back_populates="versions")


class AnnotationTask(Base):
    """One run queued for human review — the front door into golden datasets.

    Runs land here from thumbs-down feedback, low-eval/failed capture, or a
    manual "queue for review" action. Labeling an item writes its
    expected_output back into a dataset via the shared copy_runs seam.
    """

    __tablename__ = "annotation_tasks"
    __table_args__ = (
        UniqueConstraint("user_id", "run_id", name="uq_annotation_tasks_user_run"),
        Index("ix_annotation_tasks_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Denormalized at enqueue so queue filtering never joins through versions.
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending | labeled | skipped
    priority: Mapped[int] = mapped_column(Integer, default=0)  # higher sorts first
    assignee: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Enqueue origin: manual | negative_feedback | low_eval | failed.
    created_by: Mapped[str] = mapped_column(String(64), default="manual")
    # Label payload, populated by the /label endpoint.
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # reviewer 1..5
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("dataset_items.id", ondelete="SET NULL"), nullable=True
    )
    labeled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
