"""Parallel and deferred LLM evaluation execution."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from google.genai import types

from app.config import settings
from app.services.eval import EvalScores, build_eval_instruction, compute_aggregate_score

logger = logging.getLogger("aegis.eval")


def _evaluate_content_sync(content: str, preset: str | None, criteria: str | None) -> dict[str, Any]:
    from google import genai

    client = genai.Client(api_key=settings.google_api_key)
    instruction = build_eval_instruction(preset, criteria)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=f"Evaluate the following content:\n\n{(content or '')[:8000]}",
        config=types.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=EvalScores,
        ),
    )
    scores = EvalScores.model_validate_json(response.text or "{}")
    payload = scores.model_dump()
    aggregate = compute_aggregate_score(payload)
    if aggregate is not None:
        payload["aggregate_score"] = aggregate
    return payload


async def evaluate_content_async(
    content: str,
    *,
    preset: str | None = None,
    criteria: str | None = None,
) -> dict[str, Any]:
    return await asyncio.to_thread(_evaluate_content_sync, content, preset, criteria)


async def run_parallel_evaluations(
    specs: list[tuple[str, dict[str, Any], str]],
) -> list[tuple[str, dict[str, Any] | None, str | None]]:
    """Evaluate multiple nodes concurrently. Returns (node_id, scores, error)."""

    async def _one(node_id: str, meta: dict[str, Any], content: str) -> tuple[str, dict[str, Any] | None, str | None]:
        try:
            scores = await evaluate_content_async(
                content,
                preset=meta.get("eval_preset"),
                criteria=meta.get("criteria"),
            )
            return node_id, scores, None
        except Exception as exc:
            logger.warning("Deferred eval failed", extra={"node_id": node_id, "error": str(exc)})
            return node_id, None, str(exc)

    return await asyncio.gather(*[_one(node_id, meta, content) for node_id, meta, content in specs])