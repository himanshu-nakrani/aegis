# Graph Report - aegis  (2026-09-27)

## Corpus Check
- 418 files · ~451,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3631 nodes · 9454 edges · 225 communities (170 shown, 55 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8eff443c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- UUID
- observability_service.py
- workflow.ts
- api
- QuickAddMenu.tsx
- cn
- test_upgrade_phase3.py
- services/alerts.py
- CostDashboard.tsx
- services/credentials.py
- compiler.py
- settings/page.tsx
- startup.py
- utils.ts
- guardrail_policies.py
- WorkflowCanvas.tsx
- button.tsx
- P2 defects (53)
- job_queue.py
- Pillar 2: Distributed, Resilient Execution Fabric
- runs.py
- integrations.py
- new/page.tsx
- main.py
- api/assist.py
- CommandPalette.tsx
- services/assist.py
- models.py
- GuardrailPolicyPlugin
- executor.py
- CanvasTour.tsx
- validate_guardrail_content
- observability/page.tsx
- test_phase3_nodes.py
- platform.py
- WorkflowDataPanel.tsx
- RunDeck.tsx
- _RunEventBroker
- validate_content
- test_run_from_here.py
- datasets.py
- test_phase13.py
- services/node_test.py
- GuardrailPlayground.tsx
- deps.py
- compilerOptions
- render_template
- tracing.py
- test_assist.py
- schedule_worker.py
- eval_presets.py
- api/templates.py
- test_error_routing.py
- components.json
- index.ts
- test_assist_history.py
- run_email_integration
- test_security_fixes.py
- test_node_test_api.py
- test_assist_mvp2.py
- eval.py
- node_handlers.py
- valid_graph
- run_concurrency.py
- test_iteration_node.py
- devDependencies
- layout.tsx
- useRunReplay.ts
- api/node_test.py
- 02 Split Studio Homepage Mockup
- node-registry.ts
- eval_preset_service.py
- BaseNode.tsx
- dependencies
- Attention Inbox layout
- workflows.py
- experiments.py
- guardrail.py
- CanvasToolbar.tsx
- search.py
- test_rag_metrics.py
- TokenTrackerPlugin
- TracePlugin
- CanvasSidebar.tsx
- llm_providers/__init__.py
- WorkflowContext
- schedule_info.py
- run_sandboxed_code
- regex_safety.py
- meta.py
- api/credentials.py
- test_moderation_guardrail.py
- Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions
- AppRail.tsx
- ThemeProvider.tsx
- Competitive analysis — Aegis vs. the market
- get
- experiment_runner.py
- Homepage mockup 05: Directory / Quiet Index (Workflows index page)
- Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions
- useRunInput.ts
- api/alerts.py
- validate_structured_output
- test_agentops_phase3.py
- test_experiment_gate.py
- Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc
- Node type system: 30 types across 6 categories synced across both apps
- Command Home Layout (Aegis Workbench Homepage)
- Mission Control layout (named concept: fleet-wide observability overview of all workflows)
- Workflows map view (Aegis header 'Aegis | Workflows map')
- Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk
- edit_graph
- Aegis homepage mockup 06: Quiet Table (Workflows list view)
- Terminal Shell layout
- scripts
- persistent_memory.py
- auth.ts
- 012_run_spans_tags_sessions.py
- 013_alert_baseline_comparison.py
- test_mvp2_foundation.py
- kb_cache.py
- Evaluation rigor: online evals + CI gates (P1.2)
- Glass & glow visual language
- test_phase4.py
- setup.sh
- _SafetyVisitor
- KnowledgeBulkImport
- Phase 1 Truthful runtime
- 009_agentops_tables_backfill.py
- 011_workflow_templates.py
- extends
- test_audit_p1_p2_fixes.py
- tailwind.config.ts
- presidio-analyzer + presidio-anonymizer dependency
- Multi-model / multi-provider support (P0.1)
- Guardrail engine (blocklist/regex/PII, block vs warn)
- Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)
- next.config.mjs
- Aegis Frontend UI/UX Audit 2026-07-11
- Phase 2 Evals that catch regressions
- Phase 5 Platform (harness for any agent)
- opentelemetry-api/sdk/otlp-exporter dependency
- test_compiler.py
- ObservabilityStreamProvider.tsx
- Copper as dedicated active semantic token (not blanket warning)
- Bidirectional MCP (client + real server)
- RAG depth (Knowledge Pipeline)
- Phase 2 Release 1.5 - Stabilize
- Aegis UI overhaul implementation plan
- test_run_concurrency.py
- HighlightedSample.tsx
- 015_run_overrides_and_index.py
- workflow-import.ts
- test_routing_adk2.py
- postcss.config.mjs
- vercel.json
- DB-backed background_jobs queue
- workflow_schedules table + indexed cron query
- Phase 4 Observability you can operate on
- fastapi>=0.110 + uvicorn[standard] dependency
- Aegis Header SVG
- UI Mockup: Continue Build and Run
- UI Mockup: Open or Run Workflows
- UI Mockup: Structure Index of Workflows
- UI Mockup: Quality Loop and Posture
- UI Mockup: Start from Pattern Templates
- UI Mockup: Publish Lifecycle Stages
- UI Mockup: Run Desk Operations
- UI Mockup: Modules and Agents Library
- UI Mockup: Workflow Schedule Board
- UI Mockup: Experiments and Variants
- UI Mockup: Observability Dashboard
- UI Mockup: Observability Investigate Run
- UI Mockup: Observability Triage View
- UI Mockup: Observability by Workflow
- UI Mockup: Guardrails Policy Configuration
- UI Mockup: System Settings
- ADK-native graph execution (branching, fan-out JoinNode)
- Phase 2 Release 2.0 - Productize (evals + guardrails)
- Search tools (Google Search / EXA / DuckDuckGo)
- Geist font integration
- UI/UX audit 2026-07-25 (74 verified findings)
- Error-state pandemic (failed queries render as healthy empties)
- Formatter/label duplication drift (tone maps, ms formatters, guardrail labels)
- P0: wrong timezone under a 'UTC' label
- Observability window inconsistency across views
- Next.js create-next-app frontend
- Aegis issue tracker (resolved + backlog)
- Security hardening (SSRF, SQLi, ReDoS, code sandbox breakout)
- Guardrail DB telemetry fix for blocked nodes
- Parallel / post-run evaluations (asyncio.gather)
- Real-time SSE/WebSocket observability updates
- Evals/Guardrails/Observability upgrade plan
- teardown.sh
- broadcast_observability_event
- use-pinned-workflows.ts
- 014_workflow_memory_unique.py
- CanvasContextMenu.tsx
- run.sh
- node_registry.py
- package.json
- useGraphHistory.ts
- sonner
- cmdk
- lucide-react
- tailwindcss-animate
- @tanstack/react-query

## God Nodes (most connected - your core abstractions)
1. `cn()` - 209 edges
2. `valid_graph()` - 67 edges
3. `validate_workflow_graph()` - 50 edges
4. `compile_workflow()` - 49 edges
5. `Button` - 49 edges
6. `_build_adk_node()` - 46 edges
7. `api` - 46 edges
8. `WorkflowCanvasInner()` - 44 edges
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
- **Aegis roadmap priority feature gaps** — docs_roadmap_multi_model_support, docs_roadmap_bidirectional_mcp, docs_roadmap_rag_depth, docs_roadmap_eval_rigor, docs_roadmap_durable_execution [EXTRACTED 1.00]
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

