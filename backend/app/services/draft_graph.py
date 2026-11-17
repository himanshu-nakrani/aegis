"""Append-only workflow versions and the draft pointer.

Graph rows are not rewritten. The draft is ``workflows.draft_version_id``,
advanced with a compare-and-swap on ``draft_revision``. A repair candidate is
a real version that does not move the pointer or the published release.
"""

from __future__ import annotations

import hashlib
import json
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import models
from app.services.schedule_sync import sync_workflow_schedule


class DraftConflict(Exception):
    def __init__(self, revision: int):
        self.revision = revision
        super().__init__(f"DRAFT_CHANGED:{revision}")


def graph_hash(graph: dict) -> str:
    encoded = json.dumps(graph, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def authoring_version(db: Session, workflow: models.Workflow) -> models.WorkflowVersion | None:
    """The graph the canvas edits. Never an unadopted repair candidate."""
    if workflow.draft_version_id is not None:
        pinned = (
            db.query(models.WorkflowVersion)
            .filter(
                models.WorkflowVersion.id == workflow.draft_version_id,
                models.WorkflowVersion.workflow_id == workflow.id,
            )
            .first()
        )
        if pinned is not None:
            return pinned
    authoring = (
        db.query(models.WorkflowVersion)
        .filter(
            models.WorkflowVersion.workflow_id == workflow.id,
            models.WorkflowVersion.version_kind == "authoring",
        )
        .order_by(models.WorkflowVersion.version_number.desc())
        .first()
    )
    if authoring is not None:
        return authoring
    return (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow.id)
        .order_by(models.WorkflowVersion.version_number.desc())
        .first()
    )


def published_or_draft(db: Session, workflow: models.Workflow) -> models.WorkflowVersion | None:
    """Sub-workflow execution: the published graph, otherwise the draft."""
    if workflow.published_version_id is not None:
        published = (
            db.query(models.WorkflowVersion)
            .filter(
                models.WorkflowVersion.id == workflow.published_version_id,
                models.WorkflowVersion.workflow_id == workflow.id,
            )
            .first()
        )
        if published is not None:
            return published
    return authoring_version(db, workflow)


def bind_initial_draft(workflow: models.Workflow, version: models.WorkflowVersion) -> None:
    version.graph_hash = version.graph_hash or graph_hash(version.graph_json)
    version.version_kind = version.version_kind or "authoring"
    workflow.draft_version_id = version.id
    workflow.draft_revision = 1


def _next_number(db: Session, workflow_id: UUID) -> int:
    current = (
        db.query(func.max(models.WorkflowVersion.version_number))
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .scalar()
    )
    return int(current or 0) + 1


def save_authoring_graph(
    db: Session,
    workflow: models.Workflow,
    graph: dict,
    *,
    expected_revision: int | None,
    save_as_new: bool,
) -> models.WorkflowVersion:
    """Append a draft version, or return the current one when the graph is unchanged.

    The caller owns the transaction and should already hold a row lock on ``workflow``.
    """
    if expected_revision is not None and int(workflow.draft_revision or 0) != int(expected_revision):
        raise DraftConflict(int(workflow.draft_revision or 0))

    current = authoring_version(db, workflow)
    digest = graph_hash(graph)
    unchanged = (
        current is not None
        and not save_as_new
        and (current.graph_hash == digest or graph_hash(current.graph_json) == digest)
    )
    if unchanged and current is not None:
        if not current.graph_hash:
            current.graph_hash = digest
        return current

    version = models.WorkflowVersion(
        workflow_id=workflow.id,
        version_number=_next_number(db, workflow.id),
        graph_json=graph,
        graph_hash=digest,
        version_kind="authoring",
    )
    db.add(version)
    db.flush()
    workflow.draft_version_id = version.id
    workflow.draft_revision = int(workflow.draft_revision or 0) + 1
    if workflow.published_version_id is None:
        sync_workflow_schedule(
            db,
            workflow_id=workflow.id,
            version_id=version.id,
            graph_json=version.graph_json,
        )
    return version


def append_repair_candidate(
    db: Session,
    workflow: models.Workflow,
    graph: dict,
) -> models.WorkflowVersion:
    """Store a candidate without moving the draft pointer or schedules."""
    version = models.WorkflowVersion(
        workflow_id=workflow.id,
        version_number=_next_number(db, workflow.id),
        graph_json=graph,
        graph_hash=graph_hash(graph),
        version_kind="repair_candidate",
    )
    db.add(version)
    db.flush()
    return version


def adopt_draft(
    db: Session,
    workflow: models.Workflow,
    version: models.WorkflowVersion,
    *,
    expected_revision: int,
) -> models.WorkflowVersion:
    """Point the draft at an existing version. Does not publish."""
    if int(workflow.draft_revision or 0) != int(expected_revision):
        raise DraftConflict(int(workflow.draft_revision or 0))
    if version.workflow_id != workflow.id:
        raise ValueError("version is not part of this workflow")
    workflow.draft_version_id = version.id
    workflow.draft_revision = int(workflow.draft_revision or 0) + 1
    if workflow.published_version_id is None:
        sync_workflow_schedule(
            db,
            workflow_id=workflow.id,
            version_id=version.id,
            graph_json=version.graph_json,
        )
    return version


def annotate_version(version: models.WorkflowVersion, workflow: models.Workflow) -> models.WorkflowVersion:
    """Attach response-only fields the version schema reads via from_attributes."""
    version.draft_revision = int(workflow.draft_revision or 0)  # type: ignore[attr-defined]
    version.is_draft = workflow.draft_version_id == version.id  # type: ignore[attr-defined]
    return version
