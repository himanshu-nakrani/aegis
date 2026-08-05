# Graph Report - .  (2026-08-06)

## Corpus Check
- 390 files · ~421,318 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3013 nodes · 8010 edges · 168 communities (135 shown, 33 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.65)
- Token cost: 225,934 input · 0 output

## Community Hubs (Navigation)
- Workflows API
- Shared UI Primitives
- Observability Service
- API Client & Types
- Settings & Eval UI
- Run Detail & Trace UI
- Runs API
- Graph Validation
- Experiments & Quality UI
- Embeddings & Vector Search
- Workflow Compiler
- URL Safety & Webhooks
- Workflow Canvas Core
- Observability Dashboard UI
- Cost & Trust Dashboards
- Node Palette & Categories
- Run Executor
- AI Assist Service
- Guardrail Policy Plugin
- Assist Schemas & Explain
- Job Queue & Knowledge Indexing
- Command Palette & App Shell
- Run Deck
- Approvals & Code Sandbox
- Node Handlers
- Run Event Broker
- Canvas Node Components
- Guardrail Policies API
- Run-From-Here Authoring
- Datasets API
- Platform Ingest & Invoke
- Run & Dataset Models
- Frontend TS Config
- AgentOps Plan (docs)
- Version Diff & Sidebar
- Database Models
- Motion Primitives
- Node Registry & Quick-Add
- Config, Deps & Feedback
- Eval Presets API
- Alerts & Anomaly Detection
- Workflow Context
- Header Actions & Menus
- App Entrypoint & Middleware
- Assist MVP2 Tests
- Guardrail Engine
- App Rail & Toolbar
- Guardrail Playground UI
- Experiments API & Async Tasks
- HTTP Client & Search
- Startup & Migration Gate
- shadcn/Tailwind Config
- Rate Limiting & Resilience
- Assist Tests
- Deterministic Eval
- Expressions & Templating
- Guardrail Fail Behavior
- OTel Tracing
- Budget Enforcement
- Eval Judge & Preview
- Model Reference Resolver
- Integration Nodes
- App Providers & Layout
- Credential Encryption
- Run Worker & Logging
- Run Replay & Progress
- Alerts API
- DB Session & Rollup Backfill
- Schedule Worker & Cron
- Quality Alerts & Webhooks
- Frontend Dependencies
- Frontend Dev Dependencies
- Eval Preset Service
- Structured-Output Guardrail
- Token Tracker Plugin
- Credentials API
- Templates & Graph Defaults
- RAG Metrics
- Trace Plugin
- Architecture (docs)
- Onboarding & First Run
- Credential Resolution
- Observability SSE Events
- Auth & API Keys (frontend)
- Theme Provider
- Eval Runner
- MVP2 Foundation Tests
- Sandbox Safety Visitor
- Moderation Guardrail
- Presidio PII Detection
- Frontend Package Manifest
- Deploy Descriptor & MCP Schema
- Experiment Runner
- Phase 4 Tests
- Run Input Hook
- Highlighted Sample & PII UI
- Canvas Tour
- Eval-Threshold Tests
- Experiment Gate Tests
- _run_single_node_variant
- test_routing_adk2.py
- CanvasContextMenu.tsx
- 012_run_spans_tags_sessions.py
- 013_alert_baseline_comparison.py
- scheduler_status
- UX Audit 2026-07-11
- Evaluation rigor: online evals +
- Glass & glow visual language
- node_registry.py
- IP validation)
- 009_agentops_tables_backfill.py
- 011_workflow_templates.py
- extends
- tailwind.config.ts
- Data model (24 SQLAlchemy tables
-  multi-provider support (P0.1)
- PII, block vs warn)
- Tailwind v4 syntax dead in v3 bu
- next.config.mjs
- Phase 3 Guardrails as policy lay
- worker single-process constraint
- cmdk
- Bidirectional MCP (client + real
- RAG depth (Knowledge Pipeline)
- Phase 2 Release 1.5 - Stabilize
- Aegis UI overhaul implementation
- framer-motion
- geist
- next
- react
- react-dom
- tailwind-merge
- tailwindcss-animate
- react-query
- postcss.config.mjs
- vercel.json
- DB-backed background_jobs queue
- workflow_schedules table + index
- Phase 2 Release 2.0 - Productize
-  DuckDuckGo)
- Geist font integration
- UX audit 2026-07-25 (74 verified
- Error-state pandemic (failed que
- label duplication drift (tone ma
- P0: wrong timezone under a 'UTC'
- Observability window inconsisten
- Aegis issue tracker (resolved + 
- Security hardening (SSRF, SQLi, 
-  post-run evaluations (asyncio.g
- Observability upgrade plan

## God Nodes (most connected - your core abstractions)
1. `cn()` - 197 edges
2. `valid_graph()` - 49 edges
3. `Button` - 47 edges
4. `compile_workflow()` - 44 edges
5. `api` - 43 edges
6. `validate_workflow_graph()` - 38 edges
7. `_build_adk_node()` - 34 edges
8. `render_template()` - 30 edges
9. `Base` - 29 edges
10. `queryKeys` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Workflow compilation to ADK Workflow` --references--> `compile_workflow()`  [EXTRACTED]
  docs/architecture.md → backend/app/services/compiler.py
- `North star loop Build to Run to Trust` --semantically_similar_to--> `Closed-loop agent lifecycle (Author to Ship)`  [INFERRED] [semantically similar]
  agentops_plan.md → README.md
- `Chroma-reserved design language (warm near-black, bone, monochrome)` --semantically_similar_to--> `Obsidian + Oxide Copper palette (Canvas Run Lens)`  [INFERRED] [semantically similar]
  README.md → design-qa.md
- `Evaluation rigor: online evals + CI gates (P1.2)` --semantically_similar_to--> `Deterministic evaluators (exact/substring, regex, embedding similarity)`  [INFERRED] [semantically similar]
  docs/ROADMAP.md → upgrade_plan.md
- `Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5)` --semantically_similar_to--> `Deterministic evaluators (exact/substring, regex, embedding similarity)`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-06-29-aegis-phase-2-plan.md → upgrade_plan.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Aegis run pipeline (validate to compile to execute on ADK)** — claude_run_pipeline, claude_graph_validation, claude_compiler, claude_executor, readme_adk [EXTRACTED 1.00]
- **AgentOps platform roadmap phases** — agentops_plan_phase1, agentops_plan_phase2, agentops_plan_phase3, agentops_plan_phase4, agentops_plan_phase5 [EXTRACTED 1.00]
- **Server-side untrusted-input execution/exfiltration cluster** — isses_code_sandbox_breakout, isses_dns_rebinding_ssrf, isses_postgres_ssrf [INFERRED 0.75]
- **Three P0 audit findings (broken/misleading/inaccessible)** — docs_ui_ux_audit_2026_07_25_dead_focus_ring, docs_ui_ux_audit_2026_07_25_eval_chroma_bug, docs_ui_ux_audit_2026_07_25_utc_timezone_bug [EXTRACTED 1.00]
- **Aegis roadmap priority feature gaps** — docs_roadmap_multi_model_support, docs_roadmap_bidirectional_mcp, docs_roadmap_rag_depth, docs_roadmap_eval_rigor, docs_roadmap_durable_execution [EXTRACTED 1.00]
- **Glass & glow UI overhaul system** — docs_superpowers_specs_2026_07_01_ui_overhaul_design_glass_and_glow, docs_superpowers_specs_2026_07_01_ui_overhaul_design_design_tokens, docs_superpowers_specs_2026_07_01_ui_overhaul_design_shadcn_migration, docs_superpowers_specs_2026_07_01_ui_overhaul_design_canvas_reskin, docs_superpowers_plans_2026_07_01_ui_overhaul_motion_primitives [EXTRACTED 1.00]

## Communities (168 total, 33 thin omitted)

### Community 0 - "Workflows API"
Cohesion: 0.05
Nodes (107): list_node_types(), ops_config(), preview_cron(), preview_guardrail(), get, post, Read-only operational knobs (env-driven) for the Settings page., tracing_config() (+99 more)

### Community 1 - "Shared UI Primitives"
Cohesion: 0.04
Nodes (81): CapabilityBadges(), complexityLabel(), FILTER_IDS, FILTER_OPTIONS, previewLayout(), TemplateFilter, templateFlags(), TemplateMeta() (+73 more)

### Community 2 - "Observability Service"
Cohesion: 0.06
Nodes (80): observability_costs(), observability_dashboards(), observability_errors(), observability_overview(), observability_quality(), observability_runs(), observability_summary(), observability_trust() (+72 more)

### Community 3 - "API Client & Types"
Cohesion: 0.03
Nodes (73): TemplateCardProps, argBest(), buildCompareConfig(), charDiff(), COMPARE_ELIGIBLE, CompareMode(), CRON_PRESETS, deriveUpstreamNodeIds() (+65 more)

### Community 4 - "Settings & Eval UI"
Cohesion: 0.07
Nodes (53): CONFIG_HINTS, REQUIRED_CREDENTIAL_FIELDS, WorkflowCanvas, EdgeInspectorProps, WorkflowDataPanel(), WorkflowDataPanelProps, WorkflowGuardrailFieldProps, ErrorBoundaryProps (+45 more)

### Community 5 - "Run Detail & Trace UI"
Cohesion: 0.07
Nodes (55): NodeInspectorProps, RunDeckProps, SessionRuns(), StatusMix(), TraceIdBadge(), EvalScoresChart(), EvalScoresChartProps, formatDelta() (+47 more)

### Community 6 - "Runs API"
Cohesion: 0.06
Nodes (66): approve_run(), _as_utc(), create_run(), export_run(), get_run(), get_run_llm_calls(), get_run_timeline(), get_run_trace() (+58 more)

### Community 7 - "Graph Validation"
Cohesion: 0.06
Nodes (57): _builtin_items(), create_template(), list_eval_presets(), list_templates(), _persisted_item(), get, post, Session (+49 more)

### Community 8 - "Experiments & Quality UI"
Cohesion: 0.07
Nodes (45): WorkflowNameEditor(), ExperimentsPanel(), ExperimentsPanelProps, verdictBadge(), PanelSection(), PanelStat(), PanelStatGrid(), STAT_TONES (+37 more)

### Community 9 - "Embeddings & Vector Search"
Cohesion: 0.08
Nodes (49): cosine_similarity_vectors(), embed_text(), _hashing_vector(), Any, Text embeddings for vector RAG (Gemini with TF-IDF fallback)., retrieve_by_embedding(), _cosine_similarity(), Any (+41 more)

### Community 10 - "Workflow Compiler"
Cohesion: 0.09
Nodes (50): AdkEdge, AST, _branch_default_label(), _build_adk_node(), _build_author_lookup(), _build_bound_workflow(), _build_graph_edges(), compile_workflow() (+42 more)

### Community 11 - "URL Safety & Webhooks"
Cohesion: 0.08
Nodes (42): _validate_postgres_connection_url(), Guardrails against catastrophic backtracking in user-supplied regex patterns., validate_safe_regex(), execute_sub_workflow(), Any, UUID, Execute a child workflow from a Sub-workflow node (n8n Execute Workflow)., _hostname_blocked() (+34 more)

### Community 12 - "Workflow Canvas Core"
Cohesion: 0.08
Nodes (37): AssistRail(), ClipboardStore, copyToClipboard(), duplicateFragment(), hasClipboard(), materialize(), materializeClipboard(), nextNodeIndex() (+29 more)

### Community 13 - "Observability Dashboard UI"
Cohesion: 0.09
Nodes (34): AttentionItem, buildAttentionItems(), KIND_STATUS, kindClass(), kindLabel(), ObservabilityPage(), ObservabilitySummary, ObservabilityView (+26 more)

### Community 14 - "Cost & Trust Dashboards"
Cohesion: 0.09
Nodes (32): HomePage(), HomeOverviewStrip(), AggregateKind, CellValue, CostBreakdownColumn, CostBreakdownRow, CostBreakdownTable(), CostBreakdownTableProps (+24 more)

### Community 15 - "Node Palette & Categories"
Cohesion: 0.09
Nodes (29): DescribeWorkflowCard(), DescribeWorkflowCardProps, GeneratedNotes(), GeneratedWorkflow, describeShape, NewWorkflowPage(), pointForNode(), StarterGraphPreview() (+21 more)

### Community 16 - "Run Executor"
Cohesion: 0.09
Nodes (35): configure_runtime_env(), Unset IDE-local Gemini proxy vars that break direct API calls., log_context(), EvalThresholdBlockedError, Exception, _as_utc(), _commit_db(), _consume_with_timeout() (+27 more)

### Community 17 - "AI Assist Service"
Cohesion: 0.09
Nodes (35): CompareVariantResult, EdgeRef, GraphDiff, NodeSuggestion, _assign_positions(), AssistError, compare_variants(), _compute_graph_diff() (+27 more)

### Community 18 - "Guardrail Policy Plugin"
Cohesion: 0.11
Nodes (30): _contents_to_text(), _decode_str_response(), _expects_json(), GuardrailPolicyPlugin, Any, BasePlugin, LlmResponse, Workflow-level guardrail policy enforced through ADK plugin callbacks. A per-… (+22 more)

### Community 19 - "Assist Schemas & Explain"
Cohesion: 0.15
Nodes (34): compare(), edit_graph(), explain_run(), generate_schema(), generate_workflow(), _get_user_run(), EditGraphResponse, GenerateSchemaResponse (+26 more)

### Community 20 - "Job Queue & Knowledge Indexing"
Cohesion: 0.13
Nodes (29): BackgroundJob, KnowledgeDocument, create_job(), dispatch_job(), get_job(), mark_job_completed(), mark_job_failed(), mark_job_running() (+21 more)

### Community 21 - "Command Palette & App Shell"
Cohesion: 0.08
Nodes (26): WorkflowPage(), ErrorBoundary, AppShell(), Action, ADD_NODE_EVENT, CommandPalette(), emitAddNode(), EXPORT_TRACE_EVENT (+18 more)

### Community 22 - "Run Deck"
Cohesion: 0.14
Nodes (32): guardrailVariant(), NodeOutputPeek(), NodeOutputPeekProps, asRecord(), eventClass(), EventGlyph(), eventLabel(), eventStatus() (+24 more)

### Community 23 - "Approvals & Code Sandbox"
Cohesion: 0.12
Nodes (28): clear_approval_state(), HumanApprovalTimeout, Any, Exception, Human-in-the-loop approval for paused workflow runs (Lyzr SuperFlow)., submit_approval(), wait_for_approval(), _execute_code() (+20 more)

### Community 24 - "Node Handlers"
Cohesion: 0.11
Nodes (30): HumanApprovalDenied, _ensure_memory_bucket(), filter_executable_graph(), _load_credential(), _load_workflow_kb_documents(), _make_code_fn(), _make_delay_fn(), _make_filter_fn() (+22 more)

### Community 25 - "Run Event Broker"
Cohesion: 0.14
Nodes (28): _enqueue_event(), execute_run(), _extract_text_parts(), _extract_token_usage(), _json_default(), _normalize_text_part(), _put_run_event(), Any (+20 more)

### Community 26 - "Canvas Node Components"
Cohesion: 0.13
Nodes (22): NodePaletteProps, BaseNode, BORDER_BY_STATE, ExtendedNodeData, formatTokens(), NodeChip(), NodeChipRow(), NodeRuntimeState (+14 more)

### Community 27 - "Guardrail Policies API"
Cohesion: 0.12
Nodes (29): create_policy(), delete_policy(), enrich_graph_guardrail_policies(), _get_policy(), list_policies(), list_templates(), PolicyCreate, PolicyUpdate (+21 more)

### Community 28 - "Run-From-Here Authoring"
Cohesion: 0.11
Nodes (29): Attach authoring-only pin/run-from-here params to a pending run., register_authoring_overrides(), _ancestors(), _node_data(), _node_type(), prune_graph_for_start(), Any, ValueError (+21 more)

### Community 29 - "Datasets API"
Cohesion: 0.20
Nodes (27): add_item(), add_run_input(), capture_runs(), create_dataset(), DatasetCapture, DatasetCreate, DatasetImport, DatasetItemCreate (+19 more)

### Community 30 - "Platform Ingest & Invoke"
Cohesion: 0.15
Nodes (25): get_deploy_descriptor(), get_published(), ingest_run(), IngestNodeEvent, IngestRunPayload, invoke_workflow(), InvokePayload, list_audit() (+17 more)

### Community 31 - "Run & Dataset Models"
Cohesion: 0.14
Nodes (24): Workflow, WorkflowRun, WorkflowVersion, _cleanup(), Bulk capture of production runs into a golden dataset. Covers the filter modes…, _seed(), test_capture_failed_then_dedups(), test_capture_low_eval() (+16 more)

### Community 32 - "Frontend TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 33 - "AgentOps Plan (docs)"
Cohesion: 0.09
Nodes (26): LLM-call traces (llm_calls table, gen_ai.* spans), North star loop Build to Run to Trust, Phase 1 Truthful runtime, Phase 2 Evals that catch regressions, Phase 4 Observability you can operate on, Phase 5 Platform (harness for any agent), Version regression gate (candidate vs current on dataset), Token and cost accounting via ADK plugin (+18 more)

### Community 34 - "Version Diff & Sidebar"
Cohesion: 0.12
Nodes (23): CanvasSidebar(), CanvasSidebarProps, RunComparison, SidebarTab, TabPanelFade(), tabs, VersionHistory, WorkflowDataPanel (+15 more)

### Community 35 - "Database Models"
Cohesion: 0.12
Nodes (20): Base, AlertEvent, AuditLog, Credential, Experiment, Feedback, JSONType, LlmCall (+12 more)

### Community 36 - "Motion Primitives"
Cohesion: 0.16
Nodes (16): registry, StaggerRecord, useEntryStagger(), HoverLift(), Props, NumberTween(), Props, PageEnter() (+8 more)

### Community 37 - "Node Registry & Quick-Add"
Cohesion: 0.13
Nodes (20): GraphContext, QuickAddMenu(), resolveSuggestion(), NodeSuggestion, accent, EXPRESSION_HINT, getNodeDefinition(), NODE_CATEGORIES (+12 more)

### Community 38 - "Config, Deps & Feedback"
Cohesion: 0.13
Nodes (20): alias, create_feedback(), FeedbackCreate, list_run_feedback(), BaseModel, get, post, Session (+12 more)

### Community 39 - "Eval Presets API"
Cohesion: 0.18
Nodes (22): _as_list_item(), create_eval_preset(), delete_eval_preset(), list_eval_presets(), preview_eval_preset(), delete, get, patch (+14 more)

### Community 40 - "Alerts & Anomaly Detection"
Cohesion: 0.19
Nodes (22): AlertRule, Threshold rule evaluated by the scheduler tick., _breached(), evaluate_alert_rules(), _metric_over_window(), _metric_value(), _percentile(), AlertRule (+14 more)

### Community 41 - "Workflow Context"
Cohesion: 0.12
Nodes (12): Any, Mutable workflow context passed through node execution., Accumulates run input and per-step outputs for expression mapping., Snapshot safe for metrics/SSE — excludes workflow memory., WorkflowContext, test_batch_last_scheduled_run_at_empty(), test_build_summary_fetches_runs_once(), test_workflow_context_snapshot_truncates_large_outputs() (+4 more)

### Community 42 - "Header Actions & Menus"
Cohesion: 0.11
Nodes (17): HeaderActions(), ShortcutsHelp(), startCanvasTour(), DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel() (+9 more)

### Community 43 - "App Entrypoint & Middleware"
Cohesion: 0.13
Nodes (21): health(), _health_db_counts(), lifespan(), Exception, FastAPI, get, Request, rate_limit_middleware() (+13 more)

### Community 44 - "Assist MVP2 Tests"
Cohesion: 0.21
Nodes (22): _EditGraphDraft, GenEdge, _GeneratedSchemaDraft, GenNode, Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)., Gemini structured-output shape. schema_object_json is a JSON-encoded string…, A node as returned by Gemini structured output., _current_graph() (+14 more)

### Community 45 - "Guardrail Engine"
Cohesion: 0.19
Nodes (18): _parse_guardrail_status(), GuardrailResult, LlmGuardrailVerdict, ModerationVerdict, PromptInjectionVerdict, BaseModel, Dedicated toxicity/moderation rail — structured category scoring via Gemini., validate_content_llm() (+10 more)

### Community 46 - "App Rail & Toolbar"
Cohesion: 0.14
Nodes (16): CANVAS_RAIL_ITEMS, CanvasRail(), CanvasRailItem, CanvasRailProps, CanvasRailTab, CanvasToolbar(), ToolbarButton(), AppRail() (+8 more)

### Community 47 - "Guardrail Playground UI"
Cohesion: 0.18
Nodes (18): policyPresets, PolicyTemplates(), PolicyTemplatesProps, ruleSummary(), toConfig(), PLAYGROUND_GUARDRAIL_TYPES, PlaygroundConfig, SavedPolicies() (+10 more)

### Community 48 - "Experiments API & Async Tasks"
Cohesion: 0.19
Nodes (20): _check_version(), create_experiment(), experiment_gate(), ExperimentCreate, get_experiment(), list_experiments(), BaseModel, get (+12 more)

### Community 49 - "HTTP Client & Search"
Cohesion: 0.17
Nodes (17): get_http_client(), AsyncClient, shutdown_http_client(), startup_http_client(), run_search(), search_duckduckgo(), search_exa(), init_http_client() (+9 more)

### Community 50 - "Startup & Migration Gate"
Cohesion: 0.14
Nodes (19): _alembic_head_revisions(), check_database(), check_migrations_current(), _current_db_revisions(), MigrationsBehindError, Mark orphaned running jobs as failed after a crash or deploy., Raised when the database is behind the latest Alembic revision., Resolve the current Alembic head revision(s) from alembic/versions. (+11 more)

### Community 51 - "shadcn/Tailwind Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 52 - "Rate Limiting & Resilience"
Cohesion: 0.16
Nodes (19): _resolve_api_token(), check_rate_limit(), _client_key(), _limit_setting_for(), _prune_stale_buckets(), Request, rate_limited_path(), In-memory, per-endpoint rate limiting keyed by user (falling back to key/IP).… (+11 more)

### Community 53 - "Assist Tests"
Cohesion: 0.24
Nodes (20): GeneratedWorkflowDraft, SuggestionsDraft, _invalid_draft(), _mock_response(), patch, WorkflowRun, _seed_run(), _suggest_graph() (+12 more)

### Community 54 - "Deterministic Eval"
Cohesion: 0.21
Nodes (18): evaluate_embedding_similarity(), evaluate_exact(), evaluate_json_schema(), evaluate_numeric(), evaluate_regex(), evaluate_substring(), Any, Fast deterministic evaluation strategies (exact, substring, regex, embedding). (+10 more)

### Community 55 - "Expressions & Templating"
Cohesion: 0.18
Nodes (19): _coerce_number(), evaluate_condition(), Any, Template expression rendering for workflow context (n8n-style mapping)., Evaluate a structured IF condition (n8n-style, expression operands)., Replace ``{{path}}`` placeholders using workflow context., _render_operand(), render_template() (+11 more)

### Community 56 - "Guardrail Fail Behavior"
Cohesion: 0.19
Nodes (18): apply_fail_behavior(), GuardrailBlockedError, Any, Exception, Parse a length bound; None (or unparseable) means the bound is unset., LLM cleanup pass: remove the violating material, keep the substance., redact_pii(), _rewrite_content() (+10 more)

### Community 57 - "OTel Tracing"
Cohesion: 0.16
Nodes (15): get_trace_id(), init_tracing(), NodeSpanTracker, _parse_headers(), OpenTelemetry tracing for workflow execution and HTTP requests., Tracks in-flight ADK node spans for a single workflow run., Attach OTel gen_ai semantic-convention attributes to a node span., _should_sample() (+7 more)

### Community 58 - "Budget Enforcement"
Cohesion: 0.16
Nodes (18): check_workflow_budget(), Session, Workflow, Per-workflow budget enforcement: cost/day, runs/hour, tokens/run. Budgets live…, Return a breach reason, or None when the run may proceed., tokens_per_run_limit(), db_session(), _mk_workflow() (+10 more)

### Community 59 - "Eval Judge & Preview"
Cohesion: 0.15
Nodes (13): compute_aggregate_score(), EvalScores, preview_eval(), Any, Live rubric preview — run the LLM judge on a sample input/output. Powers the…, Score a sample with the given rubric. Returns the per-dimension scores + the…, BaseModel, scores_delta() (+5 more)

### Community 60 - "Model Reference Resolver"
Cohesion: 0.18
Nodes (17): available_models(), _coerce(), default_ref(), ModelRef, Pluggable model-selection seam for evaluation judges and guardrail classifiers.…, Models the UI may offer today (Gemini-only). Grows with multi-provider., Resolve an override to a concrete model string, defaulting to Gemini. Non-…, Model for an LLM-as-judge eval. Reads an optional preset['judge_model']. (+9 more)

### Community 61 - "Integration Nodes"
Cohesion: 0.21
Nodes (18): _parameterize_query(), _pg_engine(), _post_integration_webhook(), Any, Integration node handlers — Slack, Email, Postgres (n8n-style)., Return an error message when the recipient is invalid; None if acceptable., run_discord_integration(), run_email_integration() (+10 more)

### Community 62 - "App Providers & Layout"
Cohesion: 0.12
Nodes (15): metadata, plexMono, plexSans, Toaster, viewport, MotionProvider(), TooltipProvider(), isTerminalObservabilityEvent() (+7 more)

### Community 63 - "Credential Encryption"
Cohesion: 0.19
Nodes (17): _coerce_config(), downgrade(), Encrypt existing plaintext credential secret values at rest (Fernet).…, config may come back as dict (PG JSONB) or str (SQLite JSON)., _rewrite(), _secret_keys(), upgrade(), decrypt_value() (+9 more)

### Community 64 - "Run Worker & Logging"
Cohesion: 0.17
Nodes (15): configure_logging(), StructuredFormatter, active_run_count(), claim_pending_runs(), UUID, Dedicated worker loop for pending workflow runs., start_run_worker(), stop_run_worker() (+7 more)

### Community 65 - "Run Replay & Progress"
Cohesion: 0.16
Nodes (16): PostRunTransport(), PostRunTransportProps, RunProgressStrip(), RunProgressStripProps, useElapsedSeconds(), deriveState(), isCompletedStatus(), isFailedStatus() (+8 more)

### Community 66 - "Alerts API"
Cohesion: 0.22
Nodes (17): AlertRuleCreate, AlertRuleUpdate, create_rule(), delete_rule(), list_events(), list_rules(), AlertRule, BaseModel (+9 more)

### Community 67 - "DB Session & Rollup Backfill"
Cohesion: 0.15
Nodes (14): job_status(), get, Session, UUID, Background job status API., get_db(), backfill_rollups_for_user(), Session (+6 more)

### Community 68 - "Schedule Worker & Cron"
Cohesion: 0.20
Nodes (17): _claim_schedule_fire(), _create_scheduled_run_row(), cron_matches_now(), _evaluate_alerts(), _maybe_run_retention(), Any, datetime, UUID (+9 more)

### Community 69 - "Quality Alerts & Webhooks"
Cohesion: 0.18
Nodes (15): Any, UUID, Workflow, WorkflowRun, quality_webhook_for_run(), Dispatch workflow webhooks for quality events (eval fail, guardrail block)., schedule_quality_webhook(), WorkflowRun (+7 more)

### Community 70 - "Frontend Dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, lucide-react, @next/bundle-analyzer, radix-ui (+9 more)

### Community 71 - "Frontend Dev Dependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, postcss, tailwindcss, @types/node (+9 more)

### Community 72 - "Eval Preset Service"
Cohesion: 0.33
Nodes (15): EvaluationPreset, build_eval_instruction(), _batch_load_custom_presets(), builtin_preset_rows(), enrich_graph_eval_presets(), get_preset_config(), list_all_presets(), list_user_presets() (+7 more)

### Community 73 - "Structured-Output Guardrail"
Cohesion: 0.18
Nodes (15): _parse_schema(), Parse ``text`` as JSON and validate it against ``schema``. Pure — no LLM.…, Ask the model to coerce ``text`` into JSON matching ``schema``. Returns the…, Enforce a JSON schema on output; on failure, re-ask the model to repair it…, _repair_to_schema(), validate_against_schema(), validate_structured_output(), Structured-output guardrail: JSON-schema validation + bounded re-ask. The re-… (+7 more)

### Community 74 - "Token Tracker Plugin"
Cohesion: 0.21
Nodes (9): estimate_cost_usd(), Any, BasePlugin, Per-run token and cost accounting via ADK plugin callbacks. ADK 2.x's workflow…, Accumulates LLM token usage per ADK agent name for a single run., Flatten genai contents/parts into readable prompt text., Per-agent usage rows with cost estimates attached., TokenTrackerPlugin (+1 more)

### Community 75 - "Credentials API"
Cohesion: 0.28
Nodes (13): create_credential(), delete_credential(), list_credentials(), delete, get, post, Session, UUID (+5 more)

### Community 76 - "Templates & Graph Defaults"
Cohesion: 0.18
Nodes (8): Helpers for standard Trigger → … → End workflow graphs., Prepend Trigger and append End, wiring entry/exit automatically. When…, wrap_graph_with_trigger_end(), Workflow, Tests for MVP2 template publishing + provenance endpoints., _seed_workflow(), test_create_template_then_appears_in_list(), test_use_persisted_template_increments_usage_and_returns_graph()

### Community 77 - "RAG Metrics"
Cohesion: 0.20
Nodes (11): Any, BaseModel, rag_aggregate(), RagScores, RAG-specific evaluation scorers. Standard RAG quality dimensions an LLM judge…, Mean of the three RAG dimensions (1-5), rounded., Score a RAG triple. Returns per-dimension scores + aggregate, or a skip/error…, score_rag() (+3 more)

### Community 78 - "Trace Plugin"
Cohesion: 0.27
Nodes (7): Any, BasePlugin, Exception, Per-run tool-call capture via ADK plugin callbacks (Trust-layer trace tree).…, Accumulates tool-call spans (name/args/result/timing) per ADK agent., _summarize(), TracePlugin

### Community 79 - "Architecture (docs)"
Cohesion: 0.14
Nodes (15): Workflow compilation to ADK Workflow, Executor + in-memory SSE run event broker, Execution modes: inline vs worker (single-process constraint), Graph DAG validation (Trigger to End, acyclic), Node type system (28 types, 6 categories, spans both apps), Run pipeline (validation, compilation, execution), Durable execution / run resilience (P1.3), ADK-native graph execution (branching, fan-out JoinNode) (+7 more)

### Community 80 - "Onboarding & First Run"
Cohesion: 0.30
Nodes (11): FirstRunHero(), GettingStartedBanner(), GettingStartedBannerProps, createWorkflowFromTemplate(), dismissOnboarding(), isOnboardingDismissed(), OnboardingKey, OnboardingState (+3 more)

### Community 81 - "Credential Resolution"
Cohesion: 0.20
Nodes (13): decrypt_credential_config(), encrypt_credential_config(), get_user_credential(), Any, Session, UUID, Named credential resolution for integration nodes., Encrypt SECRET_KEYS values on the write path (idempotent; degrades to… (+5 more)

### Community 82 - "Observability SSE Events"
Cohesion: 0.27
Nodes (11): broadcast_observability_event(), Any, Queue, User-scoped SSE fan-out for live observability updates., stream_observability_events(), subscribe_observability(), unsubscribe_observability(), test_observability_broadcast_drops_full_queues() (+3 more)

### Community 83 - "Auth & API Keys (frontend)"
Cohesion: 0.26
Nodes (13): SettingsPage(), request(), ApiKeyAuditAction, ApiKeyAuditEntry, appendAuditEntry(), authHeaders(), clearApiKey(), getApiKey() (+5 more)

### Community 84 - "Theme Provider"
Cohesion: 0.26
Nodes (11): Toaster(), applyTheme(), getStoredTheme(), persistTheme(), Theme, THEME_STORAGE_KEY, readDomTheme(), ThemeContext (+3 more)

### Community 85 - "Eval Runner"
Cohesion: 0.26
Nodes (11): _build_eval_prompt(), evaluate_content_async(), _evaluate_content_sync(), evaluate_node_async(), Any, Parallel and deferred evaluation execution (LLM + deterministic)., Evaluate multiple nodes concurrently. Returns (node_id, scores, error)., Judge the content as a response to the original request when we have it —… (+3 more)

### Community 86 - "MVP2 Foundation Tests"
Cohesion: 0.21
Nodes (5): _make_workflow(), Tests for MVP2 backend foundation: timeline, deploy, dashboards, crypto, cost…, test_cost_alert_rule_is_supported(), test_deploy_descriptor_after_publish_includes_mcp_tool(), test_deploy_descriptor_requires_published_version()

### Community 87 - "Sandbox Safety Visitor"
Cohesion: 0.18
Nodes (6): Attribute, _SafetyVisitor, Call, Import, ImportFrom, Name

### Community 88 - "Moderation Guardrail"
Cohesion: 0.27
Nodes (9): _evaluate_moderation_scores(), Map category scores + thresholds to a verdict. Pure and side-effect-free so it…, Trust-layer Phase 3: moderation/toxicity guardrail rail. Covers the pure…, test_above_default_threshold_flags(), test_below_threshold_passes(), test_custom_single_threshold(), test_malformed_scores_do_not_crash(), test_per_category_thresholds_override_default() (+1 more)

### Community 89 - "Presidio PII Detection"
Cohesion: 0.31
Nodes (10): _analyzer_available(), _default_entities(), detect_pii_presidio(), _get_analyzer(), Any, Optional Microsoft Presidio integration for entity-based PII detection., redact_pii_presidio(), test_presidio_passes_clean_text_when_disabled() (+2 more)

### Community 90 - "Frontend Package Manifest"
Cohesion: 0.18
Nodes (10): name, private, scripts, analyze, build, dev, lint, start (+2 more)

### Community 91 - "Deploy Descriptor & MCP Schema"
Cohesion: 0.33
Nodes (9): build_deploy_descriptor(), build_mcp_input_schema(), find_input_schema_fields(), _node_type(), Any, Build a deploy descriptor (invoke URL, cURL, MCP tool) for a published…, Return the first input_schema node's ``inputFields`` (or [])., Derive a JSON Schema object for the MCP tool's input. Uses the workflow's… (+1 more)

### Community 92 - "Experiment Runner"
Cohesion: 0.44
Nodes (9): _aggregate(), Any, UUID, Batch experiments: run a dataset against workflow version(s), score, compare.…, run_experiment(), _run_one_item(), _run_version_over_items(), _session() (+1 more)

### Community 93 - "Phase 4 Tests"
Cohesion: 0.24
Nodes (9): clear_pg_engine_for_url(), Dispose and evict a cached Postgres engine (e.g. after credential delete)., In-memory dedup helper (tests); production uses DB-backed last_fired_at., should_fire_schedule(), asyncio, test_clear_pg_engine_for_url_evicts_cached_engine(), test_mask_credential_config_hides_secrets(), test_should_fire_schedule_dedupes_same_minute() (+1 more)

### Community 94 - "Run Input Hook"
Cohesion: 0.29
Nodes (9): RunControlProps, coerce(), deriveFields(), normalizeField(), readStored(), RunField, StoredInput, useRunInput() (+1 more)

### Community 95 - "Highlighted Sample & PII UI"
Cohesion: 0.33
Nodes (9): escapeRegExp(), findKeywordMatches(), findPiiMatches(), HighlightedSample(), HighlightedSampleProps, MatchSpan, mergeSpans(), PII_PATTERNS (+1 more)

### Community 96 - "Canvas Tour"
Cohesion: 0.38
Nodes (8): CanvasTour(), computePosition(), findVisibleAnchor(), Position, resolveStepIndex(), warnDev(), CANVAS_TOUR_STEPS, TourStep

### Community 97 - "Eval-Threshold Tests"
Cohesion: 0.25
Nodes (7): apply_eval_threshold(), Return run-level eval_passed when thresholds are configured., test_aggregate_quality_metrics_from_runs(), test_apply_eval_threshold_pass_and_fail(), test_validate_blocked_patterns(), test_validate_min_length(), test_validate_required_keywords()

### Community 98 - "Experiment Gate Tests"
Cohesion: 0.39
Nodes (7): Trust-layer Phase 2: GET /api/experiments/{id}/gate CI regression gate. Wraps a…, _seed_experiment(), test_gate_failed_regression_and_strict_409(), test_gate_not_applicable_for_batch(), test_gate_passed_regression(), test_gate_pending_while_running(), _verdict()

### Community 99 - "_run_single_node_variant"
Cohesion: 0.29
Nodes (7): Wrap a single node between a trigger and end for single-node execution., Execute one variant as a single-node LLM run, capturing telemetry. Reuses the…, _run_single_node_variant(), _single_node_graph(), _extract_text_from_event(), _resolve_node_id(), CompareVariantResult

### Community 100 - "test_routing_adk2.py"
Cohesion: 0.48
Nodes (6): _branch_graph(), Regression: conditional routing must work under ADK 2.x. ADK 2.x routes…, _run_graph(), test_if_decision_is_not_leaked_as_output(), test_if_routes_correct_branch(), parametrize

### Community 101 - "CanvasContextMenu.tsx"
Cohesion: 0.48
Nodes (6): buildNodeRunMenuItems(), CanvasContextMenu(), CanvasContextMenuProps, ContextMenuItem, firstEnabledIndex(), isSeparator()

### Community 102 - "012_run_spans_tags_sessions.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 103 - "013_alert_baseline_comparison.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 104 - "scheduler_status"
Cohesion: 0.47
Nodes (4): count_scheduled_workflows(), scheduler_status(), test_count_scheduled_workflows(), test_scheduler_status_shape()

### Community 105 - "UX Audit 2026-07-11"
Cohesion: 0.33
Nodes (6): Copper as dedicated active semantic token (not blanket warning), Obsidian + Oxide Copper palette (Canvas Run Lens), Aegis Frontend UI/UX Audit 2026-07-11, Mobile canvas layout-lock mode, text-2xs Tailwind token consolidation, Chroma-reserved design language (warm near-black, bone, monochrome)

### Community 106 - "Evaluation rigor: online evals +"
Cohesion: 0.40
Nodes (6): Evaluation rigor: online evals + CI gates (P1.2), Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5), P0: misleading eval chroma (1-5 scores banded on 0-1), User-defined eval presets & weighting (EvaluationPreset model), Deterministic evaluators (exact/substring, regex, embedding similarity), OpenTelemetry tracing export (Jaeger/LangFuse/Datadog)

### Community 107 - "Glass & glow visual language"
Cohesion: 0.33
Nodes (6): Motion primitives (PageEnter, StaggerList, HoverLift, NumberTween, useGlowPulse), Reduced-motion gating (useReducedMotionStrict), Design token system (CSS variables + Tailwind config), Glass & glow visual language, Design-system quality bar (instrument aesthetic, chroma for data only), Hardcoded white sheen vs --surface-highlight token (light theme loses lift)

### Community 108 - "node_registry.py"
Cohesion: 0.50
Nodes (4): get_node_meta(), NodeTypeMeta, Canonical node type metadata for the agentic workflow builder., TypedDict

### Community 109 - "IP validation)"
Cohesion: 0.40
Nodes (5): Code Node sandbox breakout via json.codecs traversal, DNS rebinding SSRF (TOCTOU) in HTTP Node, Postgres integration SSRF (no URL/IP validation), Read-only regex bypass via CTE (WITH ... DELETE), SMTP integration blocks the event loop

### Community 110 - "009_agentops_tables_backfill.py"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 111 - "011_workflow_templates.py"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 112 - "extends"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 122 - "Data model (24 SQLAlchemy tables"
Cohesion: 0.67
Nodes (3): Alembic schema ownership + startup head gate, Backend layering (routers, schemas, services, models), Data model (24 SQLAlchemy tables, workflow to version to run)

### Community 123 - " multi-provider support (P0.1)"
Cohesion: 0.67
Nodes (3): Gemini-only runtime constraint, Multi-model / multi-provider support (P0.1), Provider abstraction (LiteLLM-style shim)

### Community 124 - "PII, block vs warn)"
Cohesion: 0.67
Nodes (3): Guardrail engine (blocklist/regex/PII, block vs warn), Advanced PII (Microsoft Presidio) + prompt injection shield, Guardrail graceful fallbacks & PII masking/redaction

### Community 125 - "Tailwind v4 syntax dead in v3 bu"
Cohesion: 0.67
Nodes (3): shadcn/ui primitive migration (Radix-backed), P0: dead focus ring (Tailwind v4 ring-3 in v3 build), Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)

## Knowledge Gaps
- **329 isolated node(s):** `next/core-web-vitals`, `next/typescript`, `$schema`, `style`, `rsc` (+324 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Shared UI Primitives` to `Canvas Tour`, `Version Diff & Sidebar`, `API Client & Types`, `Settings & Eval UI`, `CanvasContextMenu.tsx`, `Run Detail & Trace UI`, `Experiments & Quality UI`, `Header Actions & Menus`, `Workflow Canvas Core`, `Observability Dashboard UI`, `App Rail & Toolbar`, `Node Palette & Categories`, `Guardrail Playground UI`, `Cost & Trust Dashboards`, `Auth & API Keys (frontend)`, `Run Deck`, `Canvas Node Components`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Frontend Dependencies` to `cmdk`, `framer-motion`, `geist`, `next`, `react`, `react-dom`, `tailwind-merge`, `tailwindcss-animate`, `react-query`, `Frontend Package Manifest`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `Experiments & Quality UI`, `Shared UI Primitives`, `Header Actions & Menus`, `Frontend Dependencies`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `next/core-web-vitals`, `next/typescript`, `$schema` to the rest of the system?**
  _329 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Workflows API` be split into smaller, more focused modules?**
  _Cohesion score 0.050413223140495865 - nodes in this community are weakly interconnected._
- **Should `Shared UI Primitives` be split into smaller, more focused modules?**
  _Cohesion score 0.036657681940700806 - nodes in this community are weakly interconnected._
- **Should `Observability Service` be split into smaller, more focused modules?**
  _Cohesion score 0.05643513789581205 - nodes in this community are weakly interconnected._