## Communities (225 total, 55 thin omitted)

### Community 0 - "UUID"
Cohesion: 0.20
Nodes (29): bulk_import_knowledge(), create_knowledge_document(), delete_knowledge_document(), delete_workflow(), delete_workflow_memory(), duplicate_workflow(), export_workflow(), _get_user_workflow() (+21 more)

### Community 1 - "observability_service.py"
Cohesion: 0.06
Nodes (76): observability_costs(), observability_dashboards(), observability_errors(), observability_overview(), observability_quality(), observability_runs(), observability_summary(), observability_trust() (+68 more)

### Community 2 - "workflow.ts"
Cohesion: 0.03
Nodes (86): ExpressionPreview(), hasBoundContext(), ExpressionTextarea, ExpressionTextareaProps, Segment, NodeLiveResult, argBest(), buildCompareConfig() (+78 more)

### Community 3 - "api"
Cohesion: 0.09
Nodes (49): buildContinueItems(), HomePage(), WorkflowCanvas, VersionHistory(), FirstRunHero(), NextActionsPanel(), PinnedContinuePanels(), WorkflowRow() (+41 more)

### Community 4 - "QuickAddMenu.tsx"
Cohesion: 0.11
Nodes (28): EdgeData, GradientEdge, GradientEdgeImpl(), COMPARE_ELIGIBLE, NodeInspector(), RELIABILITY_NODE_TYPES, ALL_CATS, DRAG_TYPE (+20 more)

### Community 5 - "cn"
Cohesion: 0.05
Nodes (64): react, CanvasStatusBar(), TONE_CLASSES, CodeBlock(), DeploySheet(), DeploySheetBody(), DeployTab, isNoPublishedVersion() (+56 more)

### Community 6 - "test_upgrade_phase3.py"
Cohesion: 0.07
Nodes (54): cosine_similarity_vectors(), embed_text(), _hashing_vector(), Any, Text embeddings for vector RAG (Gemini with TF-IDF fallback)., retrieve_by_embedding(), evaluate_embedding_similarity(), evaluate_exact() (+46 more)

### Community 7 - "services/alerts.py"
Cohesion: 0.19
Nodes (22): AlertRule, Threshold rule evaluated by the scheduler tick., _breached(), evaluate_alert_rules(), _metric_over_window(), _metric_value(), _percentile(), AlertRule (+14 more)

### Community 8 - "CostDashboard.tsx"
Cohesion: 0.09
Nodes (38): HomeOverviewStrip(), AggregateKind, CellValue, CostBreakdownColumn, CostBreakdownRow, CostBreakdownTable(), CostBreakdownTableProps, formatCell() (+30 more)

### Community 9 - "services/credentials.py"
Cohesion: 0.10
Nodes (30): _coerce_config(), downgrade(), Encrypt existing plaintext credential secret values at rest (Fernet).…, config may come back as dict (PG JSONB) or str (SQLite JSON)., _rewrite(), _secret_keys(), upgrade(), decrypt_credential_config() (+22 more)

### Community 10 - "compiler.py"
Cohesion: 0.10
Nodes (40): AdkEdge, AST, _branch_default_label(), _build_author_lookup(), _build_bound_workflow(), _build_graph_edges(), compile_workflow(), _edge_route() (+32 more)

### Community 11 - "settings/page.tsx"
Cohesion: 0.05
Nodes (57): API_KEY_FIELD, BASE_URL_FIELD, CONFIG_HINTS, REQUIRED_CREDENTIAL_FIELDS, EdgeInspector(), EdgeInspectorProps, ExperimentsPanel(), ExperimentsPanelProps (+49 more)

### Community 12 - "startup.py"
Cohesion: 0.10
Nodes (30): _alembic_head_revisions(), check_database(), check_migrations_current(), _current_db_revisions(), MigrationsBehindError, Mark orphaned running jobs as failed after a crash or deploy., Raised when the database is behind the latest Alembic revision., Resolve the current Alembic head revision(s) from alembic/versions. (+22 more)

### Community 13 - "utils.ts"
Cohesion: 0.06
Nodes (65): allUpstream(), directPredecessors(), NodeDataSection(), NodeDataSectionProps, NodeEvidence, oneLine(), OutputBlock(), resolveEvidence() (+57 more)

### Community 14 - "guardrail_policies.py"
Cohesion: 0.15
Nodes (25): create_policy(), delete_policy(), enrich_graph_guardrail_policies(), _get_policy(), list_policies(), list_templates(), PolicyCreate, PolicyUpdate (+17 more)

### Community 15 - "WorkflowCanvas.tsx"
Cohesion: 0.08
Nodes (51): buildNodeRunMenuItems(), ClipboardStore, copyToClipboard(), duplicateFragment(), hasClipboard(), materialize(), materializeClipboard(), materializeFragmentAt() (+43 more)

### Community 16 - "button.tsx"
Cohesion: 0.08
Nodes (35): CapabilityBadges(), complexityLabel(), FILTER_IDS, FILTER_OPTIONS, previewLayout(), TemplateCardProps, TemplateFilter, templateFlags() (+27 more)

