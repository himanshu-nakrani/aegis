from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import observability, runs, templates, workflows
from app.config import settings
from app.db.database import Base, engine
from app.http_client import shutdown_http_client, startup_http_client
from app.logging_config import configure_logging

configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    await startup_http_client()
    yield
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

app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(templates.router)
app.include_router(observability.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "aegis-backend",
        "version": "0.4.0",
        "auth_enabled": settings.auth_enabled,
    }