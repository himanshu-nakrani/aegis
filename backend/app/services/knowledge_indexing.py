"""Index knowledge documents with embeddings."""

from __future__ import annotations

from app.db import models
from app.services.embeddings import embed_text


def index_document_text(text: str) -> list[float]:
    return embed_text(text)


def apply_embedding(row: models.KnowledgeDocument) -> None:
    row.embedding = index_document_text(row.text)