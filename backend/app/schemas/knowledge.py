from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class KnowledgeDocumentCreate(BaseModel):
    title: str | None = None
    text: str = Field(min_length=1)


class KnowledgeDocumentResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    title: str | None
    text: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}