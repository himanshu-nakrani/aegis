# Aegis Issue Tracker

Last updated: 2026-06-30

## Resolved (Phase 14–16 + Security Hardening)

| Area | Issue | Resolution |
|------|-------|------------|
| Security | Code sandbox breakout via `json.codecs.sys` | `_SafeJsonNamespace` + AST visitor restrictions |
| Security | HTTP SSRF DNS rebinding | DNS pinning in `safe_http_request` |
| Security | Postgres integration SSRF | `_validate_postgres_connection_url` |
| Security | Postgres read-only regex bypass | `SET TRANSACTION READ ONLY` |
| Security | SMTP blocks event loop | `asyncio.to_thread` in email integration |
| Security | SSRF in webhook dispatch | `validate_http_url` + `safe_http_request` in `webhook.py` |
| Security | SSRF in Discord/Slack integrations | URL validation + pinned HTTP in `integrations.py` |
| Security | SQL injection in Postgres node | Template placeholders bound as SQL parameters |
| Bugs | Approval race before node wait | Early return from `_approval_results` in `wait_for_approval` |
| Bugs | Sub-workflow infinite recursion | Call stack depth limit + cycle detection |
| Bugs | `has_eval` run filter on SQLite | Python-side filter via `run_filters.py` |
| Bugs | EventSource connection leak (canvas) | `runSourceRef` + unmount/error cleanup |
| Bugs | Unhandled promise in RunComparison | `.catch()` on `getEvalHistory` |
| Bugs | refreshTimer leak (observability) | `clearTimeout` on unmount |
| Bugs | Stale closure in Save→Run flow | Inline `saveVersion` returns fresh `versionId` |
| Bugs | Stale closure on run cancel | `currentRunIdRef` + memoized `handleStop` |
| Bugs | Backspace deletes while in `<select>` | Exclude `HTMLSelectElement` from delete handler |
| Bugs | Falsy `0` rendered in RunDetailView | Explicit length checks |
| Bugs | Missing create-workflow error toast | `toast.error` in `workflows/new` |
| Performance | Scheduler scans all workflow graphs | `workflow_schedules` table + indexed query |
| Performance | Scheduler in-memory dedup | `last_fired_at` + `FOR UPDATE SKIP LOCKED` |
| Performance | Long-held DB sessions during runs | Short-lived `_with_run_session` in executor |
| Performance | Observability 100-run scans | Hourly rollups (write + read) |
| Performance | Sync DB in `/health` | `asyncio.to_thread` for DB counts |
| Performance | Persistent SSE on all pages | Lazy connect when first subscriber attaches |
| Ops | KB bulk/reindex blocks API | DB-backed `background_jobs` queue |
| Ops | No job status endpoint | `GET /api/jobs/{id}` |
| Ops | Runs compete with API threads | Optional `RUN_EXECUTION_MODE=worker` + `worker.py` |
| Ops | Deprecated worker lifecycle hooks | FastAPI `lifespan` in `worker.py` |
| Product | Version diff in sidebar | `VersionDiffView` wired in `VersionHistory` |
| Product | Eval regression live alerts | SSE `eval_regression` banner on observability page |
| Product | Human approval template | `human-approval-gate` in `templates.py` |
| Product | No DELETE endpoint for workflows | `DELETE /api/workflows/{id}` with cascade cleanup |
| RAG | pgvector column + vector search | Migration 006 + `vector_search.py` |
| UX | Phase 15 design uplift | Shared primitives, mobile nav, responsive canvas |
| UX | Broken `section-title` class | Fixed to `section-heading` in RunDetailView |
| Architecture | SPA mutable cache conflicts | Removed module-level caches from `api.ts` |
| Reliability | Unbound rate limiter memory | Periodic prune of stale bucket keys |
| Reliability | Fire-and-forget task leaks | `schedule_task` with exception logging |
| Code Quality | Duplicate `needs_gemini` helper | `workflow_capabilities.py` shared module |

## Open / Backlog

### P2 — Medium Priority

| Area | Issue | Location / Context | Notes |
|------|-------|--------------------|-------|
| Scale | Redis-backed queue | *New design needed* | DB queue works for single-region; Redis for multi-worker scale out |
| Scale | Rollup idempotency on backfill | `rollup_backfill.py` | Backfill increments counters instead of resetting |
| Performance | Inefficient retention query | `retention.py` | Individual DELETEs instead of bulk operations |
| Reliability | Race conditions in schedule claim | `schedule_worker.py` | Per-schedule commits inside shared session |
| Reliability | SSE subscriber queue leaks | `observability_events.py` | Disconnected clients may leave abandoned queues |
| Security | CORS wildcard credentials | `main.py` | Wildcard origins now disable credentials; set explicit `CORS_ORIGINS` in prod |

### P3 — Low Priority / Code Quality / UX

| Area | Issue | Location / Context | Notes |
|------|-------|--------------------|-------|
| Product | Workflow version visual diff on canvas | Canvas view | Sidebar diff done; canvas overlay pending |
| Auth | API key rotation + audit log | Auth module | Rotation UI not built |
| RAG | pgvector index tuning | DB migrations | Column added; HNSW/IVFFlat index not created |
| Ops | Retention job scheduling | `startup.py` | `retention.py` not wired to startup cron |
| Bugs | SQLite JSON query filters | `runs.py` | `.as_boolean()` filters fail on SQLite |
| Bugs | Embedding dimension mismatch | `embeddings.py` | Hash fallback 128-dim vs pgvector 768-dim |
| Security | Templates endpoint unauthenticated | `templates.py` | Bypasses API key when auth enabled |
| Security | ReDoS in user-supplied regex | `guardrail.py` | Unvalidated regex compile risk |
| Security | Code sandbox execution timeout | `code_sandbox.py` | Infinite loops can hang worker threads |

## Reporting

Open new issues on GitHub with reproduction steps, expected behavior, and environment (`DATABASE_URL` dialect, `RUN_EXECUTION_MODE`, auth settings).