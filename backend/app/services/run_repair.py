"""Fix this run: consent, a reviewable candidate, a frozen comparison, adoption.

Nothing here publishes a workflow or rotates an invoke key. A passing
comparison still leaves publication to the quality-gated release path.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import models
from app.services.draft_graph import (
    DraftConflict,
    adopt_draft,
    append_repair_candidate,
    authoring_version,
    graph_hash,
)
from app.services.graph_validation import GraphValidationError, validate_workflow_graph

ArmRunner = Callable[[models.WorkflowVersion, str], str]


class ExecutionDeferred(Exception):
    """The default runner does not invent outputs."""


def _owned_run(db: Session, user_id: UUID, run_id: UUID) -> models.WorkflowRun:
    run = (
        db.query(models.WorkflowRun)
        .join(models.WorkflowVersion)
        .join(models.Workflow)
        .filter(models.WorkflowRun.id == run_id, models.Workflow.user_id == user_id)
        .first()
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Repair requires a terminal run")
    return run


def _repair(db: Session, user_id: UUID, repair_id: UUID) -> models.RunRepair:
    repair = (
        db.query(models.RunRepair)
        .filter(models.RunRepair.id == repair_id, models.RunRepair.user_id == user_id)
        .first()
    )
    if repair is None:
        raise HTTPException(status_code=404, detail="Repair not found")
    return repair


def open_repair(db: Session, *, user_id: UUID, source_run_id: UUID) -> models.RunRepair:
    run = _owned_run(db, user_id, source_run_id)
    version = run.version
    workflow = version.workflow
    draft = authoring_version(db, workflow)
    if draft is None:
        raise HTTPException(status_code=409, detail="Workflow has no draft")
    repair = models.RunRepair(
        user_id=user_id,
        workflow_id=workflow.id,
        source_run_id=run.id,
        base_version_id=draft.id,
        base_graph_hash=draft.graph_hash or graph_hash(draft.graph_json),
        base_draft_revision=int(workflow.draft_revision or 0),
        state="open",
    )
    db.add(repair)
    db.flush()
    return repair


def record_context(
    db: Session,
    repair: models.RunRepair,
    *,
    consent: list[str],
) -> models.RunRepairContext:
    required = {"input", "output"}
    if not required.issubset(set(consent)):
        raise HTTPException(status_code=422, detail="Consent must include input and output")
    run = db.get(models.WorkflowRun, repair.source_run_id) if repair.source_run_id else None
    bundle = {
        "run_id": str(repair.source_run_id) if repair.source_run_id else None,
        "status": run.status if run is not None else None,
        "input_text": run.input_text if run is not None else None,
        "final_output": run.final_output if run is not None else None,
    }
    ordinal = (
        db.query(models.RunRepairContext)
        .filter(models.RunRepairContext.repair_id == repair.id)
        .count()
    )
    context = models.RunRepairContext(
        repair_id=repair.id,
        ordinal=ordinal + 1,
        redacted_bundle_json=bundle,
        consent_json={"categories": sorted(set(consent))},
    )
    db.add(context)
    repair.state = "context_ready"
    db.flush()
    return context


def add_proposal(
    db: Session,
    repair: models.RunRepair,
    *,
    graph: dict,
    origin: str,
    diagnosis: dict | None = None,
) -> models.RunRepairProposal:
    if repair.state not in {"context_ready", "proposed", "candidate"}:
        raise HTTPException(status_code=409, detail="Record consent before a proposal")
    try:
        validate_workflow_graph(graph)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    ordinal = (
        db.query(models.RunRepairProposal)
        .filter(models.RunRepairProposal.repair_id == repair.id)
        .count()
    )
    proposal = models.RunRepairProposal(
        repair_id=repair.id,
        ordinal=ordinal + 1,
        origin=origin,
        diagnosis_json=diagnosis,
        proposed_graph_json=graph,
        proposed_graph_hash=graph_hash(graph),
    )
    db.add(proposal)
    repair.state = "proposed"
    db.flush()
    return proposal


def create_candidate(db: Session, repair: models.RunRepair) -> models.WorkflowVersion:
    proposal = (
        db.query(models.RunRepairProposal)
        .filter(models.RunRepairProposal.repair_id == repair.id)
        .order_by(models.RunRepairProposal.ordinal.desc())
        .first()
    )
    if proposal is None or not proposal.proposed_graph_json:
        raise HTTPException(status_code=409, detail="Repair has no proposal")
    workflow = db.get(models.Workflow, repair.workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    draft_before = workflow.draft_version_id
    revision_before = workflow.draft_revision
    published_before = workflow.published_version_id
    version = append_repair_candidate(db, workflow, proposal.proposed_graph_json)
    if workflow.draft_version_id != draft_before or workflow.draft_revision != revision_before:
        raise RuntimeError("repair candidate moved the draft")
    if workflow.published_version_id != published_before:
        raise RuntimeError("repair candidate published the workflow")
    repair.candidate_version_id = version.id
    repair.state = "candidate"
    db.flush()
    return version


def _manifest(db: Session, workflow: models.Workflow, version: models.WorkflowVersion) -> models.ExecutionManifest:
    manifest = models.ExecutionManifest(
        user_id=workflow.user_id,
        workflow_id=workflow.id,
        workflow_version_id=version.id,
        graph_hash=version.graph_hash or graph_hash(version.graph_json),
        content_hash=graph_hash(
            {
                "version": str(version.id),
                "graph": version.graph_hash or graph_hash(version.graph_json),
                "knowledge": str(workflow.active_knowledge_revision_id) if workflow.active_knowledge_revision_id else None,
            }
        ),
        knowledge_revision_id=workflow.active_knowledge_revision_id,
        resolved_graph_json=version.graph_json,
    )
    db.add(manifest)
    db.flush()
    return manifest


def _default_runner(_version: models.WorkflowVersion, _text: str) -> str:
    raise ExecutionDeferred()


def validate_repair(
    db: Session,
    repair: models.RunRepair,
    *,
    expected_output: str | None,
    runner: ArmRunner | None = None,
) -> models.RunRepairValidation:
    if repair.candidate_version_id is None:
        raise HTTPException(status_code=409, detail="Repair has no candidate")
    if repair.state not in {"context_ready", "proposed", "candidate", "validated"}:
        raise HTTPException(status_code=409, detail="Record consent before validation")
    run = db.get(models.WorkflowRun, repair.source_run_id) if repair.source_run_id else None
    workflow = db.get(models.Workflow, repair.workflow_id)
    base = db.get(models.WorkflowVersion, repair.base_version_id)
    candidate = db.get(models.WorkflowVersion, repair.candidate_version_id)
    if workflow is None or base is None or candidate is None or run is None:
        raise HTTPException(status_code=409, detail="Repair evidence is incomplete")
    item_hash = graph_hash({"input": run.input_text, "expected": expected_output})
    snapshot = models.EvaluationSnapshot(
        user_id=repair.user_id,
        workflow_id=workflow.id,
        content_hash=item_hash,
        item_count=1,
    )
    db.add(snapshot)
    db.flush()
    db.add(
        models.EvaluationSnapshotItem(
            snapshot_id=snapshot.id,
            ordinal=1,
            source_run_id=run.id,
            origin="repair_focal",
            input_text=run.input_text,
            expected_output=expected_output,
            content_hash=item_hash,
        )
    )
    base_manifest = _manifest(db, workflow, base)
    candidate_manifest = _manifest(db, workflow, candidate)
    execute = runner or _default_runner
    summary: dict = {"publishable": False}
    try:
        base_output = execute(base, run.input_text)
        candidate_output = execute(candidate, run.input_text)
    except ExecutionDeferred:
        status = "incomplete"
        summary["reason"] = "execution_deferred"
    else:
        summary["base_output"] = base_output
        summary["candidate_output"] = candidate_output
        if expected_output is None:
            status = "incomplete"
            summary["reason"] = "expected_output_missing"
        elif candidate_output == expected_output:
            status = "passed"
        else:
            status = "failed"
    summary["publishable"] = False
    validation = models.RunRepairValidation(
        repair_id=repair.id,
        candidate_version_id=candidate.id,
        base_manifest_id=base_manifest.id,
        candidate_manifest_id=candidate_manifest.id,
        evaluation_snapshot_id=snapshot.id,
        status=status,
        summary_json=summary,
    )
    db.add(validation)
    repair.state = "validated"
    db.flush()
    return validation


def adopt(
    db: Session,
    repair: models.RunRepair,
    *,
    expected_revision: int,
    mode: str,
) -> models.Workflow:
    if mode not in {"validated", "unvalidated"}:
        raise HTTPException(status_code=422, detail="adoption_mode must be validated or unvalidated")
    if repair.candidate_version_id is None:
        raise HTTPException(status_code=409, detail="Repair has no candidate")
    if mode == "validated":
        passed = (
            db.query(models.RunRepairValidation)
            .filter(
                models.RunRepairValidation.repair_id == repair.id,
                models.RunRepairValidation.candidate_version_id == repair.candidate_version_id,
                models.RunRepairValidation.status == "passed",
            )
            .first()
        )
        if passed is None:
            raise HTTPException(status_code=409, detail="Validated adoption requires a passing comparison")
    workflow = db.get(models.Workflow, repair.workflow_id)
    version = db.get(models.WorkflowVersion, repair.candidate_version_id)
    if workflow is None or version is None:
        raise HTTPException(status_code=404, detail="Repair target not found")
    published = workflow.published_version_id
    try:
        adopt_draft(db, workflow, version, expected_revision=expected_revision)
    except DraftConflict as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "DRAFT_CHANGED", "draft_revision": exc.revision},
        ) from exc
    if workflow.published_version_id != published:
        raise RuntimeError("adoption published the workflow")
    repair.state = "adopted"
    repair.adoption_mode = mode
    repair.adopted_at = datetime.now(timezone.utc)
    db.flush()
    return workflow


def public_repair(repair: models.RunRepair) -> dict:
    return {
        "id": str(repair.id),
        "workflow_id": str(repair.workflow_id),
        "source_run_id": str(repair.source_run_id) if repair.source_run_id else None,
        "state": repair.state,
        "base_version_id": str(repair.base_version_id),
        "base_draft_revision": repair.base_draft_revision,
        "candidate_version_id": str(repair.candidate_version_id) if repair.candidate_version_id else None,
        "adoption_mode": repair.adoption_mode,
        "publishable": False,
    }
