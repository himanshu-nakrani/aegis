from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_DIR = Path(__file__).resolve().parents[2]
_BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            _BACKEND_DIR / ".env",
            _ROOT_DIR / ".env",
            ".env",
        ),
        extra="ignore",
    )

    google_api_key: str = ""
    database_url: str = "postgresql://user:password@localhost:5432/aegis"
    exa_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    embedding_model: str = "text-embedding-004"
    cors_origins: str = "http://localhost:3000"
    run_timeout_seconds: int = 300
    approval_timeout_seconds: int = 3600
    auth_enabled: bool = False
    aegis_api_key: str = ""
    aegis_api_key_user_map: str = ""
    log_level: str = "INFO"
    webhook_timeout_seconds: int = 10
    db_pool_size: int = 10
    db_max_overflow: int = 20
    max_concurrent_runs: int = 5
    schedule_enabled: bool = True
    schedule_poll_seconds: int = 60
    otel_enabled: bool = False
    otel_service_name: str = "aegis"
    otel_exporter_endpoint: str = ""
    otel_exporter_headers: str = ""
    otel_ui_base_url: str = ""
    presidio_enabled: bool = False
    otel_sample_rate: float = 1.0
    otel_node_spans: bool = True
    memory_flush_batch_size: int = 10
    run_execution_mode: str = "inline"
    run_worker_poll_seconds: int = 2
    rate_limit_per_minute: int = 120
    run_retention_days: int = 90
    retention_enabled: bool = False
    pgvector_enabled: bool = False
    db_pool_timeout: int = 30
    worker_port: int = 8001


settings = Settings()


def configure_runtime_env() -> None:
    """Unset IDE-local Gemini proxy vars that break direct API calls."""
    import os

    for key in (
        "GOOGLE_GEMINI_BASE_URL",
        "GOOGLE_GENAI_BASE_URL",
    ):
        os.environ.pop(key, None)

    if settings.google_api_key:
        os.environ["GOOGLE_API_KEY"] = settings.google_api_key


configure_runtime_env()