### Community 17 - "P2 defects (53)"
Cohesion: 0.06
Nodes (30): Aegis — Deep Backend + Frontend Audit (2026-08-07), Backend, Backend — concurrency, Backend — data layer, Backend — execution & API, Backend — handlers & security, Backend — observability & eval math, Backend test coverage (the audit's biggest gap) (+22 more)

### Community 18 - "job_queue.py"
Cohesion: 0.12
Nodes (30): job_status(), get, Session, UUID, Background job status API., get_db(), BackgroundJob, KnowledgeDocument (+22 more)

### Community 19 - "Pillar 2: Distributed, Resilient Execution Fabric"
Cohesion: 0.06
Nodes (41): backend CI job (alembic upgrade head on SQLite + pytest), frontend CI job (npm typecheck + lint + build), migrations-postgres CI job (alembic upgrade head on pgvector/pgvector:pg16), CI GitHub Actions Workflow, cryptography>=42.0 (Fernet credential encryption) dependency, google-adk>=2.0 + google-genai dependency, sqlalchemy>=2.0 + alembic + psycopg2-binary dependency, Aegis — visual agent-workflow workbench (+33 more)

### Community 20 - "runs.py"
Cohesion: 0.10
Nodes (47): approve_run(), _as_utc(), create_run(), export_run(), get_run(), get_run_llm_calls(), get_run_timeline(), get_run_trace() (+39 more)

### Community 21 - "integrations.py"
Cohesion: 0.10
Nodes (36): get_http_client(), AsyncClient, _pg_engine(), _post_integration_webhook(), Any, Integration node handlers — Slack, Email, Postgres (n8n-style)., Validate the URL targets a public Postgres host and return the pinned IP.…, run_discord_integration() (+28 more)

### Community 22 - "new/page.tsx"
Cohesion: 0.10
Nodes (27): DescribeWorkflowCard(), DescribeWorkflowCardProps, GeneratedNotes(), GeneratedWorkflow, describeShape, NewWorkflowPage(), pointForNode(), StarterGraphPreview() (+19 more)

### Community 23 - "main.py"
Cohesion: 0.07
Nodes (40): AbstractEventLoop, Settings, _sqlite_enable_foreign_keys(), shutdown_http_client(), startup_http_client(), configure_logging(), StructuredFormatter, lifespan() (+32 more)

### Community 24 - "api/assist.py"
Cohesion: 0.18
Nodes (25): compare(), edit_graph(), explain_run(), generate_schema(), generate_workflow(), _get_user_run(), EditGraphResponse, GenerateSchemaResponse (+17 more)

### Community 25 - "CommandPalette.tsx"
Cohesion: 0.08
Nodes (29): WorkflowPage(), ErrorBoundary, AppShell(), Action, ADD_NODE_EVENT, CommandPalette(), emitAddNode(), EXPORT_TRACE_EVENT (+21 more)

### Community 26 - "services/assist.py"
Cohesion: 0.13
Nodes (33): CompareRequest, CompareVariant, CompareVariantResult, EdgeRef, EditGraphResponse, ExplainRunResponse, GenerateSchemaResponse, GraphDiff (+25 more)

### Community 27 - "models.py"
Cohesion: 0.08
Nodes (45): Base, AlertEvent, AuditLog, Credential, Experiment, Feedback, LlmCall, NodeResult (+37 more)

### Community 28 - "GuardrailPolicyPlugin"
Cohesion: 0.11
Nodes (30): _contents_to_text(), _decode_str_response(), _expects_json(), GuardrailPolicyPlugin, Any, BasePlugin, LlmResponse, Workflow-level guardrail policy enforced through ADK plugin callbacks. A per-… (+22 more)

### Community 29 - "executor.py"
Cohesion: 0.11
Nodes (40): configure_runtime_env(), Unset IDE-local Gemini proxy vars that break direct API calls., _as_utc(), _commit_db(), _consume_with_timeout(), _ensure_api_key(), execute_run(), _extract_text_from_event() (+32 more)

### Community 30 - "CanvasTour.tsx"
Cohesion: 0.17
Nodes (18): GuardrailPlayground(), CanvasTour(), computePosition(), findVisibleAnchor(), Position, resolveStepIndex(), warnDev(), GettingStartedBanner() (+10 more)

### Community 31 - "validate_guardrail_content"
Cohesion: 0.15
Nodes (18): _analyzer_available(), _default_entities(), detect_pii_presidio(), _get_analyzer(), Any, Optional Microsoft Presidio integration for entity-based PII detection., redact_pii_presidio(), validate_guardrail_content() (+10 more)

### Community 32 - "observability/page.tsx"
Cohesion: 0.08
Nodes (37): AttentionItem, buildAttentionItems(), KIND_STATUS, kindClass(), kindLabel(), ObservabilityPage(), ObservabilitySummary, ObservabilityView (+29 more)

### Community 33 - "test_phase3_nodes.py"
Cohesion: 0.25
Nodes (16): _approval_key(), clear_approval_state(), HumanApprovalTimeout, _keys_for_run(), Any, Exception, Human-in-the-loop approval for paused workflow runs (Lyzr SuperFlow)., All in-memory keys belonging to a run (bare + per-node). (+8 more)

### Community 34 - "platform.py"
Cohesion: 0.07
Nodes (55): get_deploy_descriptor(), get_published(), ingest_run(), IngestNodeEvent, IngestRunPayload, invoke_workflow(), InvokePayload, list_audit() (+47 more)

### Community 35 - "WorkflowDataPanel.tsx"
Cohesion: 0.11
Nodes (20): WorkflowDataPanel(), WorkflowDataPanelProps, WorkflowQualityPanelProps, Alert(), AlertProps, AlertVariant, variantStyles, Card() (+12 more)

### Community 36 - "RunDeck.tsx"
Cohesion: 0.20
Nodes (26): asRecord(), eventClass(), EventGlyph(), eventLabel(), eventStatus(), eventTime(), formatElapsed(), metricNumber() (+18 more)

### Community 37 - "_RunEventBroker"
Cohesion: 0.15
Nodes (24): _enqueue_event(), _extract_text_parts(), _normalize_text_part(), _put_run_event(), Queue, Enqueue an event on a single subscriber queue; drop oldest when full., Broadcast a run event to every subscriber of the run., Fan out run events to every SSE subscriber of a single run. Each subscriber… (+16 more)

### Community 38 - "validate_content"
Cohesion: 0.14
Nodes (20): apply_fail_behavior(), GuardrailBlockedError, Exception, redact_pii(), validate_content(), test_block_mode_raises(), test_validate_blocked_pattern_list(), test_validate_max_length() (+12 more)

### Community 39 - "test_run_from_here.py"
Cohesion: 0.13
Nodes (27): _ancestors(), _node_data(), _node_type(), prune_graph_for_start(), Any, ValueError, Authoring-only run helpers: pin outputs + run-from-here. These features let the…, Raised when pin/run-from-here parameters are invalid for the graph. (+19 more)

### Community 40 - "datasets.py"
Cohesion: 0.20
Nodes (27): add_item(), add_run_input(), capture_runs(), create_dataset(), DatasetCapture, DatasetCreate, DatasetImport, DatasetItemCreate (+19 more)

### Community 41 - "test_phase13.py"
Cohesion: 0.11
Nodes (24): _log_task_failure(), Any, Helpers for fire-and-forget asyncio tasks with exception logging., Schedule ``coro`` on the running event loop. When called from a worker thread…, schedule_task(), EvalThresholdBlockedError, Exception, Any (+16 more)

### Community 42 - "services/node_test.py"
Cohesion: 0.10
Nodes (39): expression_preview(), node_test(), post, Session, UUID, provider_env_var(), Conventional env var name for a provider's API key., _build_test_context() (+31 more)

### Community 43 - "GuardrailPlayground.tsx"
Cohesion: 0.14
Nodes (24): policyPresets, PolicyTemplates(), PolicyTemplatesProps, ruleSummary(), toConfig(), configFromRules(), GUARDRAIL_TYPES, PLAYGROUND_GUARDRAIL_TYPES (+16 more)

### Community 44 - "deps.py"
Cohesion: 0.07
Nodes (40): alias, create_feedback(), FeedbackCreate, list_run_feedback(), BaseModel, get, post, Session (+32 more)

### Community 45 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 46 - "render_template"
Cohesion: 0.14
Nodes (22): _make_expression_agent_fn(), _coerce_number(), evaluate_condition(), Any, Template expression rendering for workflow context (n8n-style mapping)., Evaluate a structured IF condition (n8n-style, expression operands)., Replace ``{{path}}`` placeholders using workflow context., _render_operand() (+14 more)

### Community 47 - "tracing.py"
Cohesion: 0.12
Nodes (20): get_trace_id(), init_tracing(), install_http_middleware(), is_tracing_enabled(), NodeSpanTracker, _parse_headers(), Any, OpenTelemetry tracing for workflow execution and HTTP requests. (+12 more)

### Community 48 - "test_assist.py"
Cohesion: 0.18
Nodes (25): GenEdge, GeneratedWorkflowDraft, _assign_positions(), _draft_to_graph(), Layer nodes left-to-right by BFS depth from entry nodes. Faithful port of the…, Convert a Gemini draft into canvas-shaped nodes/edges. Drops nodes with unknown…, _invalid_draft(), _mock_response() (+17 more)

### Community 49 - "schedule_worker.py"
Cohesion: 0.14
Nodes (21): _claim_schedule_fire(), count_scheduled_workflows(), _create_scheduled_run_row(), cron_matches_now(), _evaluate_alerts(), _maybe_run_retention(), Any, datetime (+13 more)

### Community 50 - "eval_presets.py"
Cohesion: 0.18
Nodes (22): _as_list_item(), create_eval_preset(), delete_eval_preset(), list_eval_presets(), preview_eval_preset(), delete, get, patch (+14 more)

### Community 51 - "api/templates.py"
Cohesion: 0.19
Nodes (20): _builtin_items(), create_template(), list_eval_presets(), list_templates(), _persisted_item(), get, post, Session (+12 more)

### Community 52 - "test_error_routing.py"
Cohesion: 0.13
Nodes (22): _normalize_output(), Any, Record upstream input and node output in the shared workflow context, applying…, wrap_with_context(), P1-1: trigger with seeded last_output preserves pin across passthrough., test_parse_seeded_last_output_trigger_path(), _error_graph(), _FakeCtx (+14 more)

### Community 53 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 54 - "index.ts"
Cohesion: 0.18
Nodes (14): registry, StaggerRecord, useEntryStagger(), HoverLift(), Props, NumberTween(), Props, PageEnter() (+6 more)

### Community 55 - "test_assist_history.py"
Cohesion: 0.29
Nodes (17): SuggestionsDraft, _current_graph(), _last_prompt(), _mock_response(), patch, Tests for threaded copilot history on the edit-graph / suggest-nodes assist…, Absent/empty history -> no history block, endpoint behaves as before., Different history -> cache miss; same history -> cache hit. (+9 more)

### Community 56 - "run_email_integration"
Cohesion: 0.42
Nodes (8): Return an error message when the recipient is invalid; None if acceptable., run_email_integration(), _validate_single_email_recipient(), asyncio, test_email_missing_to_after_render(), test_email_rejects_multiple_recipients(), test_email_single_recipient_succeeds_without_smtp(), test_email_without_smtp_does_not_leak_payload()

### Community 57 - "test_security_fixes.py"
Cohesion: 0.17
Nodes (18): _parameterize_query(), run_postgres_integration(), validate_safe_regex(), execute_sub_workflow(), Any, UUID, Execute a child workflow from a Sub-workflow node (n8n Execute Workflow)., asyncio (+10 more)

### Community 58 - "test_node_test_api.py"
Cohesion: 0.15
Nodes (23): EvalScores, BaseModel, _agent_workflow(), Tests for the ephemeral node-test and expression-preview endpoints. No test…, _seed_run(), _seed_workflow(), test_expression_preview_from_run_steps_resolution(), test_expression_preview_most_recent_run_when_no_run_id() (+15 more)

### Community 59 - "test_assist_mvp2.py"
Cohesion: 0.22
Nodes (21): _EditGraphDraft, _GeneratedSchemaDraft, GenNode, Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)., Gemini structured-output shape. schema_object_json is a JSON-encoded string…, A node as returned by Gemini structured output., _current_graph(), _edit_draft_add_guardrail() (+13 more)

