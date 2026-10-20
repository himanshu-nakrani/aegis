from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator

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
    # Optional alternative LLM providers (per-node model selection,
    # multi-provider routing via LiteLLM). Each maps to the conventional env
    # var (OPENAI_API_KEY, ANTHROPIC_API_KEY, ...). When unset, that
    # provider's models are hidden from the catalog and gated at run time;
    # when set, the key is the fallback when a node has no bound provider
    # credential.
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    database_url: str = "sqlite:///./aegis.db"
    exa_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    embedding_model: str = "text-embedding-004"
    # Additional LLM provider keys (continued — see the block above).
    fireworks_ai_api_key: str = ""
    openrouter_api_key: str = ""
    featherless_api_key: str = ""
    ai_gateway_api_key: str = ""
    # Keyless local provider: base URL for the Ollama daemon (nodes may also
    # set `apiBase` directly; this is the process-wide override).
    ollama_api_base: str = ""
    # Operator-configured endpoints for keyed providers. Caller-supplied
    # apiBase/credential base_url are rejected at resolve time, so a custom
    # endpoint must be set here (e.g. OPENAI_API_BASE) to take effect.
    openai_api_base: str = ""
    anthropic_api_base: str = ""
    fireworks_api_base: str = ""
    openrouter_api_base: str = ""
    featherless_api_base: str = ""
    vercel_api_base: str = ""
    cors_origins: str = "http://localhost:3000"
    run_timeout_seconds: int = 300
    approval_timeout_seconds: int = 3600
    auth_enabled: bool = False
    aegis_api_key: str = ""
    aegis_api_key_user_map: str = ""

    @field_validator("aegis_api_key", mode="before")
    @classmethod
    def _reject_placeholder_api_key(cls, value: object) -> object:
        # Copying .env.example must not yield a working editor credential.
        if isinstance(value, str) and value.strip() == "your-secret-api-key":
            return ""
        return value
    log_level: str = "INFO"
    # Production deployments must block unavailable safety judges.
    deployment_environment: Literal["development", "production"] = "development"
    webhook_timeout_seconds: int = 10
    db_pool_size: int = 10
    db_max_overflow: int = 20
    max_concurrent_runs: int = 5
    # Age past which a pending/running run is treated as orphaned (crash, restart,
    # or a scheduled fire that never progressed). Must comfortably exceed
    # run_timeout_seconds so a legitimately in-flight run is never miscounted.
    # See services/run_concurrency.py — orphans age out of the concurrency gate
    # instead of permanently exhausting max_concurrent_runs.
    run_stale_after_seconds: int = 900
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
    # LangSmith export (OTLP/HTTP). Base URL only — the traces path is appended.
    # Self-hosted: https://<host>/api/v1. Content (prompts/outputs/tool args) is
    # stripped from the LangSmith export unless langsmith_capture_content is on.
    langsmith_enabled: bool = False
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_project: str = "aegis"
    langsmith_api_key: str = ""
    langsmith_capture_content: bool = False
    memory_flush_batch_size: int = 10
    # Run dispatch: "inline" executes in the API process; "worker" leaves
    # claiming to the dedicated worker process (backend/worker.py).
    # Literal-gated so a typo fails Settings construction instead of
    # silently skipping both recovery paths.
    run_execution_mode: Literal["inline", "worker"] = "inline"
    run_worker_poll_seconds: int = 2
    rate_limit_per_minute: int = 120
    run_retention_days: int = 90
    online_eval_sample_rate: float = Field(default=0.05, ge=0.0, le=1.0)
    retention_enabled: bool = False
    pgvector_enabled: bool = False
    # Vector index for knowledge retrieval: "auto" (pgvector on Postgres when
    # enabled, else sqlite_vec on SQLite, else JSON fallback), "pgvector",
    # "sqlite_vec", or "none" (JSON-embedding fallback only).
    vector_store: str = "auto"
    db_pool_timeout: int = 30
    worker_port: int = 8001
    assist_generate_per_minute: int = 6
    assist_suggest_per_minute: int = 30
    assist_explain_per_minute: int = 10
    assist_edit_per_minute: int = 10
    assist_compare_per_minute: int = 10
    assist_schema_per_minute: int = 20
    assist_eval_suite_per_minute: int = 6
    assist_llm_timeout_seconds: int = 60
    # Ephemeral single-node test endpoint (can invoke Gemini) — modest per-user cap.
    node_test_per_minute: int = 20
    # Startup migration gate (Alembic is the single source of schema truth).
    migration_check_enabled: bool = True
    migration_check_strict: bool = True
    # Encryption at rest for credential secrets (Fernet). Optional: when unset,
    # secrets are stored in plaintext with a loud warning.
    app_encryption_key: str = ""
    # Per-node Gemini call resilience (bounds a single model call; the whole-run
    # budget stays run_timeout_seconds). Total retry cost is capped so retries
    # cannot exceed the per-call budget budget across attempts.
    node_llm_timeout_seconds: int = 60
    node_llm_max_retries: int = 2
    node_llm_retry_initial_delay: float = 1.0
    # MCP stdio launches host processes; enable only on a trusted deployment.
    mcp_stdio_enabled: bool = False
    # Exact trusted hostnames/IPs permitted in addition to public HTTP endpoints.
    mcp_allowed_hosts: str = ""
    mcp_timeout_seconds: int = Field(default=30, ge=1, le=300)
    # Per-endpoint API rate limits (requests/minute). Applied by the middleware
    # via services/rate_limit.py; only enforced when auth is enabled.
    rate_limit_runs_create_per_minute: int = 30
    rate_limit_invoke_per_minute: int = 60
    # Hosted-chat surface: aegis_chat_ exchange token lifetime, and the
    # server-side HMAC session minted from it (sent as X-Aegis-Chat-Session).
    chat_token_ttl_days: int = 30
    chat_session_ttl_hours: int = 12
    # Phase 2 durable runs: resume pending/queued/running/awaiting_approval runs
    # on boot from run_checkpoints instead of failing them. resume_max_attempts
    # bounds the resume loop before a run is finally failed. event_bus_notify
    # gates the Postgres LISTEN/NOTIFY listener (SQLite dev/tests stay in-process).
    resume_runs_on_boot: bool = True
    resume_max_attempts: int = Field(default=3, ge=1, le=20)
    event_bus_notify_enabled: bool = True
    event_bus_poll_seconds: float = Field(default=30.0, ge=5.0, le=300.0)


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
    # LiteLLM (ADK LiteLlm wrapper + direct litellm calls) authenticates from env.
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    if settings.anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key


configure_runtime_env()