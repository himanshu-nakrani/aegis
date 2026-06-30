from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.data.templates import WORKFLOW_TEMPLATES
from app.db.database import get_db
from app.services.eval_preset_service import list_all_presets

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def list_templates(_user_id: UUID = Depends(get_current_user_id)):
    return WORKFLOW_TEMPLATES


@router.get("/eval-presets")
def list_eval_presets(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return list_all_presets(db, user_id)