### Community 60 - "eval.py"
Cohesion: 0.16
Nodes (11): compute_aggregate_score(), preview_eval(), Any, Live rubric preview — run the LLM judge on a sample input/output. Powers the…, Score a sample with the given rubric. Returns the per-dimension scores + the…, scores_delta(), _parse_evaluation_scores(), Custom rubric editor: eval-preset update (PATCH) + live sample preview. The… (+3 more)

### Community 61 - "node_handlers.py"
Cohesion: 0.10
Nodes (41): HumanApprovalDenied, _build_adk_node(), _coerce_item_output(), _ensure_memory_bucket(), _load_credential(), _make_code_fn(), _make_delay_fn(), _make_filter_fn() (+33 more)

### Community 62 - "valid_graph"
Cohesion: 0.07
Nodes (50): _error_branch_unsupported(), GraphValidationError, _is_annotation(), _is_number(), _node_data(), ValueError, Validate canvas graph before save or compile. Returns summary metadata., True when this node config compiles to a bare ADK Agent (no route interception). (+42 more)

### Community 63 - "run_concurrency.py"
Cohesion: 0.17
Nodes (19): Per-workflow budget enforcement: cost/day, runs/hour, tokens/run. Budgets live…, active_run_ids(), Run ids that currently have a live in-process asyncio task., count_active_runs(), datetime, Session, Concurrency accounting for workflow runs. The concurrency gate must reflect…, Count runs that could still be executing, ignoring stale orphans. In ``inline``… (+11 more)

### Community 64 - "test_iteration_node.py"
Cohesion: 0.33
Nodes (17): _ctx(), _iter_fn(), Tests for the iteration node (map-over-list, Dify-style single-node loop). The…, _run(), test_iteration_empty_items_yields_empty_array(), test_iteration_fail_on_error_raises(), test_iteration_hard_cap_100(), test_iteration_item_template_sees_normal_context() (+9 more)

### Community 65 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @next/bundle-analyzer, postcss, tailwindcss (+11 more)

### Community 66 - "layout.tsx"
Cohesion: 0.20
Nodes (8): metadata, plexMono, plexSans, Toaster, viewport, MotionProvider(), TooltipProvider(), QueryProvider()

### Community 67 - "useRunReplay.ts"
Cohesion: 0.16
Nodes (16): PostRunTransport(), PostRunTransportProps, RunProgressStrip(), RunProgressStripProps, useElapsedSeconds(), deriveState(), isCompletedStatus(), isFailedStatus() (+8 more)

### Community 68 - "api/node_test.py"
Cohesion: 0.36
Nodes (8): Ephemeral node-test and expression-preview endpoints (canvas authoring aids).…, ContextAvailable, ExpressionPreviewRequest, ExpressionPreviewResponse, NodeTestRequest, NodeTestResponse, BaseModel, Schemas for ephemeral single-node testing and expression preview. Both…

### Community 69 - "02 Split Studio Homepage Mockup"
Cohesion: 0.15
Nodes (18): Aegis Visual Agent Workflow Workbench, Bone and Monochrome Chrome, 02 Split Studio Homepage Mockup, Invoice Processing Pipeline, Last Run Summary, Open Canvas Action, Pipeline Graph Preview, Color-Coded Pipeline Nodes (+10 more)

### Community 70 - "node-registry.ts"
Cohesion: 0.10
Nodes (19): accent, ACCEPTS_NOUN, EXPRESSION_HINT, guardrailHasRule(), isBlank(), KIND_NOUN, LintIssue, LintRule (+11 more)

### Community 71 - "eval_preset_service.py"
Cohesion: 0.30
Nodes (16): EvaluationPreset, build_eval_instruction(), _batch_load_custom_presets(), builtin_preset_rows(), enrich_graph_eval_presets(), get_preset_config(), list_all_presets(), list_user_presets() (+8 more)

### Community 72 - "BaseNode.tsx"
Cohesion: 0.13
Nodes (22): BaseNode, BORDER_BY_STATE, ExtendedNodeData, formatTokens(), NodeChipRow(), NodeRuntimeState, NodeTelemetry, Props (+14 more)

### Community 73 - "dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, clsx, framer-motion, dependencies, class-variance-authority, clsx, framer-motion, next (+9 more)

