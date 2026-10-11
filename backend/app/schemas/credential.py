from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SkipValidation, TypeAdapter, field_validator

from app.services.llm_providers.registry import CREDENTIAL_PROVIDER_IDS

# Integration connectors plus every non-Google LLM provider that stores an API key.
_CREDENTIAL_TYPES = ("slack", "discord", "email", "postgres", "mcp", *CREDENTIAL_PROVIDER_IDS)
_CREDENTIAL_TYPE_PATTERN = rf"^({'|'.join(_CREDENTIAL_TYPES)})$"


class MCPStdioConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    transport: Literal["stdio"]
    command: str = Field(min_length=1, max_length=4096)
    args: list[str] = Field(default_factory=list, max_length=256)
    env: dict[str, str] = Field(default_factory=dict, max_length=128)

    @field_validator("command")
    @classmethod
    def command_is_argv(cls, value: str) -> str:
        if not value.strip() or "\x00" in value:
            raise ValueError("MCP command must be an executable name or path")
        return value

    @field_validator("args")
    @classmethod
    def bounded_args(cls, values: list[str]) -> list[str]:
        if any("\x00" in value or len(value) > 16384 for value in values):
            raise ValueError("MCP arguments contain a NUL or exceed 16384 characters")
        return values

    @field_validator("env")
    @classmethod
    def valid_environment(cls, values: dict[str, str]) -> dict[str, str]:
        if any(not key or "=" in key or "\x00" in key + value or len(key) > 256 or len(value) > 16384
               for key, value in values.items()):
            raise ValueError("MCP environment contains an invalid name or value")
        return values


class MCPHTTPConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    transport: Literal["streamable_http"]
    url: str = Field(min_length=1, max_length=4096)
    headers: dict[str, str] = Field(default_factory=dict, max_length=128)

    @field_validator("headers")
    @classmethod
    def valid_headers(cls, values: dict[str, str]) -> dict[str, str]:
        import re

        reserved = {"host", "content-length", "transfer-encoding", "connection",
                    "mcp-session-id", "mcp-protocol-version"}
        for key, value in values.items():
            if not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", key) or key.lower() in reserved:
                raise ValueError("MCP header name is invalid or reserved")
            if len(key) > 256 or len(value) > 16384 or any(ord(char) < 32 or ord(char) > 126 for char in value):
                raise ValueError("MCP header value contains invalid characters or is too long")
        return values


MCPConfig = Annotated[MCPStdioConfig | MCPHTTPConfig, Field(discriminator="transport")]
mcp_config_adapter = TypeAdapter(MCPConfig)


class MCPToolDescriptor(BaseModel):
    name: str
    description: str
    input_schema: dict
    output_schema: dict | None = None


class MCPToolsResponse(BaseModel):
    tools: list[MCPToolDescriptor] = Field(default_factory=list)
    discovered_at: datetime | None = None


class CredentialCreate(BaseModel):
    name: str
    type: str = Field(pattern=_CREDENTIAL_TYPE_PATTERN)
    # Config admission occurs inside the API so malformed secret-bearing input
    # never appears in Pydantic's default public validation errors.
    config: SkipValidation[dict] = Field(default_factory=dict)



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