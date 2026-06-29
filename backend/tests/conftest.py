import asyncio

import pytest

from app.db.database import Base, engine
from app.http_client import shutdown_http_client, startup_http_client
from app.services.graph_defaults import wrap_graph_with_trigger_end


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(scope="session", autouse=True)
def init_http_client():
    asyncio.run(startup_http_client())
    yield
    asyncio.run(shutdown_http_client())


def valid_graph(nodes: list, edges: list | None = None, **kwargs) -> dict:
    """Build a graph that satisfies Trigger → … → End validation."""
    return wrap_graph_with_trigger_end(nodes, edges or [], **kwargs)