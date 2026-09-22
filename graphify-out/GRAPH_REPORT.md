# Graph Report - .  (2026-09-23)

## Corpus Check
- 442 files · ~446,383 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3505 nodes · 9163 edges · 211 communities (155 shown, 56 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Meta & Ops API
- Observability API
- Node Inspector UI
- Homepage & Templates UI
- Canvas Edges & Palette
- Canvas Chrome
- Embeddings & Eval
- Alerts API
- Run Detail UI
- Credential Encryption Migration
- Workflow Compiler
- Settings & Panels UI
- App Config & Logging
- Workflow Canvas Page
- Guardrail Policies API
- Edge Inspector & Nodes
- App Pages & Errors
- Compiler Core
- Jobs API & DB
- CI & Project Docs
- Runs API
- Integrations & Sub-workflows
- Guardrails & Describe UI
- DB Models & Migrations
- Assist API
- Command Palette
- Assist Schemas
- Workflow Models & Tests
- Guardrail Policy Plugin
- Run Executor
- Onboarding UI
- Guardrail Service
- Observability UI
- Code Sandbox
- Platform API
- Startup Checks
- Run Deck UI
- Executor Event Streaming
- Guardrail Fail Behavior
- Run Authoring
- Datasets API
- Async Tasks
- Node Test Service
- Guardrail Playground UI
- Feedback API
- Frontend TS Config
- Graph Defaults & Templates
- Tracing & Logging
- Assist Draft Schemas
- Scheduling & Retention
- Eval Presets API
- Templates API
- Context Wrapper
- Component Aliases
- Canvas Motion
- Assist History Tests
- Integrations Service
- Regex Safety
- Node Test Tests
- Assist MVP2 Tests
- Eval Service
- Expression Evaluator
- Graph Validation
- Model References
- Iteration Node Tests
- Frontend Package Config
- Root Layout & Fonts
- Run Progress UI
- Node Test API
- Split Studio Mockup
- Header & Error Boundary
- Eval Preset Service
- Approval Service
- Frontend Dependencies
- Attention Inbox Mockup
- UI Primitives
- Experiments API
- Guardrail Schema Repair
- Canvas Rail
- HTTP Client & Search
- RAG Metrics
- Token Tracker
- Trace Plugin
- Canvas Sidebar
- Eval Runner
- Workflow Context
- Audit P1 Tests
- Node Test Errors
- Workflow Import
- Expression Preview UI
- Canvas Clipboard
- Moderation Guardrail Tests
- Instrument Table Mockup
- App Rail & Nav
- Theme
- Assist Compare
- Deploy Descriptor
- Experiment Runner
- Quiet Index Mockup
- Master-Detail Mockup
- Run Controls UI
- Guardrail Sample Highlight
- Run Overrides Migration
- Run Filters
- Experiment Gate Tests
- Lab Notebook Mockup
- Node Type System Docs
- Command Home Mockup
- Mission Control Mockup
- System Map Mockup
- Spatial Desk Mockup
- Test Routing Adk2
- Quiet Table Mockup
- Terminal Shell Mockup
- Package
- Canvascontextmenu
- Hooks Use Pinned
- 012 Run Spans Tags
- 013 Alert Baseline
- 014 Workflow Memory
- Kb Cache
- Roadmap Eval Rigor
- Superpowers Plans 2026
- Versiondiffview
- Node Registry
- Snippets
- Workflow
- Agentops Plan
- 009 Agentops Tables
- 011 Workflow
- Eslintrc
- Package
- Tailwind
- Agentops Plan Phase3
- Roadmap
- Superpowers Plans 2026
- Superpowers Specs 2026
- Next
- Ui Audit Issues
- Agentops Plan
- Agentops Plan
- Requirements Otel
- Cmdk
- Deep Audit 2026
- Design Qa
- Roadmap
- Roadmap Rag Depth
- Superpowers
- Superpowers
- Package Dependencies Lucide
- Package Dependencies Radix
- Package Dependencies React
- Package Dependencies React
- Package Dependencies Tailwind
- Postcss
- Vercel
- Issues
- Issues Workflow Schedules
- Agentops Plan
- Requirements
- Design Aegis Header
- 13 Continue Build
- 14 Open Or
- 15 Structure
- 16 Quality
- 17 Start From
- 18 Publish
- 19 Run
- 20 Modules And
- 21 Schedule
- 22 Experiments
- Design Page Mockups 01
- Design Page Mockups 01B Observability
- Design Page Mockups 01C Observability
- Design Page Mockups 01D Observability By
- Design Page Mockups 02
- Design Page Mockups 03
- Superpowers Plans 2026 06 29 Aegis Phase
- Superpowers Plans 2026 06 29 Aegis Phase
- Superpowers Specs 2026 06 29 Aegis Mvp1 
- Superpowers Specs 2026 07 01 Ui Overhaul
- Ui Ux Audit 2026 07 25
- Ui Ux Audit 2026 07 25 Error State
- Ui Ux Audit 2026 07 25 Formatter
- Ui Ux Audit 2026 07 25 Utc Timezone
- Ui Ux Audit 2026 07 25 Window
- Readme Nextjs
- Issues Issue
- Issues Security
- Upgrade Plan Guardrail Telemetry
- Upgrade Plan Parallel
- Upgrade Plan Realtime
- Upgrade Plan

## God Nodes (most connected - your core abstractions)
1. `cn()` - 209 edges
2. `valid_graph()` - 65 edges
3. `validate_workflow_graph()` - 50 edges
4. `compile_workflow()` - 49 edges
5. `Button` - 49 edges
6. `api` - 46 edges
7. `WorkflowCanvasInner()` - 44 edges
8. `_build_adk_node()` - 37 edges
9. `render_template()` - 35 edges
10. `formatRelativeTime()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Author → Harden → Grade → Operate → Ship product loop` --semantically_similar_to--> `North Star: unified 'n8n + LangSmith' Build→Guard→Grade→Operate platform`  [INFERRED] [semantically similar]
  README.md → FUTURE_PLAN.md
- `Evaluation rigor: online evals + CI gates (P1.2)` --semantically_similar_to--> `Deterministic evaluators (exact/substring, regex, embedding similarity)`  [INFERRED] [semantically similar]
  docs/ROADMAP.md → upgrade_plan.md
- `Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5)` --semantically_similar_to--> `Deterministic evaluators (exact/substring, regex, embedding similarity)`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-06-29-aegis-phase-2-plan.md → upgrade_plan.md
- `Advanced PII (Microsoft Presidio) + prompt injection shield` --semantically_similar_to--> `Guardrail engine (blocklist/regex/PII, block vs warn)`  [INFERRED] [semantically similar]
  upgrade_plan.md → docs/superpowers/plans/2026-06-29-aegis-phase-2-plan.md
- `Aegis — visual agent-workflow workbench` --semantically_similar_to--> `System overview: Next.js UI → typed client → FastAPI → ADK/Gemini → Postgres`  [INFERRED] [semantically similar]
  CLAUDE.md → docs/architecture.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **AgentOps platform roadmap phases** — agentops_plan_phase1, agentops_plan_phase2, agentops_plan_phase3, agentops_plan_phase4, agentops_plan_phase5 [EXTRACTED 1.00]
- **Server-side untrusted-input execution/exfiltration cluster** — isses_code_sandbox_breakout, isses_dns_rebinding_ssrf, isses_postgres_ssrf [INFERRED 0.75]
- **Three P0 audit findings (broken/misleading/inaccessible)** — docs_ui_ux_audit_2026_07_25_dead_focus_ring, docs_ui_ux_audit_2026_07_25_eval_chroma_bug, docs_ui_ux_audit_2026_07_25_utc_timezone_bug [EXTRACTED 1.00]
- **Aegis roadmap priority feature gaps** — docs_roadmap_multi_model_support, docs_roadmap_bidirectional_mcp, docs_roadmap_rag_depth, docs_roadmap_eval_rigor, docs_roadmap_durable_execution [EXTRACTED 1.00]
- **Aegis 2026 Audit Cycle** — deep_audit_2026_08_07 [EXTRACTED 0.90]
- **Glass & glow UI overhaul system** — docs_superpowers_specs_2026_07_01_ui_overhaul_design_glass_and_glow, docs_superpowers_specs_2026_07_01_ui_overhaul_design_design_tokens, docs_superpowers_specs_2026_07_01_ui_overhaul_design_shadcn_migration, docs_superpowers_specs_2026_07_01_ui_overhaul_design_canvas_reskin, docs_superpowers_plans_2026_07_01_ui_overhaul_motion_primitives [EXTRACTED 1.00]
- **Three P0 audit findings (broken/misleading/inaccessible)** — docs_ui_ux_audit_2026_07_25_dead_focus_ring, docs_ui_ux_audit_2026_07_25_eval_chroma_bug, docs_ui_ux_audit_2026_07_25_utc_timezone_bug [EXTRACTED 1.00]
- **Run pipeline: validate → compile → execute** — claude_graph_validation, claude_compiler, claude_executor [EXTRACTED 1.00]
- **Node type change sync set spanning backend and frontend** — claude_node_registry, claude_node_handlers, claude_compiler, claude_graph_validation, claude_workflow_ts, claude_node_registry_ts, claude_canvas_nodes [EXTRACTED 1.00]
- **Fresh Postgres provisioning requires pgvector image for CREATE EXTENSION vector** — _github_workflows_ci_migrations_postgres, docker_compose_postgres, backend_requirements_sqlalchemy_alembic [EXTRACTED 1.00]
- **Failed-run triage flow (View Failed Runs entry point surfaces same failures shown in Needs Attention rail, flagged via FAILED status color)** — docs_design_homepage_mockups_01_command_home_quick_actions, docs_design_homepage_mockups_01_command_home_needs_attention, docs_design_homepage_mockups_01_command_home_status_badges [INFERRED 0.85]
- **Mission Control page composition (nav + KPI strip + table + activity rail)** — docs_design_homepage_mockups_03_mission_control_top_nav, docs_design_homepage_mockups_03_mission_control_kpi_strip, docs_design_homepage_mockups_03_mission_control_workflow_table, docs_design_homepage_mockups_03_mission_control_live_activity_feed [EXTRACTED 1.00]
- **Color reserved for status/data encoding against monochrome chrome** — docs_design_homepage_mockups_04_instrument_table_status_pill_system, docs_design_homepage_mockups_04_instrument_table_version_hash_chips, docs_design_homepage_mockups_04_instrument_table_design_language [INFERRED 0.85]
- **Shared bone/monochrome chrome vocabulary on warm near-black surface** — docs_design_homepage_mockups_05_directory_quiet_index_top_nav, docs_design_homepage_mockups_05_directory_quiet_index_page_header, docs_design_homepage_mockups_05_directory_quiet_index_search_input, docs_design_homepage_mockups_05_directory_quiet_index_workflow_table [INFERRED 0.85]
- **Shared bone/monochrome chrome across Aegis workbench surfaces** — docs_design_homepage_mockups_06_quiet_table_mockup, docs_design_homepage_mockups_06_quiet_table_top_nav, docs_design_homepage_mockups_06_quiet_table_workflows_table [INFERRED 0.85]
- **Warm near-black monochrome chrome shared across all surfaces** — docs_design_homepage_mockups_07_master_detail_mockup, docs_design_homepage_mockups_07_master_detail_workflow_list_sidebar, docs_design_homepage_mockups_07_master_detail_detail_pane, docs_design_homepage_mockups_07_master_detail_warm_near_black_palette [EXTRACTED 1.00]
- **** — docs_design_homepage_mockups_08_system_map_mockup, docs_design_homepage_mockups_08_system_map_workflows_map_view, docs_design_homepage_mockups_08_system_map_monochrome_chrome [INFERRED 0.85]
- **Shared lab-notebook aesthetic: aged paper, ruler timeline, handwritten red marginalia on near-black panel** — docs_design_homepage_mockups_10_lab_notebook, docs_design_homepage_mockups_10_lab_notebook_timeline_rail, docs_design_homepage_mockups_10_lab_notebook_marginalia, docs_design_homepage_mockups_10_lab_notebook_design_language [INFERRED 0.85]
- **Spatial desk metaphor: workflows as physical pinned artifacts on a dark gridded desk surface** — docs_design_homepage_mockups_11_spatial_desk_workflow_cards, docs_design_homepage_mockups_11_spatial_desk_pin_slots, docs_design_homepage_mockups_11_spatial_desk_desk_metaphor, docs_design_homepage_mockups_11_spatial_desk_dark_grid_surface [INFERRED 0.85]

## Communities (211 total, 56 thin omitted)

### Community 0 - "Meta & Ops API"
Cohesion: 0.05
Nodes (105): list_node_types(), ops_config(), preview_cron(), preview_guardrail(), get, post, UUID, Read-only operational knobs (env-driven) for the Settings page. (+97 more)

### Community 1 - "Observability API"
Cohesion: 0.05
Nodes (85): observability_costs(), observability_dashboards(), observability_errors(), observability_overview(), observability_quality(), observability_runs(), observability_summary(), observability_trust() (+77 more)

### Community 2 - "Node Inspector UI"
Cohesion: 0.03
Nodes (75): ExpressionTextarea, ExpressionTextareaProps, Segment, argBest(), buildCompareConfig(), charDiff(), CommentsSection(), COMPARE_ELIGIBLE (+67 more)

### Community 3 - "Homepage & Templates UI"
Cohesion: 0.07
Nodes (64): buildContinueItems(), HomePage(), TemplateCardProps, HomeOverviewStrip(), NextActionsPanel(), PinnedContinuePanels(), WorkflowRow(), EMPTY_HINTS (+56 more)

### Community 4 - "Canvas Edges & Palette"
Cohesion: 0.05
Nodes (64): EdgeData, GradientEdgeImpl(), ALL_CATS, NodePalette(), NodePaletteProps, BaseNode, BORDER_BY_STATE, ExtendedNodeData (+56 more)

### Community 5 - "Canvas Chrome"
Cohesion: 0.04
Nodes (60): CanvasStatusBar(), TONE_CLASSES, CodeBlock(), DeploySheet(), DeploySheetBody(), DeployTab, isNoPublishedVersion(), WorkflowNameEditor() (+52 more)

### Community 6 - "Embeddings & Eval"
Cohesion: 0.06
Nodes (66): cosine_similarity_vectors(), embed_text(), _hashing_vector(), Any, Text embeddings for vector RAG (Gemini with TF-IDF fallback)., retrieve_by_embedding(), evaluate_embedding_similarity(), evaluate_exact() (+58 more)

### Community 7 - "Alerts API"
Cohesion: 0.06
Nodes (67): AlertRuleCreate, AlertRuleUpdate, create_rule(), delete_rule(), list_events(), list_rules(), AlertRule, BaseModel (+59 more)

### Community 8 - "Run Detail UI"
Cohesion: 0.06
Nodes (56): allUpstream(), directPredecessors(), NodeDataSection(), NodeEvidence, NodeLiveResult, oneLine(), resolveEvidence(), NodeInspectorProps (+48 more)

### Community 9 - "Credential Encryption Migration"
Cohesion: 0.05
Nodes (57): _coerce_config(), downgrade(), Encrypt existing plaintext credential secret values at rest (Fernet).…, config may come back as dict (PG JSONB) or str (SQLite JSON)., _rewrite(), _secret_keys(), upgrade(), create_credential() (+49 more)

### Community 10 - "Workflow Compiler"
Cohesion: 0.08
Nodes (60): AdkEdge, HumanApprovalDenied, _branch_default_label(), _build_adk_node(), _build_bound_workflow(), _build_graph_edges(), _edge_route(), _ensure_base_node() (+52 more)

### Community 11 - "Settings & Panels UI"
Cohesion: 0.08
Nodes (46): CONFIG_HINTS, REQUIRED_CREDENTIAL_FIELDS, CanvasSidebarProps, EdgeInspectorProps, ExperimentsPanel(), ExperimentsPanelProps, verdictBadge(), PanelSection() (+38 more)

### Community 12 - "App Config & Logging"
Cohesion: 0.06
Nodes (51): AbstractEventLoop, _resolve_api_token(), Settings, shutdown_http_client(), configure_logging(), StructuredFormatter, health(), _health_db_counts() (+43 more)

### Community 13 - "Workflow Canvas Page"
Cohesion: 0.07
Nodes (38): WorkflowCanvas, PanelStat(), PanelStatGrid(), WorkflowDataPanel(), WorkflowDataPanelProps, WorkflowQualityPanelProps, EvalScoresChart(), EvalScoresChartProps (+30 more)

### Community 14 - "Guardrail Policies API"
Cohesion: 0.08
Nodes (46): create_policy(), delete_policy(), enrich_graph_guardrail_policies(), _get_policy(), list_policies(), list_templates(), PolicyCreate, PolicyUpdate (+38 more)

### Community 15 - "Edge Inspector & Nodes"
Cohesion: 0.07
Nodes (45): EdgeInspector(), ConnectionLine(), GradientEdge, flushDraftTextareas(), DRAG_TYPE, ERROR_BRANCH_SOURCE_TYPES, supportsErrorBranch(), canvasNodeTypes (+37 more)

### Community 16 - "App Pages & Errors"
Cohesion: 0.09
Nodes (30): CapabilityBadges(), complexityLabel(), FILTER_IDS, FILTER_OPTIONS, previewLayout(), TemplateFilter, templateFlags(), TemplateMeta() (+22 more)

### Community 17 - "Compiler Core"
Cohesion: 0.08
Nodes (40): _build_author_lookup(), compile_workflow(), _graph_cache_key(), _safe_eval(), topological_sort(), filter_executable_graph(), is_annotation_node(), _make_transform_fn() (+32 more)

### Community 18 - "Jobs API & DB"
Cohesion: 0.10
Nodes (36): job_status(), get, Session, UUID, Background job status API., get_db(), _sqlite_enable_foreign_keys(), BackgroundJob (+28 more)

### Community 19 - "CI & Project Docs"
Cohesion: 0.06
Nodes (41): backend CI job (alembic upgrade head on SQLite + pytest), frontend CI job (npm typecheck + lint + build), migrations-postgres CI job (alembic upgrade head on pgvector/pgvector:pg16), CI GitHub Actions Workflow, cryptography>=42.0 (Fernet credential encryption) dependency, google-adk>=2.0 + google-genai dependency, sqlalchemy>=2.0 + alembic + psycopg2-binary dependency, Aegis — visual agent-workflow workbench (+33 more)

### Community 20 - "Runs API"
Cohesion: 0.13
Nodes (39): approve_run(), _as_utc(), create_run(), export_run(), get_run(), get_run_llm_calls(), get_run_timeline(), get_run_trace() (+31 more)

### Community 21 - "Integrations & Sub-workflows"
Cohesion: 0.09
Nodes (38): Validate the URL targets a public Postgres host and return the pinned IP.…, _validate_postgres_connection_url(), execute_sub_workflow(), Any, UUID, _hostname_blocked(), _is_blocked_ip(), AsyncClient (+30 more)

### Community 22 - "Guardrails & Describe UI"
Cohesion: 0.07
Nodes (32): DescribeWorkflowCard(), DescribeWorkflowCardProps, GeneratedNotes(), GeneratedWorkflow, describeShape, NewWorkflowPage(), pointForNode(), StarterGraphPreview() (+24 more)

### Community 23 - "DB Models & Migrations"
Cohesion: 0.08
Nodes (27): Base, AlertEvent, AuditLog, Credential, Experiment, Feedback, LlmCall, NodeResult (+19 more)

### Community 24 - "Assist API"
Cohesion: 0.12
Nodes (37): compare(), edit_graph(), explain_run(), generate_schema(), generate_workflow(), _get_user_run(), EditGraphResponse, GenerateSchemaResponse (+29 more)

### Community 25 - "Command Palette"
Cohesion: 0.08
Nodes (32): WorkflowPage(), Action, ADD_NODE_EVENT, CommandPalette(), emitAddNode(), EXPORT_TRACE_EVENT, FIT_VIEW_EVENT, FOCUS_NODE_EVENT (+24 more)

### Community 26 - "Assist Schemas"
Cohesion: 0.10
Nodes (35): AssistHistoryTurn, EditGraphResponse, GeneratedWorkflowDraft, GenerateSchemaResponse, _assign_positions(), AssistError, _capped_history(), _draft_to_graph() (+27 more)

### Community 27 - "Workflow Models & Tests"
Cohesion: 0.11
Nodes (33): Workflow, WorkflowRun, WorkflowVersion, _linear_graph(), asyncio, WorkflowRun, Integration coverage for previously-dark critical paths (audit P1/P2). Targets…, _run_status() (+25 more)

### Community 28 - "Guardrail Policy Plugin"
Cohesion: 0.11
Nodes (30): _contents_to_text(), _decode_str_response(), _expects_json(), GuardrailPolicyPlugin, Any, BasePlugin, LlmResponse, Workflow-level guardrail policy enforced through ADK plugin callbacks. A per-… (+22 more)

### Community 29 - "Run Executor"
Cohesion: 0.12
Nodes (35): configure_runtime_env(), Unset IDE-local Gemini proxy vars that break direct API calls., _as_utc(), _commit_db(), _consume_with_timeout(), _ensure_api_key(), execute_run(), _is_cancel_requested() (+27 more)

### Community 30 - "Onboarding UI"
Cohesion: 0.11
Nodes (31): SettingsPage(), FirstRunHero(), CanvasTour(), computePosition(), findVisibleAnchor(), Position, resolveStepIndex(), warnDev() (+23 more)

### Community 31 - "Guardrail Service"
Cohesion: 0.14
Nodes (28): GuardrailResult, LlmGuardrailVerdict, ModerationVerdict, _analyzer_available(), _default_entities(), detect_pii_presidio(), _get_analyzer(), Any (+20 more)

### Community 32 - "Observability UI"
Cohesion: 0.10
Nodes (28): AttentionItem, buildAttentionItems(), KIND_STATUS, kindClass(), kindLabel(), ObservabilityPage(), ObservabilitySummary, ObservabilityView (+20 more)

### Community 33 - "Code Sandbox"
Cohesion: 0.09
Nodes (24): AST, Attribute, _execute_code(), Any, Queue, Restricted Python execution for the Code node (n8n-style). Runs user code in a…, Child process entry: run code and put (ok, payload) on the queue., Expose only loads/dumps — never the stdlib module (avoids codecs.sys escape). (+16 more)

### Community 34 - "Platform API"
Cohesion: 0.13
Nodes (29): get_deploy_descriptor(), get_published(), ingest_run(), IngestNodeEvent, IngestRunPayload, invoke_workflow(), InvokePayload, list_audit() (+21 more)

### Community 35 - "Startup Checks"
Cohesion: 0.10
Nodes (27): _alembic_head_revisions(), check_database(), check_migrations_current(), _current_db_revisions(), MigrationsBehindError, Mark orphaned running jobs as failed after a crash or deploy., Raised when the database is behind the latest Alembic revision., Resolve the current Alembic head revision(s) from alembic/versions. (+19 more)

### Community 36 - "Run Deck UI"
Cohesion: 0.17
Nodes (30): StatusGlyph(), asRecord(), eventClass(), EventGlyph(), eventLabel(), eventStatus(), eventTime(), formatElapsed() (+22 more)

### Community 37 - "Executor Event Streaming"
Cohesion: 0.15
Nodes (25): _enqueue_event(), _extract_text_parts(), _extract_token_usage(), _normalize_text_part(), _put_run_event(), Any, Queue, Enqueue an event on a single subscriber queue; drop oldest when full. (+17 more)

### Community 38 - "Guardrail Fail Behavior"
Cohesion: 0.12
Nodes (25): apply_fail_behavior(), GuardrailBlockedError, Any, Exception, Parse a length bound; None (or unparseable) means the bound is unset., LLM cleanup pass: remove the violating material, keep the substance., redact_pii(), _rewrite_content() (+17 more)

### Community 39 - "Run Authoring"
Cohesion: 0.13
Nodes (27): _ancestors(), _node_data(), _node_type(), prune_graph_for_start(), Any, ValueError, Authoring-only run helpers: pin outputs + run-from-here. These features let the…, Raised when pin/run-from-here parameters are invalid for the graph. (+19 more)

### Community 40 - "Datasets API"
Cohesion: 0.20
Nodes (27): add_item(), add_run_input(), capture_runs(), create_dataset(), DatasetCapture, DatasetCreate, DatasetImport, DatasetItemCreate (+19 more)

### Community 41 - "Async Tasks"
Cohesion: 0.11
Nodes (24): _log_task_failure(), Any, Helpers for fire-and-forget asyncio tasks with exception logging., Schedule ``coro`` on the running event loop. When called from a worker thread…, schedule_task(), EvalThresholdBlockedError, Exception, Any (+16 more)

### Community 42 - "Node Test Service"
Cohesion: 0.16
Nodes (27): _build_test_context(), _cap_rendered(), _execute_node(), _format_result(), _gemini_text(), get_user_workflow(), _last_node_output(), latest_graph() (+19 more)

### Community 43 - "Guardrail Playground UI"
Cohesion: 0.15
Nodes (22): policyPresets, PolicyTemplates(), PolicyTemplatesProps, ruleSummary(), toConfig(), configFromRules(), GUARDRAIL_TYPES, PLAYGROUND_GUARDRAIL_TYPES (+14 more)

### Community 44 - "Feedback API"
Cohesion: 0.12
Nodes (23): alias, create_feedback(), FeedbackCreate, list_run_feedback(), BaseModel, get, post, Session (+15 more)

### Community 45 - "Frontend TS Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 46 - "Graph Defaults & Templates"
Cohesion: 0.11
Nodes (16): Helpers for standard Trigger → … → End workflow graphs., Prepend Trigger and append End, wiring entry/exit automatically. When…, wrap_graph_with_trigger_end(), init_http_client(), fixture, Stamp the DB at Alembic head so the startup migration gate sees it current. The…, setup_database(), _stamp_alembic_head() (+8 more)

### Community 47 - "Tracing & Logging"
Cohesion: 0.12
Nodes (18): get_trace_id(), init_tracing(), install_http_middleware(), NodeSpanTracker, _parse_headers(), Any, OpenTelemetry tracing for workflow execution and HTTP requests., Tracks in-flight ADK node spans for a single workflow run. (+10 more)

### Community 48 - "Assist Draft Schemas"
Cohesion: 0.20
Nodes (24): ExplainRunResponse, GenEdge, GenNode, A node as returned by Gemini structured output., SuggestionsDraft, _valid_edit_draft(), _invalid_draft(), _mock_response() (+16 more)

### Community 49 - "Scheduling & Retention"
Cohesion: 0.14
Nodes (22): purge_old_runs(), _claim_schedule_fire(), count_scheduled_workflows(), _create_scheduled_run_row(), cron_matches_now(), _evaluate_alerts(), _maybe_run_retention(), Any (+14 more)

### Community 50 - "Eval Presets API"
Cohesion: 0.18
Nodes (22): _as_list_item(), create_eval_preset(), delete_eval_preset(), list_eval_presets(), preview_eval_preset(), delete, get, patch (+14 more)

### Community 51 - "Templates API"
Cohesion: 0.19
Nodes (20): _builtin_items(), create_template(), list_eval_presets(), list_templates(), _persisted_item(), get, post, Session (+12 more)

### Community 52 - "Context Wrapper"
Cohesion: 0.14
Nodes (20): _normalize_output(), Any, Record upstream input and node output in the shared workflow context, applying…, wrap_with_context(), _error_graph(), _FakeCtx, Tests for per-node error-branch routing (n8n-style). A node that fails but…, Minimal stand-in for the ADK Context the wrapper writes ctx.route on. (+12 more)

### Community 53 - "Component Aliases"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 54 - "Canvas Motion"
Cohesion: 0.18
Nodes (14): registry, StaggerRecord, useEntryStagger(), HoverLift(), Props, NumberTween(), Props, PageEnter() (+6 more)

### Community 55 - "Assist History Tests"
Cohesion: 0.20
Nodes (20): AssistHistoryTurn, One prior turn of a copilot thread. ``role`` is ``"user"`` (a past instruction)…, _current_graph(), _last_prompt(), _mock_response(), patch, Tests for threaded copilot history on the edit-graph / suggest-nodes assist…, Absent/empty history -> no history block, endpoint behaves as before. (+12 more)

### Community 56 - "Integrations Service"
Cohesion: 0.19
Nodes (19): _parameterize_query(), _pg_engine(), _post_integration_webhook(), Any, Integration node handlers — Slack, Email, Postgres (n8n-style)., Return an error message when the recipient is invalid; None if acceptable., run_discord_integration(), run_email_integration() (+11 more)

### Community 57 - "Regex Safety"
Cohesion: 0.14
Nodes (20): _alternation_branches_overlap(), _body_has_unbounded_quantifier(), _branch_profile(), _has_catastrophic_structure(), _iter_quantified_groups(), ValueError, Guardrails against catastrophic backtracking in user-supplied regex patterns.…, Yield the inner body of every group immediately followed by an unbounded… (+12 more)

### Community 58 - "Node Test Tests"
Cohesion: 0.19
Nodes (19): _agent_workflow(), Tests for the ephemeral node-test and expression-preview endpoints. No test…, _seed_run(), _seed_workflow(), test_expression_preview_from_run_steps_resolution(), test_expression_preview_most_recent_run_when_no_run_id(), test_expression_preview_oversize_expression_400(), test_expression_preview_render_error_is_data_not_500() (+11 more)

### Community 59 - "Assist MVP2 Tests"
Cohesion: 0.24
Nodes (19): _EditGraphDraft, _GeneratedSchemaDraft, Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)., Gemini structured-output shape. schema_object_json is a JSON-encoded string…, _current_graph(), _edit_draft_add_guardrail(), _mock_response(), patch (+11 more)

