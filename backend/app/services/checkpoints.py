"""Durable per-node run checkpoints (Phase 2 durable runs).

Every node execution writes a ``run_checkpoints`` row so a crashed run can
resume instead of restarting from the trigger:

  * ``started``   — recorded when the executor observes ``node_started``;
                    these rows mark the resume frontier (re-executed).
  * ``completed`` — recorded alongside the ``NodeResult`` upsert; the stored
                    ``output`` seeds ``pinned_outputs`` on resume so downstream
                    ``{{steps.<id>.output}}`` references resolve and the node is
                    pruned from the resume graph.
  * ``skipped``   — recorded for run-from-here authored pins; like ``completed``
                    the node is never re-executed.

Session contract: the ``mark_*`` helpers take the caller's session, mutate and
``flush()`` — they do NOT commit. The executor's consume loop batches the
checkpoint write into the same transaction as the ``NodeResult`` upsert, so a
checkpoint is durable iff the node result is. ``load_checkpoints``/``compute_resume``
accept an optional session and open/close their own when not given one.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.db import models
from app.db.database import SessionLocal
from app.services.agent_tool_schema import executable_nodes

_CHECKPOINT_TERMINAL = ("completed", "skipped")


def _get(db: Session, run_id: uuid.UUID, node_id: str) -> models.RunCheckpoint | None:
    return (
        db.query(models.RunCheckpoint)
        .filter(
            models.RunCheckpoint.run_id == run_id,
            models.RunCheckpoint.node_id == node_id,
        )
        .first()
    )


def mark_node_started(db: Session, run_id: uuid.UUID, node_id: str) -> None:
    """Upsert a ``started`` checkpoint; never downgrade completed/skipped.

    A node re-executing after a resume (or re-firing) leaves a terminal
    checkpoint row fully untouched — even ``updated_at`` — so resume
    ordering stays immutable. Flushes but does not commit — the caller
    owns the transaction.
    """
    row = _get(db, run_id, node_id)
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(
            models.RunCheckpoint(
                run_id=run_id, node_id=node_id, status="started",
                created_at=now, updated_at=now,
            )
        )
    elif row.status not in _CHECKPOINT_TERMINAL:
        row.status = "started"
        row.updated_at = now
    else:
        # Re-executed after a prior terminal mark (stale started replay):
        # keep the durable result AND its updated_at. Bumping updated_at
        # here would reorder this row last in compute_resume's patch fold,
        # letting a stale context_patch overwrite a fresher one on resume.
        pass
    db.flush()


def mark_node_completed(
    db: Session,
    run_id: uuid.UUID,
    node_id: str,
    output: Any,
    context_patch: dict[str, Any] | None = None,
) -> None:
    """Upsert a ``completed`` checkpoint carrying the node's raw output.

    ``output`` is the same JSON-able value the ``node_completed`` event
    carries, matching the ``pinned_outputs`` shape consumed by
    ``seed_pinned_outputs``. ``context_patch`` snapshots the mutable workflow
    context (``input`` + ``memory``) as of completion so resume can restore
    state mutations (set_fields, memory writes) the output alone omits.
    Overwrites 'started'/'skipped' rows so a re-executed node reflects the
    latest result. Flushes; caller commits.
    """
    row = _get(db, run_id, node_id)
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(
            models.RunCheckpoint(
                run_id=run_id, node_id=node_id, status="completed",
                output=output, context_patch=context_patch,
                created_at=now, updated_at=now,
            )
        )
    else:
        row.status = "completed"
        row.output = output
        if context_patch is not None:
            row.context_patch = context_patch
        row.updated_at = now
    db.flush()


def mark_pinned_skipped(
    db: Session,
    run_id: uuid.UUID,
    node_id: str,
    output: Any,
) -> None:
    """Upsert a ``skipped`` checkpoint for a run-from-here authored pin.

    Written at ``execute_run`` init for every ``pinned_outputs`` key so the
    pinned node is pruned (not re-executed) if the run later resumes.
    Flushes; caller commits.
    """
    row = _get(db, run_id, node_id)
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(
            models.RunCheckpoint(
                run_id=run_id, node_id=node_id, status="skipped",
                output=output, created_at=now, updated_at=now,
            )
        )
    else:
        row.status = "skipped"
        row.output = output
        row.updated_at = now
    db.flush()


def _list_checkpoints(db: Session, run_id: uuid.UUID) -> list[models.RunCheckpoint]:
    return (
        db.query(models.RunCheckpoint)
        .filter(models.RunCheckpoint.run_id == run_id)
        .order_by(models.RunCheckpoint.updated_at.asc(), models.RunCheckpoint.node_id.asc())
        .all()
    )


def load_checkpoints(
    run_id: uuid.UUID,
    db: Session | None = None,
) -> list[models.RunCheckpoint]:
    """Return a run's checkpoint rows ordered by ``updated_at``.

    Uses the caller's session when given; otherwise opens and closes its own
    (rows are detached but fully loaded — safe to read after return).
    """
    if db is not None:
        return _list_checkpoints(db, run_id)
    session = SessionLocal()
    try:
        return _list_checkpoints(session, run_id)
    finally:
        session.close()


def _incoming_exec_edges(edges: list[dict]) -> dict[str, list[dict]]:
    incoming: dict[str, list[dict]] = defaultdict(list)
    for edge in edges:
        if edge.get("target"):
            incoming[edge["target"]].append(edge)
    return incoming


def compute_resume(
    db: Session,
    run: models.WorkflowRun,
    graph_json: dict,
) -> dict[str, Any] | None:
    """Derive the resume plan for a run from its checkpoints and graph.

    Returns ``None`` when the run has no checkpoints (nothing to resume —
    execute the graph normally). Otherwise::

        {
            "pinned_outputs": {node_id: output},   # completed ∪ skipped,
                                                   # ordered by updated_at
            "completed_ids":  {node_id, ...},      # completed ∪ skipped
            "frontier_ids":   {node_id, ...},      # nodes to re-execute first
            "prune_needed":   bool,                # any completed/skipped rows
        }

    Frontier = checkpoint ``started`` rows ∪ "safe-ready" nodes: executable
    nodes whose parents are ALL completed/skipped AND that have no incoming
    conditional edge (branch/error routes). Conditional children are only
    re-executed when they were already ``started`` (at-least-once semantics)
    because we cannot know post-crash whether the route would have fired.
    """
    rows = _list_checkpoints(db, run.id)
    if not rows:
        return None

    completed_ids: set[str] = set()
    started_ids: set[str] = set()
    pinned_outputs: dict[str, Any] = {}
    # Rows are ordered by updated_at; the last non-null patch is the freshest
    # view of the mutable context (input + memory) before the crash.
    context_patch: dict[str, Any] | None = None
    for row in rows:
        if row.status in _CHECKPOINT_TERMINAL:
            completed_ids.add(row.node_id)
            pinned_outputs[row.node_id] = row.output
        elif row.status == "started":
            started_ids.add(row.node_id)
        if row.context_patch:
            context_patch = row.context_patch

    from app.services.compiler import _edge_route, _branch_default_label

    nodes = executable_nodes(graph_json)
    incoming = _incoming_exec_edges(graph_json.get("edges", []) or [])
    default_labels = {
        n["id"]: _branch_default_label(n) for n in nodes
    }


    def _is_conditional(edge: dict) -> bool:
        if (edge.get("data") or {}).get("route") == "error":
            return True
        if edge.get("sourceHandle") == "error":
            return True
        return _edge_route(edge, default_labels.get(edge.get("source"))) is not None

    observed = completed_ids | started_ids
    # Group conditional children by routing source. A completed router's branch
    # is only indeterminate when NONE of its conditional children were ever
    # observed (crash between parent completing and the chosen child starting).
    # If any sibling branch ran, the route decision is observably made and the
    # unstarted siblings are provably untaken — prune them, don't fail.
    conditional_children_by_source: dict[str, set[str]] = defaultdict(set)
    for node in nodes:
        for edge in incoming.get(node["id"], []):
            if _is_conditional(edge):
                conditional_children_by_source[edge.get("source") or ""].add(node["id"])

    def _has_unobserved_conditional_parent(node_id: str) -> bool:
        for edge in incoming.get(node_id, []):
            if not _is_conditional(edge):
                continue
            source = edge.get("source") or ""
            if source not in completed_ids:
                continue  # parent hasn't routed yet — node is simply blocked
            siblings = conditional_children_by_source.get(source, set())
            if not any(s in observed for s in siblings):
                return True  # route decision lost in the crash window
        return False

    # Nodes on a provably-untaken conditional branch are "dead": their routing
    # parent completed, a sibling branch was observed, and they themselves were
    # never observed. Death propagates to any unobserved node whose every
    # predecessor is dead. A merge node fed by one live and one dead branch is
    # NOT dead — and must still become ready, which is the bug this closes:
    # previously a merge waited on the dead branch's (absent) checkpoint, was
    # never ready, and got silently pruned with required work omitted.
    dead_ids: set[str] = set()
    for node in nodes:
        nid = node["id"]
        if nid in observed:
            continue
        for edge in incoming.get(nid, []):
            if not _is_conditional(edge):
                continue
            source = edge.get("source") or ""
            if source not in completed_ids:
                continue
            siblings = conditional_children_by_source.get(source, set())
            if any(s in observed for s in siblings):
                dead_ids.add(nid)
                break
    changed = True
    while changed:
        changed = False
        for node in nodes:
            nid = node["id"]
            if nid in observed or nid in dead_ids:
                continue
            ins = incoming.get(nid, [])
            if ins and all((e.get("source") or "") in dead_ids for e in ins):
                dead_ids.add(nid)
                changed = True

    def _edge_satisfied(edge: dict) -> bool:
        source = edge.get("source") or ""
        return source in completed_ids or source in dead_ids

    safe_ready: set[str] = set()
    dangling: set[str] = set()
    for node in nodes:
        nid = node["id"]
        if nid in completed_ids or nid in started_ids or nid in dead_ids:
            continue
        ins = incoming.get(nid, [])
        has_conditional = any(_is_conditional(e) for e in ins)
        # A merge node's dead-branch predecessors count as satisfied — they
        # will never run, so they must not hold the merge back.
        if all(_edge_satisfied(e) for e in ins):
            if has_conditional:
                if _has_unobserved_conditional_parent(nid):
                    # Route decision lost in the crash window — ambiguous.
                    dangling.add(nid)
                # else: route observed, this branch provably untaken — prune.
                continue
            safe_ready.add(nid)

    return {
        "pinned_outputs": pinned_outputs,
        "completed_ids": completed_ids,
        "frontier_ids": started_ids | safe_ready,
        "dangling_ids": dangling,
        "context_patch": context_patch,
        "prune_needed": bool(completed_ids),
    }
