from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.schemas.credential import CredentialCreate, CredentialListItem, CredentialResponse, MCPToolsResponse
from app.services.credentials import (
    decrypt_credential_config,
    encrypt_credential_config,
    mask_credential_config,
    get_user_credential,
    mcp_cached_tools,
    resolve_credential,
)
from app.services.integrations import clear_pg_engine_for_url
from app.services.mcp_client import (
    MCPClientError, MCPDisabledError, MCPTimeoutError,
    make_mcp_tool_cache, open_mcp_session, validate_mcp_config, validate_mcp_endpoint,
)

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


@router.get("", response_model=list[CredentialListItem])
def list_credentials(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    rows = (
        db.query(models.Credential)
        .filter(models.Credential.user_id == user_id)
        .order_by(models.Credential.name.asc())
        .all()
    )
    return [
        CredentialListItem(
            id=row.id,
            name=row.name,
            type=row.type,
            config=mask_credential_config(row.type, row.config),
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("", response_model=CredentialResponse)
def create_credential(
    payload: CredentialCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    config = payload.config
    if payload.type == "mcp":
        try:
            config = validate_mcp_config(config, writing=True)
            if config["transport"] == "streamable_http":
                validate_mcp_endpoint(config["url"])
        except MCPDisabledError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from None
        except MCPClientError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
    elif not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="Credential config must be a JSON object")

    existing = (
        db.query(models.Credential)
        .filter(models.Credential.user_id == user_id, models.Credential.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Credential '{payload.name}' already exists")

    row = models.Credential(
        user_id=user_id,
        name=payload.name,
        type=payload.type,
        config=encrypt_credential_config(config),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CredentialResponse(
        id=row.id,
        name=row.name,
        type=row.type,
        config=mask_credential_config(row.type, row.config),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _owned_mcp_credential(db: Session, user_id: UUID, credential_id: UUID):
    row = get_user_credential(db, user_id, credential_id=credential_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    if row.type != "mcp":
        raise HTTPException(status_code=400, detail="Credential is not an MCP server")
    return row


@router.get("/{credential_id}/mcp/tools", response_model=MCPToolsResponse)
def cached_mcp_tools(
    credential_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    row = _owned_mcp_credential(db, user_id, credential_id)
    cache = row.mcp_tool_cache if isinstance(row.mcp_tool_cache, dict) else {}
    tools = []
    for tool in mcp_cached_tools(cache):
        name = tool.get("name")
        schema = tool.get("input_schema")
        if not isinstance(name, str) or not isinstance(schema, dict):
            continue
        description = tool.get("description")
        output_schema = tool.get("output_schema")
        tools.append(
            {
                "name": name,
                "description": description if isinstance(description, str) else "",
                "input_schema": schema,
                "output_schema": output_schema if isinstance(output_schema, dict) else None,
            }
        )
    return {"tools": tools, "discovered_at": cache.get("discovered_at")}


@router.post("/{credential_id}/mcp/discover", response_model=MCPToolsResponse)
async def discover_mcp_tools(
    credential_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    row = _owned_mcp_credential(db, user_id, credential_id)
    config = resolve_credential(row)
    try:
        async with open_mcp_session(config) as session:
            tools = await session.list_tools()
        cache = make_mcp_tool_cache(tools, config)
    except MCPDisabledError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None
    except MCPTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from None
    except MCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    row.mcp_tool_cache = cache
    db.commit()
    return cache


@router.delete("/{credential_id}")
def delete_credential(
    credential_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    row = (
        db.query(models.Credential)
        .filter(models.Credential.id == credential_id, models.Credential.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Credential not found")
    if row.type == "postgres":
        connection_url = decrypt_credential_config(row.config or {}).get("connection_url")
        if connection_url:
            clear_pg_engine_for_url(connection_url)
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": str(credential_id)}