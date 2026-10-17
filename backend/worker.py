"""Standalone Aegis worker process for run execution and background jobs."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from app.config import settings
from app.logging_config import configure_logging
from app.services.run_worker import start_run_worker, stop_run_worker

configure_logging(settings.log_level)
logger = logging.getLogger("aegis.worker")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    from app.http_client import shutdown_http_client, startup_http_client
    from app.services.async_tasks import set_main_loop
    from app.services.executor import shutdown_active_runs
    from app.services.startup import check_migrations_current, recover_stale_runs
    from app.services.tracing import init_tracing, shutdown_tracing

    # Worker-mode runs execute in this process, so it must export their spans.
    init_tracing()
    # Schema is owned by Alembic (single source of truth) — same gate as the
    # API: refuse to boot when behind instead of create_all'ing a divergent
    # schema that wedges the database for both processes.
    check_migrations_current(
        strict=getattr(settings, "migration_check_strict", True)
    )
    # Worker owns recovery of runs left running/queued by a prior crash
    # (API process deliberately skips this when run_execution_mode=worker).
    # With resume_runs_on_boot this re-queues orphans for checkpoint resume
    # (which this worker's poll then claims); past resume_max_attempts it fails.
    recovered = recover_stale_runs(force=True)
    if recovered:
        logger.warning("Worker recovered %s stale run(s) on boot", recovered)
    set_main_loop(asyncio.get_running_loop())
    await startup_http_client()
    start_run_worker()
    logger.info("Worker process started", extra={"mode": settings.run_execution_mode})
    yield
    set_main_loop(None)
    await stop_run_worker()
    try:
        # stop_run_worker only stops the poller; runs it already scheduled are still
        # live. shutdown_active_runs cancels them and waits for the cancellation to
        # unwind, so their spans end before the provider closes — otherwise their
        # final spans are lost and later end() calls hit a closed provider.
        await shutdown_active_runs()
    finally:
        # Close (and flush) the provider even if draining raised.
        await shutdown_http_client()
        shutdown_tracing()


app = FastAPI(title="Aegis Worker", version="0.4.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aegis-worker"}


if __name__ == "__main__":
    uvicorn.run("worker:app", host="0.0.0.0", port=int(getattr(settings, "worker_port", 8001) or 8001))