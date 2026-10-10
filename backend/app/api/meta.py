import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db.database import get_db
from app.schemas.workflow import GuardrailPreviewRequest, GuardrailPreviewResponse
from app.services.cron_utils import cron_is_valid, cron_next_runs
from app.services.guardrail import apply_fail_behavior, validate_guardrail_content
from app.config import settings
from app.services.node_registry import NODE_REGISTRY
from app.services.tracing import is_tracing_enabled
from app.services.online_sampling import get_online_eval_sample_rate, set_online_eval_sample_rate

router = APIRouter(prefix="/api/meta", tags=["meta"])


class OnlineSamplingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    online_eval_sample_rate: float = Field(ge=0, le=1, allow_inf_nan=False, strict=True)

    @field_validator("online_eval_sample_rate", mode="before")
    @classmethod
    def reject_nonfinite_rate(cls, value):
        # A non-standard JSON NaN/Infinity must not leak into FastAPI's JSON
        # validation-error payload (which itself rejects non-finite floats).
        if isinstance(value, (int, float)) and (not 0 <= value <= 1 or not math.isfinite(value)):
            raise HTTPException(status_code=422, detail="Sample rate must be a finite number between 0 and 1")
        return value


@router.get("/nodes")
def list_node_types(_user_id: UUID = Depends(get_current_user_id)):
    return {"nodes": NODE_REGISTRY}


@router.get("/models")
def list_models(_user_id: UUID = Depends(get_current_user_id)):
    """LLM provider/model catalog for per-node model pickers.

    Providers without a configured API key are included with
    ``configured: false`` so the UI can explain unavailability.
    """
    from app.services.llm_providers import model_catalog

    return {"providers": model_catalog()}


@router.get("/tracing")
def tracing_config(_user_id: UUID = Depends(get_current_user_id)):
    return {
        "enabled": is_tracing_enabled(),
        "ui_base_url": settings.otel_ui_base_url or None,
    }


@router.get("/ops-config")
def ops_config(
    db: Session = Depends(get_db),
    _user_id: UUID = Depends(get_current_user_id),
):
    """Operational config, including the persisted instance sampling rate."""
    from app.config import settings as _settings

    return {
        "retention_enabled": _settings.retention_enabled,
        "run_retention_days": _settings.run_retention_days,
        "online_eval_sample_rate": get_online_eval_sample_rate(db),
        "otel_enabled": _settings.otel_enabled,
        "otel_sample_rate": _settings.otel_sample_rate,
        "schedule_poll_seconds": _settings.schedule_poll_seconds,
        "max_concurrent_runs": _settings.max_concurrent_runs,
    }


@router.patch("/ops-config")
def update_ops_config(
    payload: OnlineSamplingUpdate,
    db: Session = Depends(get_db),
    _user_id: UUID = Depends(get_current_user_id),
):
    set_online_eval_sample_rate(db, payload.online_eval_sample_rate)
    return ops_config(db, _user_id)


@router.get("/cron-preview")
def preview_cron(
    expr: str = Query(..., min_length=1),
    count: int = Query(default=3, ge=1, le=10),
    _user_id: UUID = Depends(get_current_user_id),
):
    if not cron_is_valid(expr):
        raise HTTPException(status_code=400, detail="Invalid cron expression")
    runs = cron_next_runs(expr, count=count)
    return {
        "expr": expr.strip(),
        "next_runs": [dt.isoformat() for dt in runs],
    }


@router.post("/guardrail-preview", response_model=GuardrailPreviewResponse)
def preview_guardrail(
    payload: GuardrailPreviewRequest,
    _user_id: UUID = Depends(get_current_user_id),
):
    result = validate_guardrail_content(payload.text, payload.rules)
    fail_behavior = payload.rules.get("fail_behavior", "block")
    would_block = result.requires_block or (not result.passed and fail_behavior == "block")
    if not result.requires_block and not result.passed and fail_behavior in {"warn", "mask", "rewrite", "fallback"}:
        result = apply_fail_behavior(
            result,
            fail_behavior,
            "preview",
            content=payload.text,
            rules=payload.rules,
        )
    return GuardrailPreviewResponse(
        passed=result.passed,
        message=result.message,
        severity=result.severity,
        would_block=would_block,
    )