from datetime import datetime
from uuid import UUID

import math

from pydantic import BaseModel, Field, field_validator


def _finite_weights(value: dict[str, float] | None) -> dict[str, float] | None:
    """Reject NaN/inf score weights — they serialize into JSONB and poison
    every downstream weighted-average computation."""
    if value is None:
        return None
    for key, number in value.items():
        if not math.isfinite(number):
            raise ValueError(f"score weight {key!r} must be a finite number")
    return value


class EvalPresetResponse(BaseModel):
    id: str
    label: str
    criteria: str
    instruction: str | None = None
    score_weights: dict[str, float] | None = None
    source: str = "builtin"
    eval_type: str = "llm"


class EvalPresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    criteria: str = Field(min_length=1, max_length=20_000)
    instruction: str | None = Field(default=None, max_length=20_000)
    score_weights: dict[str, float] | None = None
    eval_type: str = Field(default="llm", max_length=32)

    _check_weights = field_validator("score_weights")(_finite_weights)


class EvalPresetUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)
    criteria: str | None = Field(default=None, max_length=20_000)
    instruction: str | None = Field(default=None, max_length=20_000)
    score_weights: dict[str, float] | None = None

    _check_weights = field_validator("score_weights")(_finite_weights)


class EvalPresetListItem(BaseModel):
    id: UUID
    name: str
    label: str
    criteria: str
    instruction: str | None = None
    score_weights: dict[str, float] | None = None
    eval_type: str
    # P5a: the frontend buckets builtins vs user presets on `source`; omitting
    # it on create/update responses made new rows disappear until refetch.
    source: str = "custom"
    created_at: datetime
    updated_at: datetime


class EvalPreviewRequest(BaseModel):
    input_text: str = ""
    output_text: str = Field(min_length=1)
    criteria: str | None = None
    instruction: str | None = None
    score_weights: dict[str, float] | None = None


class RagPreviewRequest(BaseModel):
    question: str = ""
    context: str = ""
    answer: str = Field(min_length=1)