### Community 74 - "Attention Inbox layout"
Cohesion: 0.14
Nodes (17): Approvals queue, Bone monochrome chrome, data/warehouse-sync-pipeline failed run, Editorial Aegis home page header, Monospace error log trace, Failed runs queue, Failure metadata header, Attention Inbox layout (+9 more)

### Community 75 - "workflows.py"
Cohesion: 0.20
Nodes (22): create_workflow(), import_workflow(), list_workflows(), patch, Workflow, Create a new workflow from an aegis-workflow-v1 export JSON., update_workflow(), BaseModel (+14 more)

### Community 76 - "experiments.py"
Cohesion: 0.27
Nodes (15): _check_version(), create_experiment(), experiment_gate(), ExperimentCreate, get_experiment(), list_experiments(), BaseModel, get (+7 more)

### Community 77 - "guardrail.py"
Cohesion: 0.11
Nodes (35): _guardrail_pm(), GuardrailResult, LlmGuardrailVerdict, ModerationVerdict, _parse_schema(), _pm_unavailable(), PromptInjectionVerdict, Any (+27 more)

### Community 78 - "CanvasToolbar.tsx"
Cohesion: 0.20
Nodes (10): CANVAS_RAIL_ITEMS, CanvasRail(), CanvasRailItem, CanvasRailProps, CanvasRailTab, CanvasToolbar(), ToolbarButton(), Tooltip() (+2 more)

### Community 79 - "search.py"
Cohesion: 0.40
Nodes (8): run_search(), search_duckduckgo(), search_exa(), asyncio, patch, test_run_search_duckduckgo(), test_run_search_exa_without_key(), test_search_duckduckgo_formats_results()

### Community 80 - "test_rag_metrics.py"
Cohesion: 0.20
Nodes (11): Any, BaseModel, rag_aggregate(), RagScores, RAG-specific evaluation scorers. Standard RAG quality dimensions an LLM judge…, Mean of the three RAG dimensions (1-5), rounded., Score a RAG triple. Returns per-dimension scores + aggregate, or a skip/error…, score_rag() (+3 more)

### Community 81 - "TokenTrackerPlugin"
Cohesion: 0.14
Nodes (14): Wrap a single node between a trigger and end for single-node execution., Execute one variant as a single-node LLM run, capturing telemetry. Reuses the…, _run_single_node_variant(), _single_node_graph(), estimate_cost_usd(), Any, BasePlugin, Per-run token and cost accounting via ADK plugin callbacks. ADK 2.x's workflow… (+6 more)

### Community 82 - "TracePlugin"
Cohesion: 0.27
Nodes (7): Any, BasePlugin, Exception, Per-run tool-call capture via ADK plugin callbacks (Trust-layer trace tree).…, Accumulates tool-call spans (name/args/result/timing) per ADK agent., _summarize(), TracePlugin

### Community 83 - "CanvasSidebar.tsx"
Cohesion: 0.12
Nodes (22): CanvasSidebar(), CanvasSidebarProps, RunComparison, SidebarTab, TabPanelFade(), tabs, VersionHistory, WorkflowDataPanel (+14 more)

### Community 84 - "llm_providers/__init__.py"
Cohesion: 0.11
Nodes (25): _build_eval_prompt(), evaluate_content_async(), _evaluate_content_sync(), evaluate_node_async(), Any, Parallel and deferred evaluation execution (LLM + deterministic)., Evaluate multiple nodes concurrently. Returns (node_id, scores, error)., Judge the content as a response to the original request when we have it —… (+17 more)

### Community 85 - "WorkflowContext"
Cohesion: 0.12
Nodes (12): Any, Mutable workflow context passed through node execution., Accumulates run input and per-step outputs for expression mapping., Snapshot safe for metrics/SSE — excludes workflow memory., WorkflowContext, test_batch_last_scheduled_run_at_empty(), test_build_summary_fetches_runs_once(), test_workflow_context_snapshot_truncates_large_outputs() (+4 more)

### Community 86 - "schedule_info.py"
Cohesion: 0.14
Nodes (25): cron_is_valid(), cron_next_runs(), datetime, Cron expression helpers for schedule triggers., batch_last_scheduled_run_at(), is_scheduled_run_input(), last_scheduled_run_at(), list_user_scheduled_workflows() (+17 more)

### Community 87 - "run_sandboxed_code"
Cohesion: 0.18
Nodes (15): _execute_code(), Any, Queue, Restricted Python execution for the Code node (n8n-style). Runs user code in a…, Child process entry: run code and put (ok, payload) on the queue., Expose only loads/dumps — never the stdlib module (avoids codecs.sys escape)., run_sandboxed_code(), _SafeJsonNamespace (+7 more)

### Community 88 - "regex_safety.py"
Cohesion: 0.16
Nodes (16): _alternation_branches_overlap(), _body_has_unbounded_quantifier(), _branch_profile(), _has_catastrophic_structure(), _iter_quantified_groups(), ValueError, Guardrails against catastrophic backtracking in user-supplied regex patterns.…, Yield the inner body of every group immediately followed by an unbounded… (+8 more)

### Community 89 - "meta.py"
Cohesion: 0.24
Nodes (15): list_models(), list_node_types(), ops_config(), preview_cron(), preview_guardrail(), get, post, UUID (+7 more)

### Community 90 - "api/credentials.py"
Cohesion: 0.29
Nodes (12): create_credential(), delete_credential(), list_credentials(), delete, get, post, Session, UUID (+4 more)

### Community 91 - "test_moderation_guardrail.py"
Cohesion: 0.27
Nodes (9): _evaluate_moderation_scores(), Map category scores + thresholds to a verdict. Pure and side-effect-free so it…, Trust-layer Phase 3: moderation/toxicity guardrail rail. Covers the pure…, test_above_default_threshold_flags(), test_below_threshold_passes(), test_custom_single_threshold(), test_malformed_scores_do_not_crash(), test_per_category_thresholds_override_default() (+1 more)

### Community 92 - "Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions"
Cohesion: 0.22
Nodes (11): Aegis visual agent-workflow workbench — observability/triage surface for LLM agent workflows, Aegis design language — warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Filter/search toolbar — 'Search workflows…', All Status, All Versions, Last 30d filters, List/Table view toggle, Templates, primary 'New workflow' button, 04-instrument-table.jpg — 'Instrument Table' homepage UI mockup for Aegis, Instrument Table layout — homepage concept: dense tabular inventory of agent workflows ('42 active workflows • 7 running'), Pagination footer — '1–25 of 142' with prev/next controls, Per-row action controls — run (play), edit (pencil), overflow menu, plus bulk-select checkboxes, Color-coded status pill system — SUCCESS (green), RUNNING (amber), FAILED (red); success-rate text colored green/red (+3 more)

### Community 93 - "AppRail.tsx"
Cohesion: 0.27
Nodes (8): AppRail(), AppRailProps, openCommandPalette(), isActivePath(), NavItem, navItems, Toaster(), useTheme()

### Community 94 - "ThemeProvider.tsx"
Cohesion: 0.35
Nodes (9): applyTheme(), getStoredTheme(), persistTheme(), Theme, THEME_STORAGE_KEY, readDomTheme(), ThemeContext, ThemeContextValue (+1 more)