### Community 60 - "Eval Service"
Cohesion: 0.15
Nodes (13): compute_aggregate_score(), EvalScores, preview_eval(), Any, Live rubric preview — run the LLM judge on a sample input/output. Powers the…, Score a sample with the given rubric. Returns the per-dimension scores + the…, BaseModel, scores_delta() (+5 more)

### Community 61 - "Expression Evaluator"
Cohesion: 0.19
Nodes (18): _coerce_number(), evaluate_condition(), Any, Template expression rendering for workflow context (n8n-style mapping)., Evaluate a structured IF condition (n8n-style, expression operands)., Replace ``{{path}}`` placeholders using workflow context., _render_operand(), render_template() (+10 more)

### Community 62 - "Graph Validation"
Cohesion: 0.19
Nodes (18): _error_branch_unsupported(), _is_annotation(), _is_number(), _node_data(), Validate canvas graph before save or compile. Returns summary metadata., True when this node config compiles to a bare ADK Agent (no route interception)., Enforce n8n-style error-branch rules: at most one error edge per node and only…, Reject non-numeric config for fields the compiler parses as numbers. (+10 more)

### Community 63 - "Model References"
Cohesion: 0.18
Nodes (17): available_models(), _coerce(), default_ref(), ModelRef, Pluggable model-selection seam for evaluation judges and guardrail classifiers.…, Models the UI may offer today (Gemini-only). Grows with multi-provider., Resolve an override to a concrete model string, defaulting to Gemini. Non-…, Model for an LLM-as-judge eval. Reads an optional preset['judge_model']. (+9 more)

