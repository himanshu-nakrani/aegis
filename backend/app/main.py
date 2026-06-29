from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import runs, workflows
from app.config import settings
from app.db.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Aegis API", version="0.1.0")

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "aegis-backend"}