# Aegis Issue Tracker

Last updated: 2026-06-30

## Resolved (Phase 14)

| Area | Issue | Resolution |
|------|-------|------------|
| Security | Code sandbox breakout via `json.codecs.sys` | `_SafeJsonNamespace` + AST visitor restrictions |
| Security | HTTP SSRF DNS rebinding | DNS pinning in `safe_http_request` |
| Security | Postgres integration SSRF | `_validate_postgres_connection_url` |
| Security | Postgres read-only regex bypass | `SET TRANSACTION READ ONLY` |
| Security | SMTP blocks event loop | `asyncio.to_thread` in email integration |
| Bugs | Approval race before node wait | Early return from `_approval_results` in `wait_for_approval` |
| Bugs | Sub-workflow infinite recursion | Call stack depth limit + cycle detection |
| Bugs | `has_eval` run filter on SQLite | Python-side filter via `run_filters.py` |
| Performance | Scheduler scans all workflow graphs | `workflow_schedules` table + indexed query |
| Performance | Scheduler in-memory dedup | `last_fired_at` + `FOR UPDATE SKIP LOCKED` |
| Performance | Long-held DB sessions during runs | Short-lived `_with_run_session` in executor |
| Performance | Observability 100-run scans | Hourly rollups (write + read) |
| Ops | KB bulk/reindex blocks API | DB-backed `background_jobs` queue |
| Ops | No job status endpoint | `GET /api/jobs/{id}` |
| Ops | Runs compete with API threads | Optional `RUN_EXECUTION_MODE=worker` + `worker.py` |
| Product | Version diff in sidebar | `VersionDiffView` wired in `VersionHistory` |
| Product | Eval regression live alerts | SSE `eval_regression` banner on observability page |
| Product | Human approval template | `human-approval-gate` in `templates.py` |
| RAG | pgvector column + vector search | Migration 006 + `vector_search.py` |
| UX | Phase 15 design uplift | Shared `EmptyState`/`Alert`/`FilterChip`/`ListRow`, mobile nav, responsive canvas drawers, DM Sans typography, stagger animations |

## Open / Backlog

| Priority | Area | Issue | Notes |
|----------|------|-------|-------|
| P2 | Scale | Redis-backed queue | DB queue works for single-region; Redis for multi-worker fan-out |
| P2 | Scale | Rollup idempotency on backfill | Backfill may double-count without reset |
| P3 | Product | Workflow version visual diff on canvas | Sidebar diff done; canvas overlay pending |
| P3 | Auth | API key rotation + audit log | Rate limiting added; rotation UI not built |
| P3 | RAG | pgvector index tuning | Column + query path added; IVFFlat index not created |
| P3 | Ops | Retention job scheduling | `retention.py` exists; not wired to startup cron |

## Reporting

Open new issues on GitHub with reproduction steps, expected behavior, and environment (`DATABASE_URL` dialect, `RUN_EXECUTION_MODE`, auth settings).