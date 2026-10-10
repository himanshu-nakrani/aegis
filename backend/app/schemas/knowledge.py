from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class KnowledgeDocumentCreate(BaseModel):
    title: str | None = None
    text: str = Field(min_length=1)


class KnowledgeBulkImport(BaseModel):
    documents: list[KnowledgeDocumentCreate] = Field(min_length=1, max_length=100)


class KnowledgeDocumentResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    title: str | None
    text: str
    has_embedding: bool = False
    # Upload provenance — NULL for pasted/manual docs (Phase 4).
    source_document_id: UUID | None = None
    source_name: str | None = None
    source_mime: str | None = None
    chunk_index: int | None = None
    chunk_start: int | None = None
    chunk_end: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_row(cls, row) -> "KnowledgeDocumentResponse":
        return cls(
            id=row.id,
            workflow_id=row.workflow_id,
            title=row.title,
            text=row.text,
            has_embedding=bool(row.embedding),
            source_document_id=row.source_document_id,
            source_name=row.source_name,
            source_mime=row.source_mime,
            chunk_index=row.chunk_index,
            chunk_start=row.chunk_start,
            chunk_end=row.chunk_end,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )