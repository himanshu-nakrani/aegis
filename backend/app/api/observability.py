import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db.database import get_db
from app.services.observability_events import stream_observability_events
from app.services.observability_service import (
    build_overview,
    build_quality,
    build_recent_runs,
    build_summary,
)

router = APIRouter(prefix="/api/observability", tags=["observability"])


@router.get("/summary")
def observability_summary(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return build_summary(db, user_id)


@router.get("/overview")
def observability_overview(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return build_overview(db, user_id)


@router.get("/quality")
def observability_quality(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return build_quality(db, user_id)


@router.get("/runs")
def observability_runs(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    limit: int = Query(default=20, ge=1, le=100),
):
    return {"recent_runs": build_recent_runs(db, user_id, limit=limit)}


@router.get("/stream")
async def stream_observability(
    user_id: UUID = Depends(get_current_user_id),
):
    async def event_generator():
        async for event in stream_observability_events(str(user_id)):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")