from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import runs, templates, workflows
from app.config import settings
from app.db.database import Base, engine

app = FastAPI(title="Aegis API", version="0.3.0")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "aegis-backend"}