### Community 95 - "Competitive analysis — Aegis vs. the market"
Cohesion: 0.15
Nodes (12): 1. The strategic read, 2. Missing features (prioritized), 3. Existing features that need polishing / fixing, 4. Suggested sequencing (if the ROADMAP gets revised), Competitive analysis — Aegis vs. the market, Fix — correctness, safety, and trust holes, P0 — adoption blockers; every serious competitor has them, P1 — expected by platform buyers; absence is conspicuous (+4 more)

### Community 96 - "get"
Cohesion: 0.24
Nodes (11): batch_eval_snippets(), compare_runs(), eval_history(), _extract_run_eval_metrics(), _flatten_eval_scores(), list_scheduled_workflows(), get, WorkflowRun (+3 more)

### Community 97 - "experiment_runner.py"
Cohesion: 0.44
Nodes (9): _aggregate(), Any, UUID, Batch experiments: run a dataset against workflow version(s), score, compare.…, run_experiment(), _run_one_item(), _run_version_over_items(), _session() (+1 more)

### Community 98 - "Homepage mockup 05: Directory / Quiet Index (Workflows index page)"
Cohesion: 0.24
Nodes (10): Data typography: IBM Plex Mono for identifiers, versions, dates and the font badge; sans-serif for descriptions and headings, Aegis design language: warm near-black surfaces, bone/monochrome chrome, hairline dividers, color reserved for status and data, Homepage mockup 05: Directory / Quiet Index (Workflows index page), Monochrome status treatment: 'published' rendered as plain bone text, not a colored badge — color withheld even for status in the quiet index, Page header: oversized 'Workflows' title with descriptive subline 'Orchestrate, version, and publish internal automation sequences. 12 total', Directory / Quiet Index layout: calm, table-first index page with generous whitespace, no cards or dashboards, Sample workflow entries: onboard-new-hire, fraud-alert-escalate, daily-recon-csv, api-key-rotate, vendor-onboarding, incident-triage (6 of 12 shown), Quiet search input: hairline-outlined 'Search workflows…' field with magnifier icon, narrow width (+2 more)

### Community 99 - "Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions"
Cohesion: 0.27
Nodes (10): Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions, macOS-style window chrome: traffic-light dots top-left, centered 'Aegis' title, Master-Detail layout pattern, Mixed typography: serif display face for detail title, monospace face for description and metadata, Aegis homepage mockup: master-detail workflow browser, Open (ghost/outlined) and Run (filled warm-taupe primary) action buttons, Selected list row highlighted with warm taupe/bone fill (Compliance Audit Trail), Warm near-black surfaces with bone/monochrome chrome; warm taupe accent reserved for selection and primary action (+2 more)

### Community 100 - "useRunInput.ts"
Cohesion: 0.39
Nodes (7): coerce(), deriveFields(), normalizeField(), readStored(), RunField, StoredInput, useRunInput()

### Community 101 - "api/alerts.py"
Cohesion: 0.22
Nodes (17): AlertRuleCreate, AlertRuleUpdate, create_rule(), delete_rule(), list_events(), list_rules(), AlertRule, BaseModel (+9 more)

### Community 102 - "validate_structured_output"
Cohesion: 0.27
Nodes (11): Parse ``text`` as JSON and validate it against ``schema``. Pure — no LLM.…, Enforce a JSON schema on output; on failure, re-ask the model to repair it…, validate_against_schema(), validate_structured_output(), Structured-output guardrail: JSON-schema validation + bounded re-ask. The re-…, test_invalid_output_without_key_fails(), test_json_missing_required_field_fails(), test_no_schema_configured_passes_with_warning() (+3 more)

### Community 103 - "test_agentops_phase3.py"
Cohesion: 0.14
Nodes (21): GuardrailPolicy, Named, reusable guardrail rule bundle., check_workflow_budget(), Session, Workflow, Return a breach reason, or None when the run may proceed., tokens_per_run_limit(), db_session() (+13 more)

### Community 104 - "test_experiment_gate.py"
Cohesion: 0.39
Nodes (7): Trust-layer Phase 2: GET /api/experiments/{id}/gate CI regression gate. Wraps a…, _seed_experiment(), test_gate_failed_regression_and_strict_409(), test_gate_not_applicable_for_batch(), test_gate_passed_regression(), test_gate_pending_while_running(), _verdict()

### Community 105 - "Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc"
Cohesion: 0.33
Nodes (9): Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc, Design language: warm near-black panel on stained aged paper, bone monospace/typewriter type, red ink reserved for annotation/status, Workflow lifecycle log entries: 'Published v2 fraud-alert', 'Eval suite failed - 3 cases', 'Edited guardrail transaction-volume', 'Workflow forked refund-arbiter', Field-log metaphor: agent workflow archive rendered as a scientist's chronological lab notebook with volume/instrument metadata, Handwritten red-ink marginalia annotations: 'retry queue', 'human review suspected', 'observe drift inside docker', 'data drift review upcoming', 'see notebook vol. 16', 'run-8842', Boxed '+' button labeled 'NEW ENTRY / NEW WORKFLOW' in top-right of the log panel, Observability/triage surface framing: eval failures, guardrail threshold edits, drift, regressions, and forks presented as auditable history, Initialed authorship per entry (-M, -S, -K, -L) implying multi-operator triage journal (+1 more)