### Community 64 - "Iteration Node Tests"
Cohesion: 0.33
Nodes (17): _ctx(), _iter_fn(), Tests for the iteration node (map-over-list, Dify-style single-node loop). The…, _run(), test_iteration_empty_items_yields_empty_array(), test_iteration_fail_on_error_raises(), test_iteration_hard_cap_100(), test_iteration_item_template_sees_normal_context() (+9 more)

### Community 65 - "Frontend Package Config"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @next/bundle-analyzer, postcss, tailwindcss (+11 more)

### Community 66 - "Root Layout & Fonts"
Cohesion: 0.13
Nodes (14): metadata, plexMono, plexSans, Toaster, viewport, MotionProvider(), isTerminalObservabilityEvent(), ObservabilityListener (+6 more)

### Community 67 - "Run Progress UI"
Cohesion: 0.16
Nodes (16): PostRunTransport(), PostRunTransportProps, RunProgressStrip(), RunProgressStripProps, useElapsedSeconds(), deriveState(), isCompletedStatus(), isFailedStatus() (+8 more)

### Community 68 - "Node Test API"
Cohesion: 0.20
Nodes (16): expression_preview(), node_test(), post, Session, UUID, Ephemeral node-test and expression-preview endpoints (canvas authoring aids).…, ContextAvailable, ExpressionPreviewRequest (+8 more)

