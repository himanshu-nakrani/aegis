from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

# Per-document and total-size caps for bulk import: the whole payload is
# serialized into background_jobs.payload_json, so an unbounded request
# body would land as an unbounded JSONB row.
MAX_DOCUMENT_CHARS = 1_000_000
MAX_IMPORT_TOTAL_CHARS = 5_000_000


class KnowledgeDocumentCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    text: str = Field(min_length=1, max_length=MAX_DOCUMENT_CHARS)


class KnowledgeBulkImport(BaseModel):
    documents: list[KnowledgeDocumentCreate] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def _cap_total_chars(self) -> "KnowledgeBulkImport":
        total = sum(len(doc.text) for doc in self.documents)
        if total > MAX_IMPORT_TOTAL_CHARS:
            raise ValueError(
                f"bulk import exceeds {MAX_IMPORT_TOTAL_CHARS} total characters"
            )
        return self


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