### Community 106 - "Node type system: 30 types across 6 categories synced across both apps"
Cohesion: 0.32
Nodes (8): frontend/src/components/canvas/nodes/* (per-type canvas renderers), app/services/node_registry.py (canonical node-type metadata served to UI), frontend/src/lib/node-registry.ts (labels/icons/categories palette), frontend/src/types/workflow.ts (NodeType union + node data types), Node type system: 30 types across 6 categories synced across both apps, Canvas to ADK node type mapping, Canvas re-skin (custom nodes, gradient edges, inspector), 7-category node color system

### Community 107 - "Command Home Layout (Aegis Workbench Homepage)"
Cohesion: 0.36
Nodes (8): Command Palette Search Bar (Search workflows, runs, or jump to... ⌘K), Aegis Design Language (warm near-black surfaces, bone/monochrome chrome, color reserved for status and data), Command Home Layout (Aegis Workbench Homepage), Needs Attention Triage Rail (Failed Runs with Dismiss Controls), Quick Action Cards (New Workflow, Browse Templates, View Failed Runs), Recent Workflows Card Grid with Sparkline Thumbnails, Status Badge System (PUBLISHED green, FAILED red, version chips), Top Navigation Bar (Aegis Workbench logo, Workflows/Runs/Agents/Templates, user avatar)

### Community 108 - "Mission Control layout (named concept: fleet-wide observability overview of all workflows)"
Cohesion: 0.43
Nodes (8): Aegis Workbench product (visual agent-workflow workbench: React Flow canvas, observability/triage surface), KPI stat-card strip (Active runs 37, Failed 24h 9, Published 84, Avg latency 142ms) with status-colored dots, Live activity feed right rail (Last 15 min run events: run started, step timeout failure, completed run with confidence, queued runs), Mission Control layout (named concept: fleet-wide observability overview of all workflows), Homepage mockup 03: Mission Control Workflows overview, Status-only color design language (warm near-black surfaces, bone/monochrome chrome, green/amber/red reserved for status and data), Top navigation bar (Aegis Workbench brand, Workflows/Observability/Guardrails/Settings tabs, workflow search, New workflow CTA), Workflows table (name, version, publish state pill, run status pill, last-updated; Running/Paused/Failed color coding)

### Community 109 - "Workflows map view (Aegis header 'Aegis | Workflows map')"
Cohesion: 0.29
Nodes (8): Left-to-right directed graph (DAG) layout of workflow nodes with thin light edges and directional arrows, LIST toggle button in top-right header (map/list view switcher), Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold, System Map / Workflows map UI mockup (08-system-map.jpg), Warm near-black canvas surface with bone/monochrome chrome; no color used (color reserved for status/data), Selected-node detail card: 'core-orchestrator v2.4', 'last run: 11m ago', 'Open ->' button, anchored adjacent to highlighted node, Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv, Workflows map view (Aegis header 'Aegis | Workflows map')

### Community 110 - "Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk"
Cohesion: 0.32
Nodes (8): Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk, Warm near-black background with faint graph-paper grid texture, evoking both a physical desk and the React Flow canvas, Physical-desk metaphor details: paperclip on Q3 FORECAST ADJUST card, slight rotations, overlapping layering, paper-grain card textures, Bold condensed uppercase display typography for workflow names on cards, contrasted with small monospace-style version/recency labels, Minimal bone-on-black chrome: 'Aegis' wordmark top-left, 'Browse all ->' link top-right; no other navigation, Empty dashed-outline slots labeled 'Pin workflow' with '+' markers: affordance for adding workflows to the spatial desk, doubling as empty-state placeholder, Version + recency metadata per card (v4.1/YESTERDAY, v2/MONDAY, v3/TODAY, v1/2WKS) with muted green, rust, and olive accents: color reserved for status/data per design language, Scattered tilted workflow cards (INVOICE RECONCILE v4.1, SUPPLIER ONBOARD v2, Q3 FORECAST ADJUST v3, CERT RENEWALS v1) rendered as overlapping pinned index/polaroid cards with varied bone, tan, and gray paper tones

### Community 111 - "edit_graph"
Cohesion: 0.16
Nodes (18): AssistHistoryTurn, AssistHistoryTurn, One prior turn of a copilot thread. ``role`` is ``"user"`` (a past instruction)…, _capped_history(), edit_graph(), _format_history(), _history_cache_fragment(), EditGraphResponse (+10 more)

### Community 112 - "Aegis homepage mockup 06: Quiet Table (Workflows list view)"
Cohesion: 0.33
Nodes (7): Aegis design language: warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Aegis homepage mockup 06: Quiet Table (Workflows list view), Primary actions: Templates ghost button and filled bone New workflow + button, Quiet Table layout, Status filter tabs: All / Published / Draft, Top navigation chrome: AEGIS shield logo, Workflows/Agents/Templates/Runs/Settings, v4.12 prod environment badge, Workflows list table with Name, Version, Updated columns and rows like Lead Qualification Agent v2.4

### Community 113 - "Terminal Shell layout"
Cohesion: 0.33
Nodes (7): CLI/terminal metaphor for the agent workbench: workflows and runs operated via shell commands instead of GUI panels, Command header: 'aegis >' prompt with block cursor; right-aligned 'AEGIS AGENT WORKBENCH v0.14.3 · session 47 · 03:41 UTC' on a raised title band, Warm near-black surface with bone/monochrome monospace text; amber/gold reserved for command echoes and accent data, 'recent runs' timestamped log: run IDs (name#hash), status (completed/failed), duration, and inline metrics (score:0.97, flagged:3, ERR: timeout, routed:2, stage:verify), Bottom status bar: left 'tab complete · type new · open <name> · last sync 41s ago'; right '↑ 3 workflows running · agents: 12 online', Terminal Shell layout, '$ list workflows' output table: NAME / VERSION / UPDATED columns with dashed separators (lead-qualifier 2.3.1, fraud-detector 4.1.0, contract-analyzer 1.9.4, escalation-router 3.0.2, onboarding-flow 2.7.1)

### Community 114 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, analyze, build, dev, lint, start, typecheck

### Community 115 - "persistent_memory.py"
Cohesion: 0.20
Nodes (16): get_workflow_memory(), BaseModel, WorkflowMemoryEntry, WorkflowMemoryResponse, clear_workflow_memory(), flush_memory_writes(), load_workflow_memory(), merge_memory_into_context() (+8 more)

### Community 116 - "auth.ts"
Cohesion: 0.26
Nodes (13): SettingsPage(), request(), ApiKeyAuditAction, ApiKeyAuditEntry, appendAuditEntry(), authHeaders(), clearApiKey(), getApiKey() (+5 more)

### Community 117 - "012_run_spans_tags_sessions.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 118 - "013_alert_baseline_comparison.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 119 - "test_mvp2_foundation.py"
Cohesion: 0.21
Nodes (5): _make_workflow(), Tests for MVP2 backend foundation: timeline, deploy, dashboards, crypto, cost…, test_cost_alert_rule_is_supported(), test_deploy_descriptor_after_publish_includes_mcp_tool(), test_deploy_descriptor_requires_published_version()

### Community 120 - "kb_cache.py"
Cohesion: 0.40
Nodes (5): load_workflow_kb_documents(), Any, Session, UUID, Per-run knowledge document cache.

### Community 121 - "Evaluation rigor: online evals + CI gates (P1.2)"
Cohesion: 0.40
Nodes (6): Evaluation rigor: online evals + CI gates (P1.2), Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5), P0: misleading eval chroma (1-5 scores banded on 0-1), User-defined eval presets & weighting (EvaluationPreset model), Deterministic evaluators (exact/substring, regex, embedding similarity), OpenTelemetry tracing export (Jaeger/LangFuse/Datadog)

### Community 122 - "Glass & glow visual language"
Cohesion: 0.33
Nodes (6): Motion primitives (PageEnter, StaggerList, HoverLift, NumberTween, useGlowPulse), Reduced-motion gating (useReducedMotionStrict), Design token system (CSS variables + Tailwind config), Glass & glow visual language, Design-system quality bar (instrument aesthetic, chroma for data only), Hardcoded white sheen vs --surface-highlight token (light theme loses lift)

### Community 123 - "test_phase4.py"
Cohesion: 0.24
Nodes (10): mask_credential_config(), clear_pg_engine_for_url(), Dispose and evict a cached Postgres engine (e.g. after credential delete)., In-memory dedup helper (tests); production uses DB-backed last_fired_at., should_fire_schedule(), asyncio, test_clear_pg_engine_for_url_evicts_cached_engine(), test_mask_credential_config_hides_secrets() (+2 more)

### Community 124 - "setup.sh"
Cohesion: 0.39
Nodes (10): allocate_ports(), apply_port_env(), copy_untracked_files(), error(), info(), install_deps(), persist_ports(), port_in_use() (+2 more)

### Community 125 - "_SafetyVisitor"
Cohesion: 0.18
Nodes (6): Attribute, _SafetyVisitor, Call, Import, ImportFrom, Name

### Community 126 - "KnowledgeBulkImport"
Cohesion: 0.60
Nodes (4): KnowledgeBulkImport, KnowledgeDocumentCreate, KnowledgeDocumentResponse, BaseModel

### Community 127 - "Phase 1 Truthful runtime"
Cohesion: 0.50
Nodes (4): LLM-call traces (llm_calls table, gen_ai.* spans), North star loop Build to Run to Trust, Phase 1 Truthful runtime, Token and cost accounting via ADK plugin

### Community 128 - "009_agentops_tables_backfill.py"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 129 - "011_workflow_templates.py"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 130 - "extends"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 131 - "test_audit_p1_p2_fixes.py"
Cohesion: 0.11
Nodes (20): Helpers for standard Trigger → … → End workflow graphs., Prepend Trigger and append End, wiring entry/exit automatically. When…, wrap_graph_with_trigger_end(), _linear_graph(), asyncio, WorkflowRun, Integration coverage for previously-dark critical paths (audit P1/P2). Targets…, _run_status() (+12 more)

### Community 133 - "presidio-analyzer + presidio-anonymizer dependency"
Cohesion: 0.67
Nodes (3): Phase 3 Guardrails as policy layer, presidio-analyzer + presidio-anonymizer dependency, Guardrail playground (rules, Presidio PII, prompt injection, LLM classifier)

### Community 142 - "Multi-model / multi-provider support (P0.1)"
Cohesion: 0.67
Nodes (3): Gemini-only runtime constraint, Multi-model / multi-provider support (P0.1), Provider abstraction (LiteLLM-style shim)

### Community 143 - "Guardrail engine (blocklist/regex/PII, block vs warn)"
Cohesion: 0.67
Nodes (3): Guardrail engine (blocklist/regex/PII, block vs warn), Advanced PII (Microsoft Presidio) + prompt injection shield, Guardrail graceful fallbacks & PII masking/redaction

### Community 144 - "Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)"
Cohesion: 0.67
Nodes (3): shadcn/ui primitive migration (Radix-backed), P0: dead focus ring (Tailwind v4 ring-3 in v3 build), Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)

### Community 146 - "Aegis Frontend UI/UX Audit 2026-07-11"
Cohesion: 0.67
Nodes (3): Aegis Frontend UI/UX Audit 2026-07-11, Mobile canvas layout-lock mode, text-2xs Tailwind token consolidation

### Community 150 - "test_compiler.py"
Cohesion: 0.17
Nodes (14): _safe_eval(), topological_sort(), test_compile_agent_default_model_is_gemini_string(), test_compile_agent_openai_model_uses_litellm(), test_compile_evaluation_node_honors_openai_model(), test_compile_google_search_enables_server_side_tool_invocations(), test_compile_google_search_tool_stays_gemini_despite_model_override(), test_compile_llm_preset_nodes_honor_anthropic_model() (+6 more)

### Community 151 - "ObservabilityStreamProvider.tsx"
Cohesion: 0.29
Nodes (7): isTerminalObservabilityEvent(), ObservabilityListener, ObservabilityStreamContext, ObservabilityStreamContextValue, ObservabilityStreamProvider(), ObservabilityStreamStatus, TERMINAL_EVENTS

### Community 157 - "test_run_concurrency.py"
Cohesion: 0.27
Nodes (10): datetime, WorkflowRun, Guards for the run-concurrency gate: orphaned pending/running runs must not…, Create a run whose created_at is `age_seconds` in the past (naive UTC to match…, A pending run older than the staleness window must not count toward the gate —…, sweep_stale_runs marks stale pending/running rows failed and leaves fresh ones…, _seed_run(), test_count_active_runs_excludes_stale_orphans() (+2 more)

### Community 158 - "HighlightedSample.tsx"
Cohesion: 0.33
Nodes (9): escapeRegExp(), findKeywordMatches(), findPiiMatches(), HighlightedSample(), HighlightedSampleProps, MatchSpan, mergeSpans(), PII_PATTERNS (+1 more)

### Community 159 - "015_run_overrides_and_index.py"
Cohesion: 0.42
Nodes (7): _columns(), downgrade(), _indexes(), _inspector(), upgrade(), JSONType, TypeDecorator

### Community 160 - "workflow-import.ts"
Cohesion: 0.33
Nodes (5): parseWorkflowExport(), readWorkflowExportFile(), WORKFLOW_EXPORT_FORMAT, WorkflowExportPayload, WorkflowImportError

### Community 161 - "test_routing_adk2.py"
Cohesion: 0.48
Nodes (6): _branch_graph(), Regression: conditional routing must work under ADK 2.x. ADK 2.x routes…, _run_graph(), test_if_decision_is_not_leaked_as_output(), test_if_routes_correct_branch(), parametrize

### Community 211 - "teardown.sh"
Cohesion: 0.62
Nodes (6): info(), kill_dev_servers(), kill_port(), release_port(), teardown.sh script, warn()

### Community 212 - "broadcast_observability_event"
Cohesion: 0.20
Nodes (16): broadcast_observability_event(), Any, Queue, User-scoped SSE fan-out for live observability updates., stream_observability_events(), subscribe_observability(), unsubscribe_observability(), maybe_emit_eval_regression() (+8 more)

### Community 213 - "use-pinned-workflows.ts"
Cohesion: 0.62
Nodes (5): usePinnedWorkflows(), getPinnedWorkflowIds(), isWorkflowPinned(), setPinnedWorkflowIds(), togglePinnedWorkflow()

### Community 214 - "014_workflow_memory_unique.py"
Cohesion: 0.73
Nodes (5): downgrade(), _existing_indexes(), _existing_tables(), _inspector(), upgrade()

### Community 215 - "CanvasContextMenu.tsx"
Cohesion: 0.60
Nodes (5): CanvasContextMenu(), CanvasContextMenuProps, ContextMenuItem, firstEnabledIndex(), isSeparator()

### Community 217 - "node_registry.py"
Cohesion: 0.50
Nodes (4): get_node_meta(), NodeTypeMeta, Canonical node type metadata for the agentic workflow builder., TypedDict

### Community 218 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 219 - "useGraphHistory.ts"
Cohesion: 0.50
Nodes (3): GraphSnapshot, UseGraphHistoryOptions, UseGraphHistoryReturn

## Ambiguous Edges - Review These
- `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` → `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`  [AMBIGUOUS]
  docs/design/homepage-mockups/08-system-map.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **455 isolated node(s):** `run.sh script`, `next/core-web-vitals`, `next/typescript`, `$schema`, `style` (+450 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **55 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` and `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `cn` to `workflow.ts`, `api`, `QuickAddMenu.tsx`, `CostDashboard.tsx`, `settings/page.tsx`, `utils.ts`, `WorkflowCanvas.tsx`, `button.tsx`, `new/page.tsx`, `CanvasTour.tsx`, `observability/page.tsx`, `WorkflowDataPanel.tsx`, `RunDeck.tsx`, `GuardrailPlayground.tsx`, `BaseNode.tsx`, `CanvasToolbar.tsx`, `CanvasSidebar.tsx`, `CanvasContextMenu.tsx`, `AppRail.tsx`, `auth.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `validate_workflow_graph()` connect `valid_graph` to `UUID`, `platform.py`, `test_run_from_here.py`, `compiler.py`, `workflows.py`, `edit_graph`, `test_assist.py`, `schedule_worker.py`, `api/templates.py`, `runs.py`, `test_error_routing.py`, `services/assist.py`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `react` connect `cn` to `dependencies`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `run.sh script`, `next/core-web-vitals`, `next/typescript` to the rest of the system?**
  _455 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `observability_service.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06171025565677343 - nodes in this community are weakly interconnected._
- **Should `workflow.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.027133872416891285 - nodes in this community are weakly interconnected._