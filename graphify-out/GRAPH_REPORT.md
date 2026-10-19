# Graph Report - aegis  (2026-10-19)

## Corpus Check
- 528 files · ~596,449 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5571 nodes · 14923 edges · 291 communities (234 shown, 57 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 297 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `58161749`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- workflows.py
- observability_service.py
- api.ts
- prompts.py
- event_bus.py
- app/page.tsx
- persistent_memory.py
- services/alerts.py
- Aegis Competitive Landscape: Deep Research Report
- services/credentials.py
- approval_service.py
- cn
- deps.py
- CostDashboard.tsx
- guardrail_policies.py
- WorkflowCanvas.tsx
- templates/page.tsx
- P2 defects (53)
- job_queue.py
- Pillar 2: Distributed, Resilient Execution Fabric
- runs.py
- url_safety.py
- new/page.tsx
- app/main.py
- api/assist.py
- GuardrailJudgeUnavailableError
- services/assist.py
- models.py
- GuardrailPolicyPlugin
- executor.py
- CanvasTour.tsx
- test_guardrail_advanced.py
- observability/page.tsx
- run_sandboxed_code
- platform.py
- button.tsx
- RunDeck.tsx
- test_executor.py
- validate_structured_output
- test_run_from_here.py
- datasets.py
- test_checkpoints.py
- services/node_test.py
- test_model_matrix.py
- test_experiment_gate.py
- compilerOptions
- render_template
- NodeSpanTracker
- test_assist.py
- schedule_worker.py
- eval_presets.py
- api/templates.py
- test_error_routing.py
- components.json
- index.ts
- test_assist_history.py
- test_upgrade_phase3.py
- validate_guardrail_content
- test_node_test_api.py
- test_assist_mvp2.py
- eval.py
- compiler.py
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
- observability_rollups.py
- experiments.py
- CommandPalette.tsx
- HeaderActions.tsx
- workflow_capabilities.py
- model_call_span
- TokenTrackerPlugin
- test_rag_v1.py
- CanvasSidebar.tsx
- llm_providers/__init__.py
- test_agent_tools_runtime.py
- sync_workflow_schedule
- RunDetailView.tsx
- regex_safety.py
- test_audit_p1_p2_fixes.py
- conftest.py
- guardrail.py
- Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions
- graph_validation.py
- mcp_client.py
- Competitive analysis — Aegis vs. the market
- db/__init__.py
- agent_tools.py
- Homepage mockup 05: Directory / Quiet Index (Workflows index page)
- Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions
- useRunInput.ts
- api/alerts.py
- workflow.py
- test_agentops_phase3.py
- test_mvp2_foundation.py
- Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc
- Node type system: 30 types across 6 categories synced across both apps
- Command Home Layout (Aegis Workbench Homepage)
- Mission Control layout (named concept: fleet-wide observability overview of all workflows)
- Workflows map view (Aegis header 'Aegis | Workflows map')
- Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk
- tracing.py
- Aegis homepage mockup 06: Quiet Table (Workflows list view)
- Terminal Shell layout
- scripts
- api/credentials.py
- eval_runner.py
- 012_run_spans_tags_sessions.py
- 013_alert_baseline_comparison.py
- chat.ts
- kb_cache.py
- Evaluation rigor: online evals + CI gates (P1.2)
- Glass & glow visual language
- test_mcp_client.py
- setup.sh
- deploy_descriptor.py
- _run_single_node_variant
- Phase 1 Truthful runtime
- 009_agentops_tables_backfill.py
- 011_workflow_templates.py
- extends
- wrap_graph_with_trigger_end
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
- test_phase9.py
- Workflow
- Copper as dedicated active semantic token (not blanket warning)
- Bidirectional MCP (client + real server)
- RAG depth (Knowledge Pipeline)
- Phase 2 Release 1.5 - Stabilize
- Aegis UI overhaul implementation plan
- authenticate_event_webhook
- HighlightedSample.tsx
- ingest_otlp_run
- test_run_authoring.py
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
- test_upgrade_phase4.py
- use-pinned-workflows.ts
- 014_workflow_memory_unique.py
- vector_stores.py
- run.sh
- test_assist_eval_suite.py
- test_security_fixes.py
- mcp_server.py
- package.json
- cmdk
- lucide-react
- invoke_runner.py
- observability.py
- test_otlp_ingest.py
- quality_metrics.py
- test_reviewfix_auth.py
- test_langsmith_tracing.py
- test_chat_token.py
- test_mcp_server.py
- vector_search.py
- test_sqlite_uuid_affinity.py
- mark_node_started
- test_phase3_surfaces.py
- chat.py
- embeddings.py
- test_deployment_auth.py
- _handle_post
- retrieve_documents
- mcp_stdio_entry.py
- aegis_cli/main.py
- create_run
- upload_knowledge_document
- agent_tool_schema.py
- parse_document
- test_trace_search.py
- invoke
- meta.py
- Critical / High
- event_webhooks.py
- chat_session.py
- test_dataset_loop.py
- run_filters.py
- High
- .handle_async_request
- 010_encrypt_credential_secrets.py
- bugs.md
- Critical / High
- 026_event_triggers.py
- validate_mcp_tool_bindings
- 021_sqlite_uuid_affinity.py
- 029_workflow_version_number_unique.py
- 032_schedule_unique_entry.py
- LangSmithSpanExporter
- Backlog batches (P3, reconciled 2026-10-18; P2 batches below are landed)
- Verification pass (all findings re-checked against current source; live repros where cheap)
- Migrate from OpenAI Agent Builder to Aegis
- KnowledgeBulkImport
- services/__init__.py
- Fix status (P0 + P1 implementation)
- Round 3 (empirical verification + tail services + API contract + frontend rest + model/query layer)
- WorkflowMemoryEntry
- Aegis audit — round 1 findings
- Provider-aware cost estimates
- sonner
- tailwindcss-animate
- @tanstack/react-query
- aegis-cli

## God Nodes (most connected - your core abstractions)
1. `cn()` - 231 edges
2. `valid_graph()` - 117 edges
3. `_get()` - 91 edges
4. `validate_workflow_graph()` - 91 edges
5. `Button` - 62 edges
6. `api` - 53 edges
7. `Workflow` - 51 edges
8. `WorkflowVersion` - 51 edges
9. `compile_workflow()` - 49 edges
10. `_build_adk_node()` - 48 edges

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
- 3-file cycle: `backend/app/services/approval_service.py -> backend/app/services/event_bus.py -> backend/app/services/executor.py -> backend/app/services/approval_service.py`
- 5-file cycle: `backend/app/services/approval_service.py -> backend/app/services/event_bus.py -> backend/app/services/executor.py -> backend/app/services/compiler.py -> backend/app/services/node_handlers.py -> backend/app/services/approval_service.py`

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

## Communities (291 total, 57 thin omitted)

### Community 0 - "workflows.py"
Cohesion: 0.18
Nodes (34): batch_eval_snippets(), compare_runs(), create_knowledge_document(), delete_knowledge_document(), delete_workflow(), delete_workflow_memory(), duplicate_workflow(), eval_history() (+26 more)

### Community 1 - "observability_service.py"
Cohesion: 0.21
Nodes (25): merge_rollup_quality(), Blend rollup aggregates with recent-run detail metrics., build_dashboards(), build_guardrail_violations(), build_overview(), build_quality(), build_recent_runs(), build_summary() (+17 more)

### Community 2 - "api.ts"
Cohesion: 0.02
Nodes (135): extractVariables(), PlaygroundInner(), AgentToolsEditor(), AgentToolsEditorProps, toolKey(), ExpressionTextarea, ExpressionTextareaProps, Segment (+127 more)

### Community 3 - "prompts.py"
Cohesion: 0.06
Nodes (72): post, Session, UUID, Standalone prompt playground — run a template against N model targets without…, run_playground(), create_prompt(), create_version(), delete_prompt() (+64 more)

### Community 4 - "event_bus.py"
Cohesion: 0.06
Nodes (64): _as_uuid(), _catchup_sweep(), _consume_notifications(), delete_run_events(), _deliver_run_event(), _dispatch_new_events(), _drain_notifies(), fetch_run_events() (+56 more)

### Community 5 - "app/page.tsx"
Cohesion: 0.12
Nodes (34): buildContinueItems(), HomePage(), PromptsPage(), ContinueTiles(), HomePulseBar(), PulseStat(), PinnedPanel(), RecentActivityRail() (+26 more)

### Community 6 - "persistent_memory.py"
Cohesion: 0.24
Nodes (15): clear_workflow_memory(), flush_memory_writes(), load_workflow_memory(), merge_memory_into_context(), namespace_to_dict(), Any, Session, UUID (+7 more)

### Community 7 - "services/alerts.py"
Cohesion: 0.18
Nodes (26): AlertRule, Threshold rule evaluated by the scheduler tick., _breached(), evaluate_alert_rules(), _metric_over_window(), _metric_value(), _percentile(), AlertRule (+18 more)

### Community 8 - "Aegis Competitive Landscape: Deep Research Report"
Cohesion: 0.05
Nodes (38): Aegis Competitive Landscape: Deep Research Report, Architecture plays, Bibliography, Evals — strong for a builder, behind the dedicated tools, Executive Summary, Finding 1 — The market is large, fast-growing, and consolidating violently, Finding 2 — Four competitor tiers, each proving a different thesis, Finding 3 — OpenAI's exit validates the independent-tool thesis (and opens a window) (+30 more)

### Community 9 - "services/credentials.py"
Cohesion: 0.08
Nodes (43): _notification_data(), decrypt_credential_config(), encrypt_credential_config(), get_user_credential(), load_mcp_credential(), mask_credential_config(), Any, Session (+35 more)

### Community 10 - "approval_service.py"
Cohesion: 0.09
Nodes (50): ApprovalRequest, Durable approval wait truth; any process can resolve, waiters poll the row., _decision_from_state(), _key_run_id(), _keys_for_run(), _metadata(), notify_approval(), _on_remote_decision() (+42 more)

### Community 11 - "cn"
Cohesion: 0.03
Nodes (90): react, CanvasStatusBar(), TONE_CLASSES, CodeBlock(), DeploySheet(), DeploySheetBody(), DeployTab, isNoPublishedVersion() (+82 more)

### Community 12 - "deps.py"
Cohesion: 0.06
Nodes (54): alias, _api_key_user_map(), get_current_user_id(), get_owner_user_id(), Query, Request, UUID, Map api key -> (user_id, role). Values may be a bare uuid string or {"user_id":… (+46 more)

### Community 13 - "CostDashboard.tsx"
Cohesion: 0.06
Nodes (47): GuardrailVerdict, VerdictPanel(), AggregateKind, CellValue, CostBreakdownColumn, CostBreakdownRow, CostBreakdownTable(), CostBreakdownTableProps (+39 more)

### Community 14 - "guardrail_policies.py"
Cohesion: 0.17
Nodes (22): create_policy(), delete_policy(), _get_policy(), list_policies(), list_templates(), PolicyCreate, PolicyUpdate, BaseModel (+14 more)

### Community 15 - "WorkflowCanvas.tsx"
Cohesion: 0.06
Nodes (60): buildNodeRunMenuItems(), CanvasContextMenu(), CanvasContextMenuProps, ContextMenuItem, firstEnabledIndex(), isSeparator(), ClipboardStore, copyToClipboard() (+52 more)

### Community 16 - "templates/page.tsx"
Cohesion: 0.10
Nodes (31): CapabilityBadges(), complexityLabel(), FILTER_IDS, FILTER_OPTIONS, TemplateCard(), TemplateCardProps, TemplateFilter, templateFlags() (+23 more)

### Community 17 - "P2 defects (53)"
Cohesion: 0.06
Nodes (30): Aegis — Deep Backend + Frontend Audit (2026-08-07), Backend, Backend — concurrency, Backend — data layer, Backend — execution & API, Backend — handlers & security, Backend — observability & eval math, Backend test coverage (the audit's biggest gap) (+22 more)

### Community 18 - "job_queue.py"
Cohesion: 0.16
Nodes (23): job_status(), Session, UUID, Background job status API., bulk_import_knowledge(), post, reindex_knowledge(), BackgroundJob (+15 more)

### Community 19 - "Pillar 2: Distributed, Resilient Execution Fabric"
Cohesion: 0.06
Nodes (41): backend CI job (alembic upgrade head on SQLite + pytest), frontend CI job (npm typecheck + lint + build), migrations-postgres CI job (alembic upgrade head on pgvector/pgvector:pg16), CI GitHub Actions Workflow, cryptography>=42.0 (Fernet credential encryption) dependency, google-adk>=2.0 + google-genai dependency, sqlalchemy>=2.0 + alembic + psycopg2-binary dependency, Aegis — visual agent-workflow workbench (+33 more)

### Community 20 - "runs.py"
Cohesion: 0.14
Nodes (33): approve_run(), _as_utc(), _create_run_record(), export_run(), get_run(), get_run_llm_calls(), get_run_timeline(), get_run_trace() (+25 more)

### Community 21 - "url_safety.py"
Cohesion: 0.07
Nodes (43): get_http_client(), run_search(), search_duckduckgo(), search_exa(), _hostname_blocked(), _is_blocked_ip(), AsyncClient, Response (+35 more)

### Community 22 - "new/page.tsx"
Cohesion: 0.07
Nodes (33): DescribeWorkflowCard(), DescribeWorkflowCardProps, GeneratedNotes(), GeneratedWorkflow, describeShape, starterGraphs, StarterId, assistantHistoryContent() (+25 more)

### Community 23 - "app/main.py"
Cohesion: 0.05
Nodes (83): AbstractEventLoop, AsyncClient, Idempotent acquire of the process-shared HTTP client. Lifespans (API, worker)…, shutdown_http_client(), startup_http_client(), configure_logging(), StructuredFormatter, health() (+75 more)

### Community 24 - "api/assist.py"
Cohesion: 0.13
Nodes (38): compare(), draft_eval_suite(), edit_graph(), explain_run(), generate_schema(), generate_workflow(), _get_user_run(), DraftEvalSuiteResponse (+30 more)

### Community 25 - "GuardrailJudgeUnavailableError"
Cohesion: 0.08
Nodes (33): GuardrailBlockedError, GuardrailJudgeUnavailableError, _before_model_multipart(), _contents_to_text(), _decide_soft(), _decode_str_response(), _expects_json(), Any (+25 more)

### Community 26 - "services/assist.py"
Cohesion: 0.07
Nodes (56): AssistHistoryTurn, DraftedDataset, DraftedDatasetItem, DraftedEvalPreset, DraftEvalSuiteResponse, EdgeRef, EditGraphResponse, ExplainRunResponse (+48 more)

### Community 27 - "models.py"
Cohesion: 0.06
Nodes (38): _columns(), downgrade(), _indexes(), _inspector(), upgrade(), upgrade(), upgrade(), upgrade() (+30 more)

### Community 28 - "GuardrailPolicyPlugin"
Cohesion: 0.16
Nodes (28): GuardrailPolicyPlugin, BasePlugin, Applies a single guardrail policy to every agent's model input/output. ``mode``…, LlmResponse, parametrize, Workflow-level guardrail policy plugin (ADK callbacks). A single policy applied…, Mask sanitizes the aggregate, but the post-salvage recheck hits a production…, _request() (+20 more)

### Community 29 - "executor.py"
Cohesion: 0.08
Nodes (50): configure_runtime_env(), Unset IDE-local Gemini proxy vars that break direct API calls., Register the provider of run ids the catch-up sweep should poll., set_active_run_ids_provider(), _as_utc(), _cas_terminal_write(), _commit_db(), _consume_with_timeout() (+42 more)

### Community 30 - "CanvasTour.tsx"
Cohesion: 0.09
Nodes (35): SettingsPage(), FirstRunHero(), CanvasTour(), computePosition(), findVisibleAnchor(), Position, resolveStepIndex(), warnDev() (+27 more)

### Community 31 - "test_guardrail_advanced.py"
Cohesion: 0.22
Nodes (16): _analyzer_available(), _default_entities(), detect_pii_presidio(), _get_analyzer(), _get_anonymizer(), Any, Optional Microsoft Presidio integration for entity-based PII detection., redact_pii_presidio() (+8 more)

### Community 32 - "observability/page.tsx"
Cohesion: 0.07
Nodes (39): AnnotationQueue, AttentionItem, buildAttentionItems(), CostDashboard, KIND_STATUS, kindClass(), kindLabel(), ObservabilityPage() (+31 more)

### Community 33 - "run_sandboxed_code"
Cohesion: 0.09
Nodes (23): Attribute, _execute_code(), Any, Queue, Restricted Python execution for the Code node (n8n-style). Runs user code in a…, Child process entry: run code and put (ok, payload) on the queue., Expose only loads/dumps — never the stdlib module (avoids codecs.sys escape)., run_sandboxed_code() (+15 more)

### Community 34 - "platform.py"
Cohesion: 0.11
Nodes (37): deployment_descriptor(), GenericInvokePayload, get_deploy_descriptor(), get_published(), ingest_run(), IngestNodeEvent, IngestRunPayload, invoke_deployment() (+29 more)

### Community 35 - "button.tsx"
Cohesion: 0.05
Nodes (96): WorkflowCanvas, EdgeInspectorProps, ExperimentsPanel(), ExperimentsPanelProps, verdictBadge(), RunControlProps, UseRunInputResult, VersionHistory() (+88 more)

### Community 36 - "RunDeck.tsx"
Cohesion: 0.17
Nodes (28): asRecord(), eventClass(), EventGlyph(), eventLabel(), eventStatus(), eventTime(), formatElapsed(), metricNumber() (+20 more)

### Community 37 - "test_executor.py"
Cohesion: 0.07
Nodes (52): EvalThresholdBlockedError, Exception, _drain_queued_runs(), _enqueue_event(), _extract_delta_text(), _extract_text_from_event(), _extract_text_parts(), _extract_token_usage() (+44 more)

### Community 38 - "validate_structured_output"
Cohesion: 0.24
Nodes (12): Parse ``text`` as JSON and validate it against ``schema``. Pure — no LLM.…, Enforce a JSON schema on output; on failure, re-ask the model to repair it…, validate_against_schema(), validate_structured_output(), Structured-output guardrail: JSON-schema validation + bounded re-ask. The re-…, test_invalid_output_without_key_fails(), test_json_missing_required_field_fails(), test_no_schema_configured_passes_with_warning() (+4 more)

### Community 39 - "test_run_from_here.py"
Cohesion: 0.11
Nodes (31): _ancestors(), _node_data(), _node_type(), prune_graph_for_start(), ValueError, Authoring-only run helpers: pin outputs + run-from-here. These features let the…, All nodes that can reach ``node_id`` (strict upstream set)., Return a new graph that begins execution at ``start_node_id``. Strictly-… (+23 more)

### Community 40 - "datasets.py"
Cohesion: 0.07
Nodes (74): enqueue(), EnqueueRequest, label_task(), LabelRequest, list_queue(), AnnotationTask, BaseModel, post (+66 more)

### Community 41 - "test_checkpoints.py"
Cohesion: 0.10
Nodes (46): compute_resume(), mark_node_completed(), Any, WorkflowRun, Derive the resume plan for a run from its checkpoints and graph. Returns…, Upsert a ``completed`` checkpoint carrying the node's raw output. ``output`` is…, _linear_graph(), asyncio (+38 more)

### Community 42 - "services/node_test.py"
Cohesion: 0.14
Nodes (30): _build_test_context(), _cap_rendered(), _execute_node(), _format_result(), get_user_workflow(), _last_node_output(), latest_graph(), _latest_run_for_workflow() (+22 more)

### Community 43 - "test_model_matrix.py"
Cohesion: 0.08
Nodes (36): build_adk_model(), _looks_like_schema_rejection(), Exception, Resolve node/config data into a concrete :class:`ProviderModel`. Defaults to…, Return a value suitable for ``google.adk.Agent(model=...)``. Gemini stays a…, Whether the error plausibly blames the response_format/schema shape., resolve_provider_model(), apply_model_override() (+28 more)

### Community 44 - "test_experiment_gate.py"
Cohesion: 0.39
Nodes (7): Trust-layer Phase 2: GET /api/experiments/{id}/gate CI regression gate. Wraps a…, _seed_experiment(), test_gate_failed_regression_and_strict_409(), test_gate_not_applicable_for_batch(), test_gate_passed_regression(), test_gate_pending_while_running(), _verdict()

### Community 45 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 46 - "render_template"
Cohesion: 0.17
Nodes (20): _coerce_number(), evaluate_condition(), Any, Template expression rendering for workflow context (n8n-style mapping)., Replace ``{{path}}`` placeholders using workflow context., Evaluate a structured IF condition (n8n-style, expression operands)., Resolve a dotted ``{{path}}`` against the workflow context. Resolvable roots:…, _render_operand() (+12 more)

### Community 47 - "NodeSpanTracker"
Cohesion: 0.13
Nodes (15): _exported_context(), get_trace_id(), NodeSpanTracker, _parse_headers(), Context of the current span, only if it will actually be exported. An unsampled…, Tracks in-flight ADK node spans for a single workflow run., Attach OTel gen_ai semantic-convention attributes to a node span., A non-recording span has a valid context; persisting its id would point at a… (+7 more)

### Community 48 - "test_assist.py"
Cohesion: 0.20
Nodes (25): GenEdge, GeneratedWorkflowDraft, GenNode, A node as returned by Gemini structured output., SuggestionsDraft, _valid_edit_draft(), _invalid_draft(), _mock_response() (+17 more)

### Community 49 - "schedule_worker.py"
Cohesion: 0.08
Nodes (50): _claim_schedule_fire(), count_scheduled_workflows(), _create_scheduled_run_row(), cron_matches_now(), _dispatch_due_runs(), _evaluate_alerts(), _maybe_recover_stale_runs(), _maybe_run_retention() (+42 more)

### Community 50 - "eval_presets.py"
Cohesion: 0.20
Nodes (21): _as_list_item(), create_eval_preset(), delete_eval_preset(), list_eval_presets(), preview_eval_preset(), delete, patch, post (+13 more)

### Community 51 - "api/templates.py"
Cohesion: 0.19
Nodes (19): _builtin_items(), create_template(), list_eval_presets(), list_templates(), _persisted_item(), post, Session, UUID (+11 more)

### Community 52 - "test_error_routing.py"
Cohesion: 0.15
Nodes (19): _normalize_output(), Any, Wrap compiled node callables to maintain workflow context across execution. The…, Record upstream input and node output in the shared workflow context, applying…, wrap_with_context(), BaseModel, RouterDecision, _error_graph() (+11 more)

### Community 53 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 54 - "index.ts"
Cohesion: 0.18
Nodes (14): registry, StaggerRecord, useEntryStagger(), HoverLift(), Props, NumberTween(), Props, PageEnter() (+6 more)

### Community 55 - "test_assist_history.py"
Cohesion: 0.20
Nodes (20): AssistHistoryTurn, One prior turn of a copilot thread. ``role`` is ``"user"`` (a past instruction)…, _current_graph(), _last_prompt(), _mock_response(), patch, Tests for threaded copilot history on the edit-graph / suggest-nodes assist…, Absent/empty history -> no history block, endpoint behaves as before. (+12 more)

### Community 56 - "test_upgrade_phase3.py"
Cohesion: 0.14
Nodes (27): _alternation_risks_backtracking(), evaluate_embedding_similarity(), evaluate_exact(), evaluate_json_schema(), evaluate_numeric(), evaluate_regex(), evaluate_substring(), _has_nested_quantifier() (+19 more)

### Community 57 - "validate_guardrail_content"
Cohesion: 0.09
Nodes (38): _make_guardrail_fn(), apply_fail_behavior(), LlmGuardrailVerdict, ModerationVerdict, BaseModel, validate_content(), validate_guardrail_content(), parametrize (+30 more)

### Community 58 - "test_node_test_api.py"
Cohesion: 0.15
Nodes (25): EvalScores, BaseModel, _agent_workflow(), Tests for the ephemeral node-test and expression-preview endpoints. No test…, _seed_run(), _seed_workflow(), test_expression_preview_from_run_steps_resolution(), test_expression_preview_most_recent_run_when_no_run_id() (+17 more)

### Community 59 - "test_assist_mvp2.py"
Cohesion: 0.24
Nodes (19): _EditGraphDraft, _GeneratedSchemaDraft, Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)., Gemini structured-output shape. schema_object_json is a JSON-encoded string…, _current_graph(), _edit_draft_add_guardrail(), _mock_response(), patch (+11 more)

### Community 60 - "eval.py"
Cohesion: 0.16
Nodes (11): compute_aggregate_score(), preview_eval(), Any, Live rubric preview — run the LLM judge on a sample input/output. Powers the…, Score a sample with the given rubric. Returns the per-dimension scores + the…, scores_delta(), _parse_evaluation_scores(), Custom rubric editor: eval-preset update (PATCH) + live sample preview. The… (+3 more)

### Community 61 - "compiler.py"
Cohesion: 0.05
Nodes (94): AdkEdge, AST, _branch_default_label(), _build_adk_node(), _build_author_lookup(), _build_bound_workflow(), _build_graph_edges(), compile_workflow() (+86 more)

### Community 62 - "valid_graph"
Cohesion: 0.11
Nodes (49): executable_graph(), Extract executable nodes/edges from an already validated graph., Validate canvas graph before save or compile. Returns summary metadata., validate_workflow_graph(), Build a graph that satisfies Trigger → … → End validation., valid_graph(), test_validation_allows_single_error_edge_from_handler_node(), test_validation_rejects_error_edge_from_end_is_moot_but_trigger_covered() (+41 more)

### Community 63 - "run_concurrency.py"
Cohesion: 0.09
Nodes (37): active_run_ids(), Run ids that currently have a live in-process asyncio task., _as_aware(), mark_run_unscheduled(), _parse_resumed_at(), datetime, Session, UUID (+29 more)

### Community 64 - "test_iteration_node.py"
Cohesion: 0.33
Nodes (17): _ctx(), _iter_fn(), Tests for the iteration node (map-over-list, Dify-style single-node loop). The…, _run(), test_iteration_empty_items_yields_empty_array(), test_iteration_fail_on_error_raises(), test_iteration_hard_cap_100(), test_iteration_item_template_sees_normal_context() (+9 more)

### Community 65 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @next/bundle-analyzer, postcss, tailwindcss (+11 more)

### Community 66 - "layout.tsx"
Cohesion: 0.09
Nodes (24): metadata, plexMono, Toaster, viewport, openCommandPalette(), MobileNav(), MobileNavProps, MotionProvider() (+16 more)

### Community 67 - "useRunReplay.ts"
Cohesion: 0.16
Nodes (16): PostRunTransport(), PostRunTransportProps, RunProgressStrip(), RunProgressStripProps, useElapsedSeconds(), deriveState(), isCompletedStatus(), isFailedStatus() (+8 more)

### Community 68 - "api/node_test.py"
Cohesion: 0.18
Nodes (18): expression_preview(), _load_workflow_graph(), node_test(), post, Session, UUID, Ephemeral node-test and expression-preview endpoints (canvas authoring aids).…, Blocking DB reads for the node-test endpoint (runs in a worker thread). (+10 more)

### Community 69 - "02 Split Studio Homepage Mockup"
Cohesion: 0.15
Nodes (18): Aegis Visual Agent Workflow Workbench, Bone and Monochrome Chrome, 02 Split Studio Homepage Mockup, Invoice Processing Pipeline, Last Run Summary, Open Canvas Action, Pipeline Graph Preview, Color-Coded Pipeline Nodes (+10 more)

### Community 70 - "node-registry.ts"
Cohesion: 0.08
Nodes (29): QuickAddMenu(), resolveSuggestion(), accent, ACCEPTS_NOUN, describeKindMismatch(), EXPRESSION_HINT, getNodeDefinition(), guardrailHasRule() (+21 more)

### Community 71 - "eval_preset_service.py"
Cohesion: 0.30
Nodes (16): EvaluationPreset, build_eval_instruction(), _batch_load_custom_presets(), builtin_preset_rows(), enrich_graph_eval_presets(), get_preset_config(), list_all_presets(), list_user_presets() (+8 more)

### Community 72 - "BaseNode.tsx"
Cohesion: 0.09
Nodes (29): EdgeData, GradientEdge, GradientEdgeImpl(), BaseNode, BORDER_BY_STATE, ExtendedNodeData, formatTokens(), NodeChip() (+21 more)

### Community 73 - "dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, clsx, framer-motion, dependencies, class-variance-authority, clsx, framer-motion, next (+9 more)

### Community 74 - "Attention Inbox layout"
Cohesion: 0.14
Nodes (17): Approvals queue, Bone monochrome chrome, data/warehouse-sync-pipeline failed run, Editorial Aegis home page header, Monospace error log trace, Failed runs queue, Failure metadata header, Attention Inbox layout (+9 more)

### Community 75 - "observability_rollups.py"
Cohesion: 0.12
Nodes (28): ObservabilityRollup, _adjust_bucket(), aggregate_rollups_for_user(), _bucket_hour(), _claim_ledger_transition(), enrich_leaderboard_names(), Any, datetime (+20 more)

### Community 76 - "experiments.py"
Cohesion: 0.09
Nodes (40): _check_version(), create_experiment(), experiment_gate(), ExperimentCreate, get_experiment(), list_experiments(), ModelTarget, BaseModel (+32 more)

### Community 77 - "CommandPalette.tsx"
Cohesion: 0.06
Nodes (42): WorkflowPage(), HeaderActions(), ErrorBoundary, AppShell(), Action, ADD_NODE_EVENT, CommandPalette(), emitAddNode() (+34 more)

### Community 78 - "HeaderActions.tsx"
Cohesion: 0.16
Nodes (15): CanvasToolbar(), ToolbarButton(), AppRail(), AppRailProps, isActivePath(), NavItem, navItems, NavList() (+7 more)

### Community 79 - "workflow_capabilities.py"
Cohesion: 0.14
Nodes (32): Credential, attached_tool_node_ids(), Declaration IDs referenced by agents; call validation before execution. This…, _gemini_ref(), missing_provider_keys(), _node_provider_models(), UUID, Shared workflow graph capability checks. (+24 more)

### Community 80 - "model_call_span"
Cohesion: 0.18
Nodes (13): Any, BaseModel, rag_aggregate(), RagScores, RAG-specific evaluation scorers. Standard RAG quality dimensions an LLM judge…, Mean of the three RAG dimensions (1-5), rounded., Score a RAG triple. Returns per-dimension scores + aggregate, or a skip/error…, score_rag() (+5 more)

### Community 81 - "TokenTrackerPlugin"
Cohesion: 0.11
Nodes (31): estimate_cost_usd(), _local_cost_map(), ModelRates, Any, BasePlugin, Per-run token and cost accounting via ADK plugin callbacks. ADK 2.x's workflow…, Accumulates LLM token usage per ADK agent name for a single run., Flatten genai contents/parts into readable prompt text. (+23 more)

### Community 82 - "test_rag_v1.py"
Cohesion: 0.09
Nodes (32): chunk_text(), Any, Split text into overlapping chunks on sentence/word boundaries. Returns…, _hashing_vector(), _create_workflow(), _make_workflow_row(), _md_body(), Workflow (+24 more)

### Community 83 - "CanvasSidebar.tsx"
Cohesion: 0.12
Nodes (22): CanvasSidebar(), CanvasSidebarProps, CanvasSidebarTab, RunComparison, TabPanelFade(), tabs, VersionHistory, WorkflowDataPanel (+14 more)

### Community 84 - "llm_providers/__init__.py"
Cohesion: 0.07
Nodes (44): _guardrail_pm(), _pm_unavailable(), The resolved model for a guardrail LLM call. Prefer the model resolved at…, Ask the model to coerce ``text`` into JSON matching ``schema``. Returns the…, True when the resolved provider has no usable API key configured., LLM cleanup pass: remove the violating material, keep the substance., _repair_to_schema(), _rewrite_content() (+36 more)

### Community 85 - "test_agent_tools_runtime.py"
Cohesion: 0.06
Nodes (59): Any, BasePlugin, Exception, Per-run tool-call capture + action-layer guardrails (Trust-layer trace tree).…, Close cancellation/interruption starts without claiming completion., Accumulates tool-call spans (name/args/result/timing) per ADK agent., _summarize(), TracePlugin (+51 more)

### Community 86 - "sync_workflow_schedule"
Cohesion: 0.11
Nodes (29): cron_is_valid(), cron_next_runs(), datetime, Cron expression helpers for schedule triggers., list_user_scheduled_workflows(), list_workflow_schedules(), Any, datetime (+21 more)

### Community 87 - "RunDetailView.tsx"
Cohesion: 0.04
Nodes (95): ExpressionPreview(), hasBoundContext(), InspectorSection(), PanelStat(), PanelStatGrid(), STAT_TONES, allUpstream(), directPredecessors() (+87 more)

### Community 88 - "regex_safety.py"
Cohesion: 0.14
Nodes (20): _alternation_branches_overlap(), _body_has_unbounded_quantifier(), _branch_profile(), _has_catastrophic_structure(), _iter_quantified_groups(), ValueError, Guardrails against catastrophic backtracking in user-supplied regex patterns.…, Yield the inner body of every group immediately followed by an unbounded… (+12 more)

### Community 89 - "test_audit_p1_p2_fixes.py"
Cohesion: 0.16
Nodes (31): _approval_key(), clear_approval_state(), _linear_graph(), _park_run_approval(), asyncio, parametrize, WorkflowRun, Integration coverage for previously-dark critical paths (audit P1/P2). Targets… (+23 more)

### Community 90 - "conftest.py"
Cohesion: 0.12
Nodes (16): _enter_app_lifespan(), fixture, Stamp the DB at Alembic head so the startup migration gate sees it current. The…, Run the FastAPI lifespan once so startup/shutdown paths execute. Module-level…, Function-scoped reset of the in-process rate limiter. Auth-enabled endpoints…, _reset_rate_limit_buckets(), setup_database(), _stamp_alembic_head() (+8 more)

### Community 91 - "guardrail.py"
Cohesion: 0.09
Nodes (39): _parse_guardrail_status(), _evaluate_moderation_scores(), GuardrailResult, _judge_failure(), _judge_provider_model(), _mask_all_violations(), _mask_violation(), _parse_schema() (+31 more)

### Community 92 - "Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions"
Cohesion: 0.22
Nodes (11): Aegis visual agent-workflow workbench — observability/triage surface for LLM agent workflows, Aegis design language — warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Filter/search toolbar — 'Search workflows…', All Status, All Versions, Last 30d filters, List/Table view toggle, Templates, primary 'New workflow' button, 04-instrument-table.jpg — 'Instrument Table' homepage UI mockup for Aegis, Instrument Table layout — homepage concept: dense tabular inventory of agent workflows ('42 active workflows • 7 running'), Pagination footer — '1–25 of 142' with prev/next controls, Per-row action controls — run (play), edit (pencil), overflow menu, plus bulk-select checkboxes, Color-coded status pill system — SUCCESS (green), RUNNING (amber), FAILED (red); success-rate text colored green/red (+3 more)

### Community 93 - "graph_validation.py"
Cohesion: 0.08
Nodes (31): AgentToolSchemaError, ValueError, Validate stable references and bounds, returning attached declarations. MCP…, validate_agent_tool_schema(), _error_branch_unsupported(), GraphValidationError, _is_annotation(), _is_number() (+23 more)

### Community 94 - "mcp_client.py"
Cohesion: 0.16
Nodes (25): _allowed_hosts(), _bounded_json(), make_mcp_tool_cache(), MCPClientError, MCPDisabledError, MCPSession, MCPTimeoutError, MCPToolError (+17 more)

### Community 95 - "Competitive analysis — Aegis vs. the market"
Cohesion: 0.15
Nodes (12): 1. The strategic read, 2. Missing features (prioritized), 3. Existing features that need polishing / fixing, 4. Suggested sequencing (if the ROADMAP gets revised), Competitive analysis — Aegis vs. the market, Fix — correctness, safety, and trust holes, P0 — adoption blockers; every serious competitor has them, P1 — expected by platform buyers; absence is conspicuous (+4 more)

### Community 96 - "db/__init__.py"
Cohesion: 0.09
Nodes (31): Settings, get_db(), _sqlite_enable_foreign_keys(), get_online_eval_sample_rate(), Session, The instance-wide, durable online-evaluation sampling override., set_online_eval_sample_rate(), Data retention for old workflow runs. (+23 more)

### Community 97 - "agent_tools.py"
Cohesion: 0.08
Nodes (28): AsyncExitStack, AgentBudgetExceeded, AgentFunctionTool, AgentToolState, _build_tools(), Any, RuntimeError, Native ADK tool agents, owner-bound MCP sessions, and per-node budgets. (+20 more)

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
Cohesion: 0.24
Nodes (16): AlertRuleCreate, AlertRuleUpdate, create_rule(), delete_rule(), list_events(), list_rules(), AlertRule, BaseModel (+8 more)

### Community 102 - "workflow.py"
Cohesion: 0.11
Nodes (27): OnlineSamplingUpdate, preview_guardrail(), BaseModel, field_validator, post, create_workflow(), import_workflow(), Workflow (+19 more)

### Community 103 - "test_agentops_phase3.py"
Cohesion: 0.14
Nodes (22): enrich_graph_guardrail_policies(), Resolve guardrail nodes' policyId into concrete rules before compile. Node-…, GuardrailPolicy, Named, reusable guardrail rule bundle., check_workflow_budget(), _positive_number(), Session, Workflow (+14 more)

### Community 104 - "test_mvp2_foundation.py"
Cohesion: 0.19
Nodes (6): _make_workflow(), Tests for MVP2 backend foundation: timeline, deploy, dashboards, crypto, cost…, test_cost_alert_rule_is_supported(), test_credential_secret_encrypted_at_rest(), test_deploy_descriptor_after_publish_includes_mcp_tool(), test_deploy_descriptor_requires_published_version()

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

### Community 111 - "tracing.py"
Cohesion: 0.06
Nodes (51): _content_capture_enabled(), _detached_context(), finalize_workflow_span(), install_http_middleware(), _is_content_key(), _is_secret_key(), langsmith_traces_endpoint(), _llm_messages() (+43 more)

### Community 112 - "Aegis homepage mockup 06: Quiet Table (Workflows list view)"
Cohesion: 0.33
Nodes (7): Aegis design language: warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Aegis homepage mockup 06: Quiet Table (Workflows list view), Primary actions: Templates ghost button and filled bone New workflow + button, Quiet Table layout, Status filter tabs: All / Published / Draft, Top navigation chrome: AEGIS shield logo, Workflows/Agents/Templates/Runs/Settings, v4.12 prod environment badge, Workflows list table with Name, Version, Updated columns and rows like Lead Qualification Agent v2.4

### Community 113 - "Terminal Shell layout"
Cohesion: 0.33
Nodes (7): CLI/terminal metaphor for the agent workbench: workflows and runs operated via shell commands instead of GUI panels, Command header: 'aegis >' prompt with block cursor; right-aligned 'AEGIS AGENT WORKBENCH v0.14.3 · session 47 · 03:41 UTC' on a raised title band, Warm near-black surface with bone/monochrome monospace text; amber/gold reserved for command echoes and accent data, 'recent runs' timestamped log: run IDs (name#hash), status (completed/failed), duration, and inline metrics (score:0.97, flagged:3, ERR: timeout, routed:2, stage:verify), Bottom status bar: left 'tab complete · type new · open <name> · last sync 41s ago'; right '↑ 3 workflows running · agents: 12 online', Terminal Shell layout, '$ list workflows' output table: NAME / VERSION / UPDATED columns with dashed separators (lead-qualifier 2.3.1, fraud-detector 4.1.0, contract-analyzer 1.9.4, escalation-router 3.0.2, onboarding-flow 2.7.1)

### Community 114 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, analyze, build, dev, lint, start, typecheck

### Community 115 - "api/credentials.py"
Cohesion: 0.16
Nodes (21): cached_mcp_tools(), create_credential(), delete_credential(), discover_mcp_tools(), list_credentials(), _owned_mcp_credential(), delete, post (+13 more)

### Community 116 - "eval_runner.py"
Cohesion: 0.26
Nodes (11): _build_eval_prompt(), evaluate_content_async(), _evaluate_content_sync(), evaluate_node_async(), Any, Parallel and deferred evaluation execution (LLM + deterministic)., Evaluate multiple nodes concurrently. Returns (node_id, scores, error)., Judge the content as a response to the original request when we have it —… (+3 more)

### Community 117 - "012_run_spans_tags_sessions.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 118 - "013_alert_baseline_comparison.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 119 - "chat.ts"
Cohesion: 0.19
Nodes (23): invokeWithKey(), invokeWithSession(), isSameOriginRequest(), POST(), relay(), isSameOriginRequest(), POST(), ChatPage() (+15 more)

### Community 120 - "kb_cache.py"
Cohesion: 0.40
Nodes (5): load_workflow_kb_documents(), Any, Session, UUID, Per-run knowledge document cache.

### Community 121 - "Evaluation rigor: online evals + CI gates (P1.2)"
Cohesion: 0.40
Nodes (6): Evaluation rigor: online evals + CI gates (P1.2), Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5), P0: misleading eval chroma (1-5 scores banded on 0-1), User-defined eval presets & weighting (EvaluationPreset model), Deterministic evaluators (exact/substring, regex, embedding similarity), OpenTelemetry tracing export (Jaeger/LangFuse/Datadog)

### Community 122 - "Glass & glow visual language"
Cohesion: 0.33
Nodes (6): Motion primitives (PageEnter, StaggerList, HoverLift, NumberTween, useGlowPulse), Reduced-motion gating (useReducedMotionStrict), Design token system (CSS variables + Tailwind config), Glass & glow visual language, Design-system quality bar (instrument aesthetic, chroma for data only), Hardcoded white sheen vs --surface-highlight token (light theme loses lift)

### Community 123 - "test_mcp_client.py"
Cohesion: 0.13
Nodes (21): MCPPinnedTransport, Resolve/revalidate and pin every request, including SDK reconnects and DELETE., Synchronous write-path validation; requests independently revalidate DNS., validate_mcp_endpoint(), validate_mcp_schema(), _assert_process_gone(), mcp_credentials(), fixture (+13 more)

### Community 124 - "setup.sh"
Cohesion: 0.39
Nodes (10): allocate_ports(), apply_port_env(), copy_untracked_files(), error(), info(), install_deps(), persist_ports(), port_in_use() (+2 more)

### Community 125 - "deploy_descriptor.py"
Cohesion: 0.36
Nodes (8): build_deploy_descriptor(), build_mcp_input_schema(), find_input_schema_fields(), _node_type(), Any, Build a deploy descriptor (invoke URL, cURL, MCP tool) for a published…, Return the first input_schema node's ``inputFields`` (or [])., Derive a JSON Schema object for the MCP tool's input. Uses the workflow's…

### Community 126 - "_run_single_node_variant"
Cohesion: 0.32
Nodes (8): Wrap a single node between a trigger and end for single-node execution., Execute one variant as a single-node LLM run, capturing telemetry. Reuses the…, _run_single_node_variant(), _single_node_graph(), asyncio, test_compare_config_cannot_override_node_type(), test_compare_rejects_non_llm_node_type(), CompareVariantResult

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

### Community 131 - "wrap_graph_with_trigger_end"
Cohesion: 0.14
Nodes (13): executable_nodes(), Workflow steps, excluding annotations and agent-attached declarations., Helpers for standard Trigger → … → End workflow graphs., Prepend Trigger and append End, wiring entry/exit automatically. When…, wrap_graph_with_trigger_end(), Crash-resume of an awaiting_approval run re-parks a new ApprovalRequest row and…, test_execute_run_re_parks_approval_with_fresh_row(), Workflow (+5 more)

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

### Community 150 - "test_phase9.py"
Cohesion: 0.15
Nodes (24): normalize_workflow_import(), ValueError, Import Aegis exports or manually converted graph_json, without dropping nodes., WorkflowImportError, _agent_tool_export(), parametrize, _sample_export(), test_agent_tool_declarations_round_trip_save_export_import() (+16 more)

### Community 151 - "Workflow"
Cohesion: 0.07
Nodes (54): Workflow, WorkflowRun, WorkflowVersion, Annotation queue: enqueue paths, dedup, label→dataset seam, and filters. Seeds…, A run already captured via thumbs-down keeps its row; the human label becomes…, Two sessions racing the same (user_id, run_id) enqueue: the loser must get the…, Create a workflow + version + runs; return (workflow_id, [run_ids])., _seed() (+46 more)

### Community 157 - "authenticate_event_webhook"
Cohesion: 0.15
Nodes (23): DeploymentWebhookReceipt, WorkflowDeployment, authenticate_event_webhook(), authenticate_invoke(), issue_credential(), CredentialKind, Session, UUID (+15 more)

### Community 158 - "HighlightedSample.tsx"
Cohesion: 0.33
Nodes (9): escapeRegExp(), findKeywordMatches(), findPiiMatches(), HighlightedSample(), HighlightedSampleProps, MatchSpan, mergeSpans(), PII_PATTERNS (+1 more)

### Community 159 - "ingest_otlp_run"
Cohesion: 0.14
Nodes (23): _attrs(), _collect_spans(), _decode_anyvalue(), ingest_otlp_run(), _model(), _nano(), _nano_to_dt(), datetime (+15 more)

### Community 160 - "test_run_authoring.py"
Cohesion: 0.17
Nodes (23): prune_graph_for_resume(), Return a new graph that resumes a crashed run at ``frontier_ids``. Nodes…, _declaration_graph(), _ids(), _linear_graph(), _pairs(), Tests for prune_graph_for_resume (Phase 2 durable-resume graph transform). The…, Unstarted conditional children of a completed router are pruned away. (+15 more)

### Community 161 - "test_routing_adk2.py"
Cohesion: 0.48
Nodes (6): _branch_graph(), parametrize, Regression: conditional routing must work under ADK 2.x. ADK 2.x routes…, _run_graph(), test_if_decision_is_not_leaked_as_output(), test_if_routes_correct_branch()

### Community 211 - "teardown.sh"
Cohesion: 0.62
Nodes (6): info(), kill_dev_servers(), kill_port(), release_port(), teardown.sh script, warn()

### Community 212 - "test_upgrade_phase4.py"
Cohesion: 0.17
Nodes (17): broadcast_observability_event(), Any, Queue, User-scoped SSE fan-out for live observability updates., stream_observability_events(), subscribe_observability(), unsubscribe_observability(), maybe_emit_eval_regression() (+9 more)

### Community 213 - "use-pinned-workflows.ts"
Cohesion: 0.62
Nodes (5): usePinnedWorkflows(), getPinnedWorkflowIds(), isWorkflowPinned(), setPinnedWorkflowIds(), togglePinnedWorkflow()

### Community 214 - "014_workflow_memory_unique.py"
Cohesion: 0.73
Nodes (5): downgrade(), _existing_indexes(), _existing_tables(), _inspector(), upgrade()

### Community 215 - "vector_stores.py"
Cohesion: 0.17
Nodes (14): _embedding_literal(), Any, Session, UUID, Pluggable vector stores for knowledge retrieval (Phase 4 RAG).…, sqlite-vec ``vec0`` index over a per-database ``vec_knowledge`` vtable. The…, Raw sqlite3 connection for the session's current transaction., KNN over the vec table, restricted to this workflow's documents. vec0 only… (+6 more)

### Community 217 - "test_assist_eval_suite.py"
Cohesion: 0.20
Nodes (22): _EvalItemDraft, _EvalPresetDraft, _EvalSuiteDraft, Gemini structured-output shape for the draft-eval-suite prompt., _clear_rate_buckets(), _draft(), _mock_response(), fixture (+14 more)

### Community 218 - "test_security_fixes.py"
Cohesion: 0.08
Nodes (45): _in_spans(), _literal_spans(), _parameterize_query(), _pg_engine(), _post_integration_webhook(), Any, Integration node handlers — Slack, Email, Postgres (n8n-style)., Validate the URL targets a public Postgres host and return the pinned IP.… (+37 more)

### Community 219 - "mcp_server.py"
Cohesion: 0.17
Nodes (22): _sanitize_tool_name(), _args_to_payload(), _authenticate_deployment_headers(), call_tool(), _deployment_auth_missing(), list_tools(), _load_published_tools(), Any (+14 more)

### Community 220 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 223 - "invoke_runner.py"
Cohesion: 0.17
Nodes (22): active_run_count(), create_event_run(), create_invoked_run(), invoke_and_wait(), InvokeRequestBody, _load_session_history(), poll_run_terminal_result(), Session (+14 more)

### Community 224 - "observability.py"
Cohesion: 0.19
Nodes (21): observability_costs(), observability_dashboards(), observability_errors(), observability_overview(), observability_quality(), observability_runs(), observability_spans(), observability_summary() (+13 more)

### Community 225 - "test_otlp_ingest.py"
Cohesion: 0.11
Nodes (18): _coerce_output_text(), Any, L6: GenAI envelopes may carry structured output (dict/list). Text columns…, _otlp_payload(), Inbound OTLP: POST /v1/ingest/runs accepts OTLP/GenAI-convention spans. An…, One batch, two independent traces: trace A ok, trace B errored., A collector batch with two trace ids must land as two independent runs — one…, A minimal-but-realistic OTel/GenAI export: agent root → llm + tool. (+10 more)

### Community 226 - "quality_metrics.py"
Cohesion: 0.19
Nodes (19): aggregate_quality_metrics(), aggregate_workflow_quality(), detect_eval_regression(), enrich_run_summary(), extract_graph_quality_config(), Any, WorkflowRun, Aggregate evaluation and guardrail metrics for observability. (+11 more)

### Community 227 - "test_reviewfix_auth.py"
Cohesion: 0.26
Nodes (21): _chat_invoke(), _echo_workflow(), _exchange(), _invoke_headers(), _issue(), _publish_echo(), fixture, Review-fix regressions: MCP deployment-scoped discovery + body-bound… (+13 more)

### Community 228 - "test_langsmith_tracing.py"
Cohesion: 0.13
Nodes (34): _all_text(), _execute(), _FailingExporter, _graph_with_secret(), langsmith_sink(), asyncio, fixture, SpanExporter (+26 more)

### Community 229 - "test_chat_token.py"
Cohesion: 0.25
Nodes (20): _chat_invoke(), _deployment(), _echo_graph(), _exchange(), _expired_session(), _issue(), _published_workflow(), Hosted-chat credential: aegis_chat_ token → session → pinned invoke. Covers the… (+12 more)

### Community 230 - "test_mcp_server.py"
Cohesion: 0.22
Nodes (18): _invoke_headers(), _mcp_post(), _published_workflow(), asyncio, Response, MCP server surface: /mcp JSON-RPC tools exposed from published deployments., The stdio server's tool comes from the deployment descriptor; calls POST to the…, Create + publish a transform-only workflow; return (body, credential). (+10 more)

### Community 231 - "vector_search.py"
Cohesion: 0.21
Nodes (19): delete_embedding_vector(), _pgvector_available(), Any, Session, UUID, Vector-store-backed knowledge retrieval with JSON embedding fallback.…, Deprecated alias: pgvector search through the store abstraction., KNN via the vector store, merged with JSON-scored unindexed docs. The store… (+11 more)

### Community 232 - "test_sqlite_uuid_affinity.py"
Cohesion: 0.16
Nodes (18): test_regression_gate_has_no_shell_interpolation(), _broken_db(), Regression coverage for the SQLite NUMERIC-affinity UUID defect fixed by…, Rows that were always fine (mixed-case hex, letters present) survive the repair…, A numeric UUID like …0010 collapses to integer 10; the repair must restore the…, End-to-end the original crash: insert via the real models on a migrated DB and…, Run `alembic upgrade head` against a scratch file. env.py resolves the URL from…, Hand-build the pre-021 defect: UUID-affinity column + an int-stored all-digit… (+10 more)

### Community 233 - "mark_node_started"
Cohesion: 0.19
Nodes (17): Per-node execution checkpoint for crash/restart resume. Status mirrors node…, RunCheckpoint, _incoming_exec_edges(), _list_checkpoints(), load_checkpoints(), mark_node_started(), mark_pinned_skipped(), Session (+9 more)

### Community 234 - "test_phase3_surfaces.py"
Cohesion: 0.23
Nodes (16): _echo_graph(), _get_run(), _invoke(), _invoke_headers(), _issue_invoke_key(), _published_workflow(), asyncio, Phase 3 platform surfaces: session rehydration, streaming invoke, token deltas.… (+8 more)

### Community 235 - "chat.py"
Cohesion: 0.20
Nodes (16): _bind_session_id(), chat_invoke(), ChatInvokeRequest, ChatSessionRequest, create_chat_session(), BaseModel, datetime, post (+8 more)

### Community 236 - "embeddings.py"
Cohesion: 0.22
Nodes (14): cosine_similarity_vectors(), embed_text(), Any, Text embeddings for vector RAG (Gemini with TF-IDF fallback)., retrieve_by_embedding(), asyncio, test_cosine_similarity_identical_vectors(), test_cosine_similarity_skips_dimension_mismatch() (+6 more)

### Community 237 - "test_deployment_auth.py"
Cohesion: 0.32
Nodes (15): deployment_client(), invoke_headers(), issue(), fixture, Consumer-visible scope, publication, rotation and raw-body signing guarantees., signed_headers(), test_account_keys_cannot_invoke_and_invoke_keys_cannot_manage(), test_invoke_key_matches_only_published_deployment() (+7 more)

### Community 238 - "_handle_post"
Cohesion: 0.19
Nodes (13): _MCPASGIEndpoint, MCP mount surface: wires the stateless MCP ASGI app into the FastAPI router.…, _handle_post(), _json_rpc_error(), mcp_asgi_app(), Response, A receive channel that replays an already-read body then ends., One stateless transport per POST — the SDK's ``_handle_stateless_request``.… (+5 more)

### Community 239 - "retrieve_documents"
Cohesion: 0.23
Nodes (13): _cosine_similarity(), Any, Keyword and BM25 knowledge retrieval (Lyzr RAG-lite)., retrieve_documents(), score_document(), score_document_bm25(), score_document_tfidf(), _tokenize() (+5 more)

### Community 240 - "mcp_stdio_entry.py"
Cohesion: 0.21
Nodes (14): _args_to_invoke_body(), build_stdio_server(), _deployment_headers(), _env(), fetch_tool_descriptor(), main(), Any, AsyncClient (+6 more)

### Community 241 - "aegis_cli/main.py"
Cohesion: 0.23
Nodes (12): ArgumentParser, build_parser(), CliError, cmd_gate(), main(), _pick_versions(), Exception, aegis — Aegis platform CLI. Commands: gate — run a regression experiment and… (+4 more)

### Community 242 - "create_run"
Cohesion: 0.22
Nodes (13): create_run(), post, NodeResultResponse, BaseModel, One node execution positioned on the run's timeline (waterfall span)., RunApprovalPayload, RunCreate, RunListItem (+5 more)

### Community 243 - "upload_knowledge_document"
Cohesion: 0.24
Nodes (13): Upload a document file, chunk it, and index each chunk for retrieval., upload_knowledge_document(), KnowledgeDocument, apply_embedding(), Session, _bulk_import_sync(), UUID, Background knowledge base indexing jobs. (+5 more)

### Community 244 - "agent_tool_schema.py"
Cohesion: 0.20
Nodes (11): MCPToolReference, NodeToolReference, TypedDict, Agent tool references and the executable/declaration boundary of a graph., get_node_meta(), NodeTypeMeta, TypedDict, Canonical node type metadata for the agentic workflow builder. (+3 more)

### Community 245 - "parse_document"
Cohesion: 0.19
Nodes (13): _decode_text(), _expand_ratio(), parse_document(), _parse_docx(), _parse_pdf(), Document upload parsing + chunking for knowledge bases (Phase 4 RAG).…, Choose where chunk [start..limit) should end. Prefer the last sentence boundary…, Rough zip expansion ratio for zip-based formats (docx/pdf). (+5 more)

### Community 246 - "test_trace_search.py"
Cohesion: 0.27
Nodes (12): _add_llm_call(), _add_span(), datetime, Cross-run span/LLM-call search: GET /api/observability/spans. Seeds two…, Foreign user's spans must not leak through the search., Create workflow+version+run; return (workflow_id, run_id) as UUIDs., _seed_run(), test_spans_search_filters() (+4 more)

### Community 247 - "invoke"
Cohesion: 0.22
Nodes (12): fetch_v4_outputs(), main(), A/B experiment: grounded-prompt v5 vs the ungrounded v4 baseline. v4…, Latest completed v4 run per input, with its n1 search context., invoke(), main(), poll_run(), post_run() (+4 more)

### Community 248 - "meta.py"
Cohesion: 0.27
Nodes (12): list_models(), list_node_types(), ops_config(), preview_cron(), patch, Session, UUID, LLM provider/model catalog for per-node model pickers. Providers without a… (+4 more)

### Community 249 - "Critical / High"
Cohesion: 0.15
Nodes (13): Critical / High, R2-10. `version_number` race + in-place overwrite lost-update — `api/workflows.py:517-537,361-381`, R2-11. Templates are fully cross-tenant — `api/templates.py:58-64,137-143`, R2-12. Alert rules orphaned + baseline alerting can't fire — `api/alerts.py:85-99`, `services/alerts.py:152-160`, `api/workflows.py:722-759`, R2-1. Sandbox escape: `str.format` field traversal bypasses the dunder AST filter — `code_sandbox.py:96-101`, R2-2. `safe_http_request` breaks TLS on every HTTPS target — `url_safety.py:148-212`, R2-3. `safe_http_request` forwards `Authorization`/custom headers across cross-host redirects — `url_safety.py:150,176-183,221-227`, R2-4. `worker.py` never calls `startup_http_client()` → all outbound HTTP dead in worker mode — `worker.py:20-53`, `http_client.py:24-27` (+5 more)

### Community 250 - "event_webhooks.py"
Cohesion: 0.21
Nodes (11): _build_input(), _event_source(), Any, post, Request, Session, UUID, Inbound event webhooks: ``POST /v1/webhooks/{workflow_id}``. The generic… (+3 more)

### Community 251 - "chat_session.py"
Cohesion: 0.27
Nodes (11): _b64url(), _b64url_decode(), mint_session_token(), datetime, UUID, Hosted-chat session tokens: short-lived HMAC-bound deployment handles. A…, Mint a session token bound to one deployment's pinned version., Return the bound claims when the signature and expiry hold, else None. (+3 more)

### Community 252 - "test_dataset_loop.py"
Cohesion: 0.33
Nodes (11): _csv(), _items(), parametrize, Dataset-loop API regressions: atomic CSV and exact, tenant-safe run reuse., test_add_run_dedupes_across_capture_and_rejects_other_workflows(), test_cluster_capture_exact_members_and_scope(), test_csv_bad_rows_are_reported_without_partial_import(), test_csv_preserves_quoted_multiline_labels_and_metadata() (+3 more)

### Community 253 - "run_filters.py"
Cohesion: 0.33
Nodes (10): apply_run_quality_sql_filters(), filter_runs_by_eval_passed(), filter_runs_by_guardrail_blocked(), filter_runs_by_has_eval(), Query, WorkflowRun, Cross-database filters for workflow run list queries., run_eval_passed() (+2 more)

### Community 254 - "High"
Cohesion: 0.20
Nodes (10): High, R3-α. `GET /api/runs?tag=` filter broken on both dialects — `api/runs.py:91`, `run_filters.py`, `models.py:13-20`, R3-β. Malformed `budget_json` 500s run creation AND kills the entire cron scan — `budgets.py:48,67`, `schedule_worker.py:125`, `schemas/workflow.py:38`, R3-γ. `tokens_per_run` budget never enforced — dead knob — `budgets.py:4,73-76`, R3-δ. `delete_workflow` ORM-cascades every run + child into the session — `workflows.py:764`, `models.py:38,105,145-148`, R3-ε. `recover_stale_jobs` fails live jobs on every API boot; `queued` jobs never re-dispatch — `startup.py:216-236`, `workflows.py:907,937`, R3-ζ. Impossible-date cron passes `cron_is_valid` then 500s every schedule-info endpoint — `cron_utils.py:10-27`, `schedule_info.py:26`, `observability_service.py:124`, R3-η. Node-test executes `iteration` nodes running real sub-workflows — `node_test.py:61-71` vs `node_handlers.py:685-694` (+2 more)

### Community 255 - ".handle_async_request"
Cohesion: 0.25
Nodes (4): AsyncByteStream, _BoundedResponseStream, Request, Response

### Community 256 - "010_encrypt_credential_secrets.py"
Cohesion: 0.36
Nodes (8): _coerce_config(), downgrade(), Encrypt existing plaintext credential secret values at rest (Fernet).…, config may come back as dict (PG JSONB) or str (SQLite JSON)., _rewrite(), _secret_keys(), upgrade(), encryption_enabled()

### Community 257 - "bugs.md"
Cohesion: 0.22
Nodes (8): Fix status (P2-A + P2-B implementation), Low, Medium, Not taken in P2 (documented deviations), P2-A — all 15 fixed (PR #93, `fix/p2a-run-lifecycle-concurrency`), P2-B — all 24 fixed (PR #94, `fix/p2b-graph-retrieval-security`), Round 2 (deeper pass: CRUD routers, invoke/chat internals, sandbox/SSRF, concurrency, canvas, tests/CI), Round-2 verified clean

### Community 258 - "Critical / High"
Cohesion: 0.22
Nodes (9): 1. SSRF + env-key exfiltration via `apiBase` — `backend/app/services/llm_providers/__init__.py:168-189`, 2. `POST /api/assist/compare` executes arbitrary node types cross-tenant — `assist.py:791-816`, 3. `sweep_stale_runs` kills live, resumable runs — `run_concurrency.py:116-170` (from `schedule_worker.py:240`), 4. `worker.py:31` calls `Base.metadata.create_all` — bypasses the Alembic gate, 5. `models.py` uses `postgresql.UUID`, not `sa.Uuid` — `models.py:6`, ~50 columns, 6. `recover_stale_runs` re-queues every non-terminal row — `startup.py:115-120`, 7. Error-swallowing handlers defeat error edges and retries — `node_handlers.py:141-144` (http), `:313` (code), `:534-565` (integration), `sub_workflow.py:62-63`, `compiler.py:247` (calculator), `node_handlers.py:61` (json_parse), 8. Router/classifier/expression-agent LLM calls bypass token & cost accounting — `compiler.py:229-241`, `:191-198` (+1 more)

### Community 259 - "026_event_triggers.py"
Cohesion: 0.46
Nodes (7): downgrade(), Multi-schedule workflows + inbound event webhooks. Drops the UNIQUE constraint…, _schedule_table(), upgrade(), _workflow_id_unique_names(), MetaData, Table

### Community 260 - "validate_mcp_tool_bindings"
Cohesion: 0.32
Nodes (8): import_into_workflow(), WorkflowVersion, Replace or version the graph on an existing workflow from export JSON., save_version(), clear_compile_cache(), Session, Check MCP references using only credentials owned by this workflow user.…, validate_mcp_tool_bindings()

### Community 261 - "021_sqlite_uuid_affinity.py"
Cohesion: 0.40
Nodes (4): _columns_with_broken_affinity(), Repair SQLite type affinity for columns declared with sa.UUID() in older…, Columns whose declared type yields NUMERIC affinity — ``UUID`` (the original…, upgrade()

### Community 262 - "029_workflow_version_number_unique.py"
Cohesion: 0.40
Nodes (4): Unique (workflow_id, version_number) on workflow_versions. Concurrent ``POST…, Shift colliding version_numbers to fresh slots, preserving every row. For each…, _renumber_duplicates(), upgrade()

### Community 263 - "032_schedule_unique_entry.py"
Cohesion: 0.40
Nodes (4): _dedup_existing(), Unique (workflow_id, trigger_node_id, cron_expr) on workflow_schedules.…, Keep the oldest row per entry; drop newer duplicates (same version pin family —…, upgrade()

### Community 264 - "LangSmithSpanExporter"
Cohesion: 0.40
Nodes (3): LangSmithSpanExporter, SpanExporter, Sanitizing wrapper around an OTLP exporter pointed at LangSmith. A span that…

### Community 265 - "Backlog batches (P3, reconciled 2026-10-18; P2 batches below are landed)"
Cohesion: 0.33
Nodes (6): Backlog batches (P3, reconciled 2026-10-18; P2 batches below are landed), P2-A: Run lifecycle, concurrency, schedules & alerts (15) — merged #93, P2-B: Graph, retrieval, providers, security & evals (24) — merged #94, P3-A: Backend correctness lows (24), P3-B: Frontend & UX (21), P3-C: Infra, test harness, limits & config (24)

### Community 266 - "Verification pass (all findings re-checked against current source; live repros where cheap)"
Cohesion: 0.33
Nodes (6): Confirmed — everything else, Drift-fixed (code already changed — verify before fixing), Inconclusive (not re-traced; no drift signal, keep as-is), Partially confirmed (scope narrower than originally stated), Refuted (do not fix — claim was wrong), Verification pass (all findings re-checked against current source; live repros where cheap)

### Community 267 - "Migrate from OpenAI Agent Builder to Aegis"
Cohesion: 0.33
Nodes (5): Deadline and supported path, Executable safe Aegis import example, Migrate from OpenAI Agent Builder to Aegis, Node-by-node manual mapping, What JSON import accepts and rejects

### Community 268 - "KnowledgeBulkImport"
Cohesion: 0.60
Nodes (4): KnowledgeBulkImport, KnowledgeDocumentCreate, KnowledgeDocumentResponse, BaseModel

### Community 270 - "Fix status (P0 + P1 implementation)"
Cohesion: 0.40
Nodes (5): Deliberately not taken, Fix status (P0 + P1 implementation), Incidental fixes (found while fixing), P0 — all fixed (PR #91 closed unmerged; work landed inside #92), P1 — all fixed (PR #92)

### Community 271 - "Round 3 (empirical verification + tail services + API contract + frontend rest + model/query layer)"
Cohesion: 0.40
Nodes (5): Low, Medium, Round 3 (empirical verification + tail services + API contract + frontend rest + model/query layer), Round-3 verified clean, Verification results (throwaway repros, `backend/.venv`)

### Community 272 - "WorkflowMemoryEntry"
Cohesion: 0.67
Nodes (3): BaseModel, WorkflowMemoryEntry, WorkflowMemoryResponse

### Community 273 - "Aegis audit — round 1 findings"
Cohesion: 0.50
Nodes (4): Aegis audit — round 1 findings, Low, Medium, Verified clean (round 1)

### Community 274 - "Provider-aware cost estimates"
Cohesion: 0.50
Nodes (3): Provider-aware cost estimates, Rate source, Usage contract

## Ambiguous Edges - Review These
- `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` → `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`  [AMBIGUOUS]
  docs/design/homepage-mockups/08-system-map.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **592 isolated node(s):** `run.sh script`, `aegis-cli`, `next/core-web-vitals`, `next/typescript`, `$schema` (+587 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **57 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` and `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ToolAgentNode` connect `agent_tools.py` to `BaseNode.tsx`, `services/node_test.py`, `test_agent_tools_runtime.py`, `GuardrailJudgeUnavailableError`, `compiler.py`?**
  _High betweenness centrality (0.268) - this node is a cross-community bridge._
- **Why does `BaseNode` connect `BaseNode.tsx` to `agent_tools.py`?**
  _High betweenness centrality (0.267) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `observability/page.tsx`, `api.ts`, `button.tsx`, `RunDeck.tsx`, `app/page.tsx`, `layout.tsx`, `BaseNode.tsx`, `CostDashboard.tsx`, `HeaderActions.tsx`, `WorkflowCanvas.tsx`, `templates/page.tsx`, `CommandPalette.tsx`, `new/page.tsx`, `RunDetailView.tsx`, `CanvasTour.tsx`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `run.sh script`, `aegis-cli`, `next/core-web-vitals` to the rest of the system?**
  _592 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.019005847953216373 - nodes in this community are weakly interconnected._
- **Should `prompts.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._