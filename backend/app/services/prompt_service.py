"""Prompt registry: versioned prompt objects + agent-node promptRef resolution.

A registry prompt is a named template with an ordered list of versions. The
``current_version`` pointer picks the default; an agent node may pin any
version via ``data.promptRef = {"prompt_id": ..., "version": n}``.

Resolution happens in the run pipeline's graph-enrichment step (before
``compile_workflow``): a resolved ``promptRef`` overwrites the node's
``instruction`` with the versioned template. When the ref is missing or the
prompt/version cannot be found, the node's inline ``instruction`` is left
untouched so existing graphs are unaffected.

The playground renders ``{{variable}}`` placeholders from a caller-supplied
dict directly (workflow context expressions like ``{{steps.x}}`` still flow
through ``expressions.render_template`` at run time for compiled nodes).
"""

from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models

_VARIABLE_PATTERN = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}")


def extract_variables(template: str) -> list[str]:
    """Ordered unique ``{{var}}`` names found in a template."""
    seen: list[str] = []
    for match in _VARIABLE_PATTERN.finditer(template or ""):
        name = match.group(1)
        if name not in seen:
            seen.append(name)
    return seen


def render_prompt(template: str, variables: dict[str, object] | None = None) -> str:
    """Fill ``{{var}}`` placeholders from a flat dict; unknowns stay literal.

    Distinct from ``expressions.render_template``: no workflow context paths —
    anything not in ``variables`` renders as the raw ``{{name}}`` text so a
    playground user sees what remains unbound. Workflow ``{{input}}`` /
    ``{{last_output}}`` tokens in a registry template are only meaningful at
    run time and are left untouched here.
    """
    if not template:
        return ""
    variables = variables or {}

    def _replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in variables:
            value = variables[name]
            return value if isinstance(value, str) else str(value)
        return match.group(0)

    return _VARIABLE_PATTERN.sub(_replace, template)


def get_prompt(db: Session, prompt_id: UUID, user_id: UUID) -> models.Prompt | None:
    return (
        db.query(models.Prompt)
        .filter(models.Prompt.id == prompt_id, models.Prompt.user_id == user_id)
        .first()
    )


def get_version(
    db: Session, prompt: models.Prompt, version: int | None
) -> models.PromptVersion | None:
    """The pinned ``version`` row, or ``current_version`` when unpinned."""
    number = version if version is not None else prompt.current_version
    return (
        db.query(models.PromptVersion)
        .filter(
            models.PromptVersion.prompt_id == prompt.id,
            models.PromptVersion.version == number,
        )
        .first()
    )


def resolve_prompt_template(
    db: Session, prompt_id: UUID, user_id: UUID, version: int | None = None
) -> str | None:
    """Template text for a prompt version; ``None`` when not resolvable."""
    prompt = get_prompt(db, prompt_id, user_id)
    if not prompt:
        return None
    row = get_version(db, prompt, version)
    return row.template if row else None


def resolve_prompt_refs(graph_json: dict, db: Session, user_id) -> dict:
    """Rewrite agent nodes' ``instruction`` from their ``promptRef``.

    Mirrors ``enrich_graph_eval_presets``: returns the graph dict in place
    (mutated); a ref that fails to resolve falls back to the inline
    instruction, keeping the run non-breaking.
    """
    nodes = graph_json.get("nodes") or []
    for node in nodes:
        data = node.get("data") or {}
        ref = data.get("promptRef") or data.get("prompt_ref")
        if not isinstance(ref, dict):
            continue
        prompt_id = ref.get("prompt_id") or ref.get("promptId")
        if not prompt_id:
            continue
        try:
            template = resolve_prompt_template(
                db,
                UUID(str(prompt_id)),
                user_id,
                ref.get("version"),
            )
        except (ValueError, TypeError):
            template = None
        if template is not None:
            data["instruction"] = template
            node["data"] = data
    return graph_json
