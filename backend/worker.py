"""Standalone Aegis worker process for run execution and background jobs."""

from __future__ import annotations

import asyncio
import logging

import uvicorn
from fastapi import FastAPI

from app.config import settings
from app.db.database import Base, engine
from app.logging_config import configure_logging
from app.services.run_worker import start_run_worker, stop_run_worker

configure_logging(settings.log_level)
logger = logging.getLogger("aegis.worker")

app = FastAPI(title="Aegis Worker", version="0.4.0")


@app.on_event("startup")
async def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    start_run_worker()
    logger.info("Worker process started", extra={"mode": settings.run_execution_mode})


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await stop_run_worker()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aegis-worker"}


if __name__ == "__main__":
    uvicorn.run("worker:app", host="0.0.0.0", port=int(getattr(settings, "worker_port", 8001) or 8001))