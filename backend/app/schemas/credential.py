from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.llm_providers.registry import CREDENTIAL_PROVIDER_IDS

# Integration connectors plus every non-Google LLM provider that stores an API key.
_CREDENTIAL_TYPES = ("slack", "discord", "email", "postgres", *CREDENTIAL_PROVIDER_IDS)
_CREDENTIAL_TYPE_PATTERN = rf"^({'|'.join(_CREDENTIAL_TYPES)})$"


class CredentialCreate(BaseModel):
    name: str
    type: str = Field(pattern=_CREDENTIAL_TYPE_PATTERN)
    config: dict = Field(default_factory=dict)


class CredentialResponse(BaseModel):
    id: UUID
    name: str
    type: str
    config: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CredentialListItem(BaseModel):
    id: UUID
    name: str
    type: str
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}