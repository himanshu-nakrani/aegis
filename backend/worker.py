"""Standalone Aegis worker process for run execution and background jobs."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from app.config import settings
from app.db.database import Base, engine
from app.logging_config import configure_logging
from app.services.run_worker import start_run_worker, stop_run_worker

configure_logging(settings.log_level)
logger = logging.getLogger("aegis.worker")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    start_run_worker()
    logger.info("Worker process started", extra={"mode": settings.run_execution_mode})
    yield
    await stop_run_worker()


app = FastAPI(title="Aegis Worker", version="0.4.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aegis-worker"}


if __name__ == "__main__":
    uvicorn.run("worker:app", host="0.0.0.0", port=int(getattr(settings, "worker_port", 8001) or 8001))