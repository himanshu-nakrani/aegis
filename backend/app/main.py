import asyncio
import math
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import annotation, assist, chat, credentials, eval_presets, event_webhooks, jobs, mcp as mcp_api, meta, node_test, observability, prompts, playground, runs, templates, workflows, datasets, experiments, feedback, guardrail_policies, alerts, platform
from app.config import settings
from app.http_client import shutdown_http_client, startup_http_client
from app.logging_config import configure_logging
from app.services.event_bus import start_event_listener, stop_event_listener
from app.services.executor import active_run_count, shutdown_active_runs
from app.services.rate_limit import check_rate_limit, rate_limited_path
from app.services.run_worker import run_worker_status, stop_run_worker
from app.services.schedule_worker import scheduler_status, start_schedule_worker, stop_schedule_worker
from app.db import models
from app.db.database import SessionLocal
from app.services.tracing import (
    adk_spans_exported,
    init_tracing,
    install_http_middleware,
    is_langsmith_export_enabled,
    is_tracing_enabled,
    shutdown_tracing,
)
from app.services.startup import check_database, resume_orphaned_runs, run_startup_tasks

import logging

configure_logging(settings.log_level)
logger = logging.getLogger("aegis.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.async_tasks import set_main_loop

    init_tracing()
    # NOTE: schema is owned by Alembic (single source of truth). We intentionally
    # do NOT call Base.metadata.create_all here — run_startup_tasks() instead
    # gates boot on migrations being current (see services/startup.py).
    startup_status = run_startup_tasks()
    app.state.startup_status = startup_status
    set_main_loop(asyncio.get_running_loop())
    await startup_http_client()
    start_schedule_worker()
    # Durable event transport: LISTEN/NOTIFY fan-out for runs executing in the
    # worker process (no-op on SQLite or when event_bus_notify_enabled is off).
    start_event_listener()
    # Durable runs: pick up runs left pending/queued by a crash (or re-queued
    # by recover_stale_runs) so the inline backlog advances without a worker.
    # No-op in worker mode — the dedicated worker's poll owns claiming there.
    try:
        resumed = await resume_orphaned_runs()
        if resumed:
            logger.info("Resumed %s orphaned run(s) on boot", resumed)
    except Exception:
        logger.exception("Failed to resume orphaned runs on boot")
    # Re-dispatch background jobs stranded in queued by a restart — dispatch
    # only happens at create time otherwise, so without this they never run.
    try:
        from app.services.job_queue import dispatch_job
        from app.services.startup import pending_job_ids

        for job_id in pending_job_ids():
            asyncio.create_task(dispatch_job(job_id))
    except Exception:
        logger.exception("Failed to re-dispatch queued jobs on boot")
    # Do NOT start the in-process run worker here. In "worker" execution mode a
    # dedicated worker.py process owns run claiming/execution; starting the loop
    # here too would let both the API and the worker claim the same pending runs
    # (split-brain double-claim). In "inline" mode create_run schedules runs
    # directly, so no polling worker is needed either.
    # NOTE (single-process constraint): SSE streams and human-approval waits live
    # in the executor's in-memory broker/approval state. When runs execute in the
    # separate worker process, /stream and /approve served by the API process
    # cannot see that state. Cross-process streams/approvals require a shared
    # transport (out of scope for this fix).
    yield
    set_main_loop(None)
    await stop_run_worker()
    await stop_schedule_worker()
    await stop_event_listener()
    await shutdown_active_runs()
    await shutdown_http_client()
    shutdown_tracing()


app = FastAPI(title="Aegis API", version="0.4.0", lifespan=lifespan)
install_http_middleware(app)

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
allow_credentials = bool(origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(eval_presets.router)
app.include_router(credentials.router)
app.include_router(workflows.router)
app.include_router(node_test.router)
app.include_router(runs.router)
app.include_router(templates.router)
app.include_router(observability.router)
app.include_router(jobs.router)
app.include_router(datasets.router)
app.include_router(experiments.router)
app.include_router(feedback.router)
app.include_router(guardrail_policies.router)
app.include_router(alerts.router)
app.include_router(platform.router)
app.include_router(chat.router)
app.include_router(assist.router)
app.include_router(prompts.router)
app.include_router(playground.router)
app.include_router(annotation.router)
app.include_router(event_webhooks.router)

# MCP server (Streamable HTTP, stateless): deployment-scoped invoke tools for
# published workflows. Mounted after all routers so real routes always win.
app.router.routes.extend(mcp_api.mcp_routes)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if rate_limited_path(request.url.path):
        try:
            check_rate_limit(request)
        except HTTPException as exc:
            # Raised inside middleware — translate directly; routing-level
            # exception handlers never see it (otherwise it falls through as
            # a 500 via the generic Exception handler).
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


@app.middleware("http")
async def viewer_role_middleware(request: Request, call_next):
    """RBAC-lite: viewer keys are read-only across all mutating API methods."""
    if (
        settings.auth_enabled
        and request.url.path not in {"/v1/invoke", "/v1/invoke/"}
        and not request.url.path.startswith("/v1/chat/")
        and not (
            request.url.path.startswith("/v1/workflows/")
            and request.url.path.rstrip("/").endswith("/invoke")
        )
        and (
            request.url.path.startswith("/api/")
            or request.url.path.startswith("/v1/")
        )
        and request.method in {"POST", "PUT", "PATCH", "DELETE"}
    ):
        from fastapi.responses import JSONResponse as _JSONResponse

        from app.auth.deps import _resolve_api_token, role_from_api_key

        token = _resolve_api_token(
            request.headers.get("authorization"),
            request.headers.get("x-aegis-api-key"),
        )
        if role_from_api_key(token) == "viewer":
            return _JSONResponse(
                status_code=403, content={"detail": "Viewer keys are read-only"}
            )
    return await call_next(request)


def _health_db_counts() -> tuple[int, int]:
    db = SessionLocal()
    try:
        pending_runs = (
            db.query(models.WorkflowRun)
            .filter(models.WorkflowRun.status.in_(["pending", "queued"]))
            .count()
        )
        queued_jobs = (
            db.query(models.BackgroundJob)
            .filter(models.BackgroundJob.status == "queued")
            .count()
        )
        return pending_runs, queued_jobs
    finally:
        db.close()


@app.get("/health")
async def health(request: Request):
    db_ok = await asyncio.to_thread(check_database)
    startup_status = getattr(request.app.state, "startup_status", {})
    status = "ok" if db_ok else "degraded"

    pending_runs = 0
    queued_jobs = 0
    if db_ok:
        pending_runs, queued_jobs = await asyncio.to_thread(_health_db_counts)

    return {
        "status": status,
        "service": "aegis-backend",
        "version": "0.4.0",
        "auth_enabled": settings.auth_enabled,
        "database_ok": db_ok,
        "stale_runs_recovered": startup_status.get("stale_runs_recovered", 0),
        "stale_jobs_recovered": startup_status.get("stale_jobs_recovered", 0),
        "scheduler": scheduler_status(),
        "run_worker": run_worker_status(),
        "active_runs": active_run_count(),
        "pending_runs": pending_runs,
        "queued_jobs": queued_jobs,
        "max_concurrent_runs": settings.max_concurrent_runs,
        "tracing_enabled": is_tracing_enabled(),
        "langsmith_export": is_langsmith_export_enabled(),
        "adk_spans_exported": adk_spans_exported(),
        "langsmith_project": settings.langsmith_project if is_langsmith_export_enabled() else None,
        "langsmith_capture_content": bool(settings.langsmith_capture_content)
        if is_langsmith_export_enabled()
        else None,
        "tracing_ui_base_url": settings.otel_ui_base_url or None,
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


def _json_safe(value):
    """Recursively replace non-finite floats so ``json.dumps`` cannot raise."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request: Request, exc: RequestValidationError):
    """Return 422 for malformed bodies — sanitizing the echoed errors first.

    ``exc.errors()`` echoes the rejected ``input`` back to the client, and a
    NaN/inf value (e.g. an alert threshold) makes Starlette's strict
    ``json.dumps`` raise inside the handler itself, turning a 422 into a 500.
    ``ctx`` likewise carries live exception objects that are not JSON-safe.
    """
    errors = _json_safe(exc.errors())
    for error in errors:
        ctx = error.get("ctx")
        if ctx:
            error["ctx"] = {
                key: (str(item) if isinstance(item, BaseException) else _json_safe(item))
                for key, item in ctx.items()
            }
    return JSONResponse(status_code=422, content={"detail": errors})