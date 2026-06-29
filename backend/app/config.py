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