### Community 69 - "Split Studio Mockup"
Cohesion: 0.15
Nodes (18): Aegis Visual Agent Workflow Workbench, Bone and Monochrome Chrome, 02 Split Studio Homepage Mockup, Invoice Processing Pipeline, Last Run Summary, Open Canvas Action, Pipeline Graph Preview, Color-Coded Pipeline Nodes (+10 more)

### Community 70 - "Header & Error Boundary"
Cohesion: 0.14
Nodes (13): HeaderActions(), ErrorBoundary, AppShell(), SHORTCUTS_HELP_EVENT, ShortcutsHelp(), startCanvasTour(), formatShortcutKey(), formatShortcutKeys() (+5 more)

### Community 71 - "Eval Preset Service"
Cohesion: 0.30
Nodes (16): EvaluationPreset, build_eval_instruction(), _batch_load_custom_presets(), builtin_preset_rows(), enrich_graph_eval_presets(), get_preset_config(), list_all_presets(), list_user_presets() (+8 more)

### Community 72 - "Approval Service"
Cohesion: 0.26
Nodes (15): _approval_key(), clear_approval_state(), HumanApprovalTimeout, _keys_for_run(), Any, Exception, Human-in-the-loop approval for paused workflow runs (Lyzr SuperFlow)., All in-memory keys belonging to a run (bare + per-node). (+7 more)

