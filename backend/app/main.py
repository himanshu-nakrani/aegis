from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import credentials, meta, observability, runs, templates, workflows
from app.config import settings
from app.db.database import Base, engine
from app.http_client import shutdown_http_client, startup_http_client
from app.logging_config import configure_logging
from app.services.executor import shutdown_active_runs
from app.services.schedule_worker import start_schedule_worker, stop_schedule_worker
from app.services.startup import check_database, run_startup_tasks

import logging

configure_logging(settings.log_level)
logger = logging.getLogger("aegis.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    startup_status = run_startup_tasks()
    app.state.startup_status = startup_status
    await startup_http_client()
    start_schedule_worker()
    yield
    await stop_schedule_worker()
    await shutdown_active_runs()
    await shutdown_http_client()


app = FastAPI(title="Aegis API", version="0.4.0", lifespan=lifespan)

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(credentials.router)
app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(templates.router)
app.include_router(observability.router)


@app.get("/health")
def health(request: Request):
    db_ok = check_database()
    startup_status = getattr(request.app.state, "startup_status", {})
    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "service": "aegis-backend",
        "version": "0.4.0",
        "auth_enabled": settings.auth_enabled,
        "database_ok": db_ok,
        "stale_runs_recovered": startup_status.get("stale_runs_recovered", 0),
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
        extra={"event": "unhandled_exception"},
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )