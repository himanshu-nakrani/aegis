from fastapi import APIRouter

from app.data.templates import WORKFLOW_TEMPLATES
from app.services.eval import EVAL_PRESETS

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def list_templates():
    return WORKFLOW_TEMPLATES


@router.get("/eval-presets")
def list_eval_presets():
    return [
        {"id": key, "label": value["label"], "criteria": value["criteria"]}
        for key, value in EVAL_PRESETS.items()
    ]