### Community 73 - "Frontend Dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, clsx, framer-motion, dependencies, class-variance-authority, clsx, framer-motion, next (+9 more)

### Community 74 - "Attention Inbox Mockup"
Cohesion: 0.14
Nodes (17): Approvals queue, Bone monochrome chrome, data/warehouse-sync-pipeline failed run, Editorial Aegis home page header, Monospace error log trace, Failed runs queue, Failure metadata header, Attention Inbox layout (+9 more)

### Community 75 - "UI Primitives"
Cohesion: 0.15
Nodes (11): DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut() (+3 more)

### Community 76 - "Experiments API"
Cohesion: 0.27
Nodes (15): _check_version(), create_experiment(), experiment_gate(), ExperimentCreate, get_experiment(), list_experiments(), BaseModel, get (+7 more)

### Community 77 - "Guardrail Schema Repair"
Cohesion: 0.18
Nodes (15): _parse_schema(), Parse ``text`` as JSON and validate it against ``schema``. Pure — no LLM.…, Ask the model to coerce ``text`` into JSON matching ``schema``. Returns the…, Enforce a JSON schema on output; on failure, re-ask the model to repair it…, _repair_to_schema(), validate_against_schema(), validate_structured_output(), Structured-output guardrail: JSON-schema validation + bounded re-ask. The re-… (+7 more)

### Community 78 - "Canvas Rail"
Cohesion: 0.18
Nodes (11): CANVAS_RAIL_ITEMS, CanvasRail(), CanvasRailItem, CanvasRailProps, CanvasRailTab, CanvasToolbar(), ToolbarButton(), Tooltip() (+3 more)

### Community 79 - "HTTP Client & Search"
Cohesion: 0.26
Nodes (11): get_http_client(), AsyncClient, startup_http_client(), run_search(), search_duckduckgo(), search_exa(), asyncio, patch (+3 more)

### Community 80 - "RAG Metrics"
Cohesion: 0.20
Nodes (11): Any, BaseModel, rag_aggregate(), RagScores, RAG-specific evaluation scorers. Standard RAG quality dimensions an LLM judge…, Mean of the three RAG dimensions (1-5), rounded., Score a RAG triple. Returns per-dimension scores + aggregate, or a skip/error…, score_rag() (+3 more)

### Community 81 - "Token Tracker"
Cohesion: 0.21
Nodes (8): Any, BasePlugin, Per-run token and cost accounting via ADK plugin callbacks. ADK 2.x's workflow…, Accumulates LLM token usage per ADK agent name for a single run., Flatten genai contents/parts into readable prompt text., Per-agent usage rows with cost estimates attached., TokenTrackerPlugin, _zero_usage()

### Community 82 - "Trace Plugin"
Cohesion: 0.27
Nodes (7): Any, BasePlugin, Exception, Per-run tool-call capture via ADK plugin callbacks (Trust-layer trace tree).…, Accumulates tool-call spans (name/args/result/timing) per ADK agent., _summarize(), TracePlugin

### Community 83 - "Canvas Sidebar"
Cohesion: 0.18
Nodes (13): CanvasSidebar(), RunComparison, SidebarTab, TabPanelFade(), tabs, VersionHistory, WorkflowDataPanel, WorkflowQualityPanel (+5 more)

### Community 84 - "Eval Runner"
Cohesion: 0.22
Nodes (13): _build_eval_prompt(), evaluate_content_async(), _evaluate_content_sync(), evaluate_node_async(), Any, Parallel and deferred evaluation execution (LLM + deterministic)., Evaluate multiple nodes concurrently. Returns (node_id, scores, error)., Judge the content as a response to the original request when we have it —… (+5 more)

### Community 85 - "Workflow Context"
Cohesion: 0.19
Nodes (8): Mutable workflow context passed through node execution., test_batch_last_scheduled_run_at_empty(), test_build_summary_fetches_runs_once(), test_workflow_context_snapshot_truncates_large_outputs(), test_context_from_json_input(), test_context_from_plain_text(), test_record_step_updates_last_output(), test_snapshot_for_metrics_excludes_memory()

### Community 86 - "Audit P1 Tests"
Cohesion: 0.14
Nodes (13): Regression tests for 2026-08-07 audit P1 fixes., P3: empty template must not passthrough node input., P1-1: trigger with seeded last_output preserves pin across passthrough., P1-2: bare google-search Agent never sets ctx.route — error edges dead-end., Wrapped tool handlers still support error routing., P1-13: newest-first list must reverse then take last 20 (= newest 20)., P1-6: viewer keys must not mutate /v1 routes., test_calculator_tool_still_allows_error_branch() (+5 more)

### Community 87 - "Node Test Errors"
Cohesion: 0.21
Nodes (7): NodeNotFoundError, Exception, Requested node_id is absent from the workflow's current graph., Any, Accumulates run input and per-step outputs for expression mapping., Snapshot safe for metrics/SSE — excludes workflow memory., WorkflowContext

### Community 88 - "Workflow Import"
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

### Community 89 - "Expression Preview UI"
Cohesion: 0.24
Nodes (9): ExpressionPreview(), hasBoundContext(), OutputBlock(), guardrailVariant(), NodeOutputPeek(), NodeOutputPeekProps, CopyButton(), ExpressionPreviewResult (+1 more)

### Community 90 - "Canvas Clipboard"
Cohesion: 0.30
Nodes (11): ClipboardStore, copyToClipboard(), duplicateFragment(), hasClipboard(), materialize(), materializeClipboard(), materializeFragmentAt(), nextNodeIndex() (+3 more)

### Community 91 - "Moderation Guardrail Tests"
Cohesion: 0.27
Nodes (9): _evaluate_moderation_scores(), Map category scores + thresholds to a verdict. Pure and side-effect-free so it…, Trust-layer Phase 3: moderation/toxicity guardrail rail. Covers the pure…, test_above_default_threshold_flags(), test_below_threshold_passes(), test_custom_single_threshold(), test_malformed_scores_do_not_crash(), test_per_category_thresholds_override_default() (+1 more)

### Community 92 - "Instrument Table Mockup"
Cohesion: 0.22
Nodes (11): Aegis visual agent-workflow workbench — observability/triage surface for LLM agent workflows, Aegis design language — warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Filter/search toolbar — 'Search workflows…', All Status, All Versions, Last 30d filters, List/Table view toggle, Templates, primary 'New workflow' button, 04-instrument-table.jpg — 'Instrument Table' homepage UI mockup for Aegis, Instrument Table layout — homepage concept: dense tabular inventory of agent workflows ('42 active workflows • 7 running'), Pagination footer — '1–25 of 142' with prev/next controls, Per-row action controls — run (play), edit (pencil), overflow menu, plus bulk-select checkboxes, Color-coded status pill system — SUCCESS (green), RUNNING (amber), FAILED (red); success-rate text colored green/red (+3 more)

### Community 93 - "App Rail & Nav"
Cohesion: 0.27
Nodes (8): AppRail(), AppRailProps, openCommandPalette(), isActivePath(), NavItem, navItems, Toaster(), useTheme()

### Community 94 - "Theme"
Cohesion: 0.35
Nodes (9): applyTheme(), getStoredTheme(), persistTheme(), Theme, THEME_STORAGE_KEY, readDomTheme(), ThemeContext, ThemeContextValue (+1 more)

### Community 95 - "Assist Compare"
Cohesion: 0.24
Nodes (10): CompareRequest, CompareVariantResult, compare_variants(), Wrap a single node between a trigger and end for single-node execution., Execute one variant as a single-node LLM run, capturing telemetry. Reuses the…, Run each variant (base_config merged with overrides) as a single-node run.…, _run_single_node_variant(), _single_node_graph() (+2 more)

### Community 96 - "Deploy Descriptor"
Cohesion: 0.33
Nodes (9): build_deploy_descriptor(), build_mcp_input_schema(), find_input_schema_fields(), _node_type(), Any, Build a deploy descriptor (invoke URL, cURL, MCP tool) for a published…, Return the first input_schema node's ``inputFields`` (or [])., Derive a JSON Schema object for the MCP tool's input. Uses the workflow's… (+1 more)

### Community 97 - "Experiment Runner"
Cohesion: 0.44
Nodes (9): _aggregate(), Any, UUID, Batch experiments: run a dataset against workflow version(s), score, compare.…, run_experiment(), _run_one_item(), _run_version_over_items(), _session() (+1 more)

### Community 98 - "Quiet Index Mockup"
Cohesion: 0.24
Nodes (10): Data typography: IBM Plex Mono for identifiers, versions, dates and the font badge; sans-serif for descriptions and headings, Aegis design language: warm near-black surfaces, bone/monochrome chrome, hairline dividers, color reserved for status and data, Homepage mockup 05: Directory / Quiet Index (Workflows index page), Monochrome status treatment: 'published' rendered as plain bone text, not a colored badge — color withheld even for status in the quiet index, Page header: oversized 'Workflows' title with descriptive subline 'Orchestrate, version, and publish internal automation sequences. 12 total', Directory / Quiet Index layout: calm, table-first index page with generous whitespace, no cards or dashboards, Sample workflow entries: onboard-new-hire, fraud-alert-escalate, daily-recon-csv, api-key-rotate, vendor-onboarding, incident-triage (6 of 12 shown), Quiet search input: hairline-outlined 'Search workflows…' field with magnifier icon, narrow width (+2 more)

### Community 99 - "Master-Detail Mockup"
Cohesion: 0.27
Nodes (10): Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions, macOS-style window chrome: traffic-light dots top-left, centered 'Aegis' title, Master-Detail layout pattern, Mixed typography: serif display face for detail title, monospace face for description and metadata, Aegis homepage mockup: master-detail workflow browser, Open (ghost/outlined) and Run (filled warm-taupe primary) action buttons, Selected list row highlighted with warm taupe/bone fill (Compliance Audit Trail), Warm near-black surfaces with bone/monochrome chrome; warm taupe accent reserved for selection and primary action (+2 more)

### Community 100 - "Run Controls UI"
Cohesion: 0.29
Nodes (9): RunControlProps, coerce(), deriveFields(), normalizeField(), readStored(), RunField, StoredInput, useRunInput() (+1 more)

### Community 101 - "Guardrail Sample Highlight"
Cohesion: 0.33
Nodes (9): escapeRegExp(), findKeywordMatches(), findPiiMatches(), HighlightedSample(), HighlightedSampleProps, MatchSpan, mergeSpans(), PII_PATTERNS (+1 more)

### Community 102 - "Run Overrides Migration"
Cohesion: 0.42
Nodes (7): _columns(), downgrade(), _indexes(), _inspector(), upgrade(), JSONType, TypeDecorator

### Community 103 - "Run Filters"
Cohesion: 0.44
Nodes (8): filter_runs_by_eval_passed(), filter_runs_by_guardrail_blocked(), filter_runs_by_has_eval(), WorkflowRun, Cross-database filters for workflow run list queries., run_eval_passed(), run_guardrail_blocked(), run_has_eval()

### Community 104 - "Experiment Gate Tests"
Cohesion: 0.39
Nodes (7): Trust-layer Phase 2: GET /api/experiments/{id}/gate CI regression gate. Wraps a…, _seed_experiment(), test_gate_failed_regression_and_strict_409(), test_gate_not_applicable_for_batch(), test_gate_passed_regression(), test_gate_pending_while_running(), _verdict()

### Community 105 - "Lab Notebook Mockup"
Cohesion: 0.33
Nodes (9): Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc, Design language: warm near-black panel on stained aged paper, bone monospace/typewriter type, red ink reserved for annotation/status, Workflow lifecycle log entries: 'Published v2 fraud-alert', 'Eval suite failed - 3 cases', 'Edited guardrail transaction-volume', 'Workflow forked refund-arbiter', Field-log metaphor: agent workflow archive rendered as a scientist's chronological lab notebook with volume/instrument metadata, Handwritten red-ink marginalia annotations: 'retry queue', 'human review suspected', 'observe drift inside docker', 'data drift review upcoming', 'see notebook vol. 16', 'run-8842', Boxed '+' button labeled 'NEW ENTRY / NEW WORKFLOW' in top-right of the log panel, Observability/triage surface framing: eval failures, guardrail threshold edits, drift, regressions, and forks presented as auditable history, Initialed authorship per entry (-M, -S, -K, -L) implying multi-operator triage journal (+1 more)

### Community 106 - "Node Type System Docs"
Cohesion: 0.32
Nodes (8): frontend/src/components/canvas/nodes/* (per-type canvas renderers), app/services/node_registry.py (canonical node-type metadata served to UI), frontend/src/lib/node-registry.ts (labels/icons/categories palette), frontend/src/types/workflow.ts (NodeType union + node data types), Node type system: 30 types across 6 categories synced across both apps, Canvas to ADK node type mapping, Canvas re-skin (custom nodes, gradient edges, inspector), 7-category node color system

### Community 107 - "Command Home Mockup"
Cohesion: 0.36
Nodes (8): Command Palette Search Bar (Search workflows, runs, or jump to... ⌘K), Aegis Design Language (warm near-black surfaces, bone/monochrome chrome, color reserved for status and data), Command Home Layout (Aegis Workbench Homepage), Needs Attention Triage Rail (Failed Runs with Dismiss Controls), Quick Action Cards (New Workflow, Browse Templates, View Failed Runs), Recent Workflows Card Grid with Sparkline Thumbnails, Status Badge System (PUBLISHED green, FAILED red, version chips), Top Navigation Bar (Aegis Workbench logo, Workflows/Runs/Agents/Templates, user avatar)

### Community 108 - "Mission Control Mockup"
Cohesion: 0.43
Nodes (8): Aegis Workbench product (visual agent-workflow workbench: React Flow canvas, observability/triage surface), KPI stat-card strip (Active runs 37, Failed 24h 9, Published 84, Avg latency 142ms) with status-colored dots, Live activity feed right rail (Last 15 min run events: run started, step timeout failure, completed run with confidence, queued runs), Mission Control layout (named concept: fleet-wide observability overview of all workflows), Homepage mockup 03: Mission Control Workflows overview, Status-only color design language (warm near-black surfaces, bone/monochrome chrome, green/amber/red reserved for status and data), Top navigation bar (Aegis Workbench brand, Workflows/Observability/Guardrails/Settings tabs, workflow search, New workflow CTA), Workflows table (name, version, publish state pill, run status pill, last-updated; Running/Paused/Failed color coding)

### Community 109 - "System Map Mockup"
Cohesion: 0.29
Nodes (8): Left-to-right directed graph (DAG) layout of workflow nodes with thin light edges and directional arrows, LIST toggle button in top-right header (map/list view switcher), Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold, System Map / Workflows map UI mockup (08-system-map.jpg), Warm near-black canvas surface with bone/monochrome chrome; no color used (color reserved for status/data), Selected-node detail card: 'core-orchestrator v2.4', 'last run: 11m ago', 'Open ->' button, anchored adjacent to highlighted node, Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv, Workflows map view (Aegis header 'Aegis | Workflows map')

### Community 110 - "Spatial Desk Mockup"
Cohesion: 0.32
Nodes (8): Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk, Warm near-black background with faint graph-paper grid texture, evoking both a physical desk and the React Flow canvas, Physical-desk metaphor details: paperclip on Q3 FORECAST ADJUST card, slight rotations, overlapping layering, paper-grain card textures, Bold condensed uppercase display typography for workflow names on cards, contrasted with small monospace-style version/recency labels, Minimal bone-on-black chrome: 'Aegis' wordmark top-left, 'Browse all ->' link top-right; no other navigation, Empty dashed-outline slots labeled 'Pin workflow' with '+' markers: affordance for adding workflows to the spatial desk, doubling as empty-state placeholder, Version + recency metadata per card (v4.1/YESTERDAY, v2/MONDAY, v3/TODAY, v1/2WKS) with muted green, rust, and olive accents: color reserved for status/data per design language, Scattered tilted workflow cards (INVOICE RECONCILE v4.1, SUPPLIER ONBOARD v2, Q3 FORECAST ADJUST v3, CERT RENEWALS v1) rendered as overlapping pinned index/polaroid cards with varied bone, tan, and gray paper tones

### Community 111 - "Test Routing Adk2"
Cohesion: 0.48
Nodes (6): _branch_graph(), Regression: conditional routing must work under ADK 2.x. ADK 2.x routes…, _run_graph(), test_if_decision_is_not_leaked_as_output(), test_if_routes_correct_branch(), parametrize

### Community 112 - "Quiet Table Mockup"
Cohesion: 0.33
Nodes (7): Aegis design language: warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Aegis homepage mockup 06: Quiet Table (Workflows list view), Primary actions: Templates ghost button and filled bone New workflow + button, Quiet Table layout, Status filter tabs: All / Published / Draft, Top navigation chrome: AEGIS shield logo, Workflows/Agents/Templates/Runs/Settings, v4.12 prod environment badge, Workflows list table with Name, Version, Updated columns and rows like Lead Qualification Agent v2.4

### Community 113 - "Terminal Shell Mockup"
Cohesion: 0.33
Nodes (7): CLI/terminal metaphor for the agent workbench: workflows and runs operated via shell commands instead of GUI panels, Command header: 'aegis >' prompt with block cursor; right-aligned 'AEGIS AGENT WORKBENCH v0.14.3 · session 47 · 03:41 UTC' on a raised title band, Warm near-black surface with bone/monochrome monospace text; amber/gold reserved for command echoes and accent data, 'recent runs' timestamped log: run IDs (name#hash), status (completed/failed), duration, and inline metrics (score:0.97, flagged:3, ERR: timeout, routed:2, stage:verify), Bottom status bar: left 'tab complete · type new · open <name> · last sync 41s ago'; right '↑ 3 workflows running · agents: 12 online', Terminal Shell layout, '$ list workflows' output table: NAME / VERSION / UPDATED columns with dashed separators (lead-qualifier 2.3.1, fraud-detector 4.1.0, contract-analyzer 1.9.4, escalation-router 3.0.2, onboarding-flow 2.7.1)

### Community 114 - "Package"
Cohesion: 0.29
Nodes (7): scripts, analyze, build, dev, lint, start, typecheck

### Community 115 - "Canvascontextmenu"
Cohesion: 0.48
Nodes (6): buildNodeRunMenuItems(), CanvasContextMenu(), CanvasContextMenuProps, ContextMenuItem, firstEnabledIndex(), isSeparator()

### Community 116 - "Hooks Use Pinned"
Cohesion: 0.62
Nodes (5): usePinnedWorkflows(), getPinnedWorkflowIds(), isWorkflowPinned(), setPinnedWorkflowIds(), togglePinnedWorkflow()

### Community 117 - "012 Run Spans Tags"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 118 - "013 Alert Baseline"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 119 - "014 Workflow Memory"
Cohesion: 0.73
Nodes (5): downgrade(), _existing_indexes(), _existing_tables(), _inspector(), upgrade()

### Community 120 - "Kb Cache"
Cohesion: 0.40
Nodes (5): load_workflow_kb_documents(), Any, Session, UUID, Per-run knowledge document cache.

### Community 121 - "Roadmap Eval Rigor"
Cohesion: 0.40
Nodes (6): Evaluation rigor: online evals + CI gates (P1.2), Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5), P0: misleading eval chroma (1-5 scores banded on 0-1), User-defined eval presets & weighting (EvaluationPreset model), Deterministic evaluators (exact/substring, regex, embedding similarity), OpenTelemetry tracing export (Jaeger/LangFuse/Datadog)

### Community 122 - "Superpowers Plans 2026"
Cohesion: 0.33
Nodes (6): Motion primitives (PageEnter, StaggerList, HoverLift, NumberTween, useGlowPulse), Reduced-motion gating (useReducedMotionStrict), Design token system (CSS variables + Tailwind config), Glass & glow visual language, Design-system quality bar (instrument aesthetic, chroma for data only), Hardcoded white sheen vs --surface-highlight token (light theme loses lift)

### Community 123 - "Versiondiffview"
Cohesion: 0.53
Nodes (5): buildDiffHighlightMap(), DiffRow, diffWorkflowVersions(), nodeMap(), VersionDiffView()

### Community 124 - "Node Registry"
Cohesion: 0.50
Nodes (4): get_node_meta(), NodeTypeMeta, Canonical node type metadata for the agentic workflow builder., TypedDict

### Community 125 - "Snippets"
Cohesion: 0.80
Nodes (4): deleteSnippet(), getSnippets(), saveSnippet(), write()

### Community 126 - "Workflow"
Cohesion: 0.50
Nodes (4): formatValidationToast(), getWorkflowValidationIssues(), isValidCronExpression(), WorkflowFieldIssue

### Community 127 - "Agentops Plan"
Cohesion: 0.50
Nodes (4): LLM-call traces (llm_calls table, gen_ai.* spans), North star loop Build to Run to Trust, Phase 1 Truthful runtime, Token and cost accounting via ADK plugin

### Community 128 - "009 Agentops Tables"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 129 - "011 Workflow"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 130 - "Eslintrc"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 131 - "Package"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 133 - "Agentops Plan Phase3"
Cohesion: 0.67
Nodes (3): Phase 3 Guardrails as policy layer, presidio-analyzer + presidio-anonymizer dependency, Guardrail playground (rules, Presidio PII, prompt injection, LLM classifier)

### Community 142 - "Roadmap"
Cohesion: 0.67
Nodes (3): Gemini-only runtime constraint, Multi-model / multi-provider support (P0.1), Provider abstraction (LiteLLM-style shim)

### Community 143 - "Superpowers Plans 2026"
Cohesion: 0.67
Nodes (3): Guardrail engine (blocklist/regex/PII, block vs warn), Advanced PII (Microsoft Presidio) + prompt injection shield, Guardrail graceful fallbacks & PII masking/redaction

### Community 144 - "Superpowers Specs 2026"
Cohesion: 0.67
Nodes (3): shadcn/ui primitive migration (Radix-backed), P0: dead focus ring (Tailwind v4 ring-3 in v3 build), Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)

### Community 146 - "Ui Audit Issues"
Cohesion: 0.67
Nodes (3): Aegis Frontend UI/UX Audit 2026-07-11, Mobile canvas layout-lock mode, text-2xs Tailwind token consolidation

## Ambiguous Edges - Review These
- `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` → `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`  [AMBIGUOUS]
  docs/design/homepage-mockups/08-system-map.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **419 isolated node(s):** `next/core-web-vitals`, `next/typescript`, `$schema`, `style`, `rsc` (+414 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **56 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` and `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Canvas Chrome` to `Node Inspector UI`, `Homepage & Templates UI`, `Canvas Edges & Palette`, `Run Detail UI`, `Settings & Panels UI`, `Workflow Canvas Page`, `Edge Inspector & Nodes`, `App Pages & Errors`, `Guardrails & Describe UI`, `Command Palette`, `Onboarding UI`, `Observability UI`, `Run Deck UI`, `Guardrail Playground UI`, `UI Primitives`, `Canvas Rail`, `Canvas Sidebar`, `Expression Preview UI`, `App Rail & Nav`, `Canvascontextmenu`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `validate_workflow_graph()` connect `Graph Validation` to `Meta & Ops API`, `Platform API`, `Run Authoring`, `Workflow Compiler`, `Assist Draft Schemas`, `Compiler Core`, `Scheduling & Retention`, `Templates API`, `Runs API`, `Context Wrapper`, `Audit P1 Tests`, `Workflow Import`, `Assist Schemas`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `GuardrailPolicyPlugin` connect `Guardrail Policy Plugin` to `Executor Event Streaming`, `Run Executor`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `next/core-web-vitals`, `next/typescript`, `$schema` to the rest of the system?**
  _419 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Meta & Ops API` be split into smaller, more focused modules?**
  _Cohesion score 0.05319776009431182 - nodes in this community are weakly interconnected._
- **Should `Observability API` be split into smaller, more focused modules?**
  _Cohesion score 0.05423094904160823 - nodes in this community are weakly interconnected._