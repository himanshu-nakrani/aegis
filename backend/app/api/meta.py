from fastapi import APIRouter

from app.services.node_registry import NODE_REGISTRY

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/nodes")
def list_node_types():
    return {"nodes": NODE_REGISTRY}