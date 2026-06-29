import asyncio

import pytest

from app.http_client import shutdown_http_client, startup_http_client


@pytest.fixture(scope="session", autouse=True)
def init_http_client():
    asyncio.run(startup_http_client())
    yield
    asyncio.run(shutdown_http_client())