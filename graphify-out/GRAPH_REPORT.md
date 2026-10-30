# Graph Report - aegis  (2026-10-31)

## Corpus Check
- 568 files · ~636,386 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6176 nodes · 16602 edges · 335 communities (269 shown, 66 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 375 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9cad3060`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.ts
- button.tsx
- RunResultsPanel.tsx
- cn
- node_handlers.py
- observability/page.tsx
- validate_guardrail_content
- datasets.py
- test_agent_tools_runtime.py
- test_checkpoints.py
- guardrail_policy_plugin.py
- prompts.py
- test_model_matrix.py
- test_startup.py
- test_event_triggers.py
- valid_graph
- event_bus.py
- WorkflowCanvas.tsx
- run_concurrency.py
- executor.py
- app/main.py
- tracing.py
- eval.py
- experiment_runner.py
- app/page.tsx
- services/assist.py
- Recommended Build Sequence
- _get
- CanvasSidebar.tsx
- test_p3c_boot.py
- ingest_otlp_run
- CommandPalette.tsx
- models.py
- test_executor.py
- job_queue.py
- test_langsmith_tracing.py
- api/assist.py
- AssistRail.tsx
- graph_validation.py
- CanvasTour.tsx
- BaseNode.tsx
- decrypt_value
- workflows.py
- test_rag_v1.py
- node-registry.ts
- platform.py
- WorkflowContext
- GuardrailPlayground.tsx
- compiler.py
- mcp_server.py
- api
- test_workflow_capabilities.py
- services/credentials.py
- cron_is_valid
- test_phase9.py
- services/node_test.py
- Migrate from OpenAI Agent Builder to Aegis
- retrieve_documents
- observability_service.py
- get_vector_store
- test_mvp2_infra.py
- safe_http_request
- guardrail_policies.py
- test_upgrade_phase3.py
- mcp_client.py
- RunDeck.tsx
- test_assist.py
- wait_for_approval
- eval_presets.py
- wrap_graph_with_trigger_end
- services/alerts.py
- test_audit_p1_p2_fixes.py
- test_security_fixes.py
- chat.ts
- compilerOptions
- Backend Requirements
- test_p3c_input.py
- Canvas Commoditization
- app/layout.tsx
- test_agentops_phase3.py
- db/__init__.py
- test_p3c_bus.py
- test_node_test_api.py
- test_p3c_graph.py
- test_p3c_workflows.py
- embeddings.py
- conftest.py
- test_assist_eval_suite.py
- test_upgrade_phase4.py
- Evaluation
- index.ts
- meta.py
- Workbench.tsx
- test_assist_history.py
- guardrail.py
- test_reviewfix_auth.py
- components.json
- create_template
- test_mcp_client.py
- validate_safe_regex
- test_chat_token.py
- test_mcp_server.py
- knowledge_library.py
- sync_workflow_schedule
- test_assist_mvp2.py
- RunDetailView.tsx
- run_email_integration
- TokenTrackerPlugin
- init_tracing
- GuardrailPolicyPlugin
- Run Executor
- Canvas re-skin (custom nodes, gradient edges, inspector)
- Author Harden Grade Operate Ship
- api/credentials.py
- approval_service.py
- test_iteration_node.py
- test_phase3_surfaces.py
- test_sqlite_uuid_affinity.py
- devDependencies
- useRunReplay.ts
- playground.py
- schedule_worker.py
- api/knowledge.py
- 02 Split Studio Homepage Mockup
- api/alerts.py
- chat.py
- templates/page.tsx
- dependencies
- Attention Inbox layout
- test_online_sampling.py
- test_deployment_auth.py
- Cross-App Node Type System
- Provider-aware cost estimates
- deps.py
- test_prompt_registry.py
- run_sandboxed_code
- invoke_runner.py
- score_rag
- mcp_stdio_entry.py
- apiBase SSRF and Env-Key Exfiltration
- Build Guard Grade Operate
- test_error_routing.py
- test_tool_call_guardrail.py
- Tier 2 Big-tech Agent Platforms
- aegis_cli/main.py
- MCPPinnedTransport
- test_p3c_obs.py
- eval_preset_service.py
- Worker create_all Bypasses Alembic
- test_annotation_queue.py
- test_trace_search.py
- Audit Remediation Program
- invoke
- validate_structured_output
- Optional API Key Auth
- test_mvp2_foundation.py
- submit_approval
- test_dataset_loop.py
- auth.ts
- setup.sh
- config.py
- dispatch_webhook
- _run_single_node_variant
- Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions
- deploy_descriptor.py
- deployments.py
- Run Checkpoints
- Homepage mockup 05: Directory / Quiet Index (Workflows index page)
- Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions
- HighlightedSample.tsx
- run_filters.py
- test_experiment_gate.py
- Next.js Workbench
- Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc
- OpenTelemetry SDK
- 026_event_triggers.py
- apply_embedding
- QuickAddMenu.tsx
- experiments.py
- Command Home Layout (Aegis Workbench Homepage)
- Mission Control layout (named concept: fleet-wide observability overview of all workflows)
- Workflows map view (Aegis header 'Aegis | Workflows map')
- Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk
- useRunInput.ts
- KnowledgeBulkImport
- compile_workflow
- Aegis homepage mockup 06: Quiet Table (Workflows list view)
- Terminal Shell layout
- scripts
- use-pinned-workflows.ts
- workflow-import.ts
- teardown.sh
- Local Postgres Service
- Regression Gate Job
- 012_run_spans_tags_sessions.py
- 013_alert_baseline_comparison.py
- 014_workflow_memory_unique.py
- TracePlugin
- 021_sqlite_uuid_affinity.py
- 029_workflow_version_number_unique.py
- 032_schedule_unique_entry.py
- upload_knowledge_document
- MCPStdioConfig
- database.py
- Workflow
- test_phase6.py
- Glass & glow visual language
- get_workflow_memory
- 009_agentops_tables_backfill.py
- 011_workflow_templates.py
- Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5)
- extends
- package.json
- tailwind.config.ts
- Guardrail engine (blocklist/regex/PII, block vs warn)
- Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)
- next.config.mjs
- Aegis Frontend UI/UX Audit 2026-07-11
- run.sh
- Phase 2 Evals that catch regressions
- cmdk
- Aegis Deep Backend + Frontend Audit (2026-08-07)
- Copper as dedicated active semantic token (not blanket warning)
- Phase 2 Release 1.5 - Stabilize
- Aegis UI overhaul implementation plan
- lucide-react
- sonner
- tailwindcss-animate
- @tanstack/react-query
- postcss.config.mjs
- vercel.json
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
- Phase 2 Release 2.5 - Scale
- Search tools (Google Search / EXA / DuckDuckGo)
- Geist font integration
- UI/UX audit 2026-07-25 (74 verified findings)
- Error-state pandemic (failed queries render as healthy empties)
- Formatter/label duplication drift (tone maps, ms formatters, guardrail labels)
- P0: wrong timezone under a 'UTC' label
- Observability window inconsistency across views
- aegis-cli
- DB performance indexing + cron scheduler query optimization
- Guardrail DB telemetry fix for blocked nodes
- OpenTelemetry tracing export (Jaeger/LangFuse/Datadog)
- Parallel / post-run evaluations (asyncio.gather)
- Real-time SSE/WebSocket observability updates
- Evals/Guardrails/Observability upgrade plan
- schedule_task
- test_compiler.py
- ToolCallGuard
- test_guardrail_advanced.py
- startup.py
- Aegis — Future Roadmap (Feature Gaps)
- CanvasContextMenu.tsx
- schedule_info.py
- sub_workflow.py
- eval_runner.py
- test_templates_mvp2.py
- Aegis — System Architecture
- request_validation_error_handler
- _trigger_schedules
- ModelCallRecorder
- LangSmithSpanExporter
- Tier 1 Visual Builders
- .from_input
- Token Streaming
- _extract_run_eval_metrics
- _consume_with_timeout
- NodeSpanTracker
- services/__init__.py
- .approve
- credentials/layout.tsx
- guardrails/layout.tsx
- knowledge/layout.tsx
- observability/layout.tsx
- playground/layout.tsx
- prompts/layout.tsx
- runs/[id]/layout.tsx
- settings/layout.tsx
- templates/layout.tsx
- welcome/layout.tsx
- workflows/[id]/layout.tsx
- new/layout.tsx
- Canvas to ADK node type mapping

## God Nodes (most connected - your core abstractions)
1. `cn()` - 242 edges
2. `valid_graph()` - 150 edges
3. `validate_workflow_graph()` - 114 edges
4. `_get()` - 99 edges
5. `Button` - 65 edges
6. `Workflow` - 58 edges
7. `WorkflowVersion` - 57 edges
8. `api` - 55 edges
9. `_build_adk_node()` - 50 edges
10. `compile_workflow()` - 49 edges

## Surprising Connections (you probably didn't know these)
- `Deterministic Graph` --semantically_similar_to--> `Graph Validation`  [INFERRED] [semantically similar]
  FUTURE_PLAN.md → CLAUDE.md
- `Worker Mode Offload` --semantically_similar_to--> `Worker Execution Mode`  [INFERRED] [semantically similar]
  issues.md → CLAUDE.md
- `Session History` --semantically_similar_to--> `Session History without ADK Sessions`  [INFERRED] [semantically similar]
  CLAUDE.md → FUTURE_PLAN.md
- `Published Workflow MCP Server` --semantically_similar_to--> `Published MCP Server`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `RAG v1` --semantically_similar_to--> `kb_retrieve`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md

## Import Cycles
- 3-file cycle: `backend/app/services/approval_service.py -> backend/app/services/event_bus.py -> backend/app/services/executor.py -> backend/app/services/approval_service.py`
- 5-file cycle: `backend/app/services/approval_service.py -> backend/app/services/event_bus.py -> backend/app/services/executor.py -> backend/app/services/compiler.py -> backend/app/services/node_handlers.py -> backend/app/services/approval_service.py`

## Hyperedges (group relationships)
- **AgentOps platform roadmap phases** — agentops_plan_phase1, agentops_plan_phase2, agentops_plan_phase3, agentops_plan_phase4, agentops_plan_phase5 [EXTRACTED 1.00]
- **Aegis 2026 Audit Cycle** — deep_audit_2026_08_07 [EXTRACTED 0.90]
- **Glass & glow UI overhaul system** — docs_superpowers_specs_2026_07_01_ui_overhaul_design_glass_and_glow, docs_superpowers_specs_2026_07_01_ui_overhaul_design_design_tokens, docs_superpowers_specs_2026_07_01_ui_overhaul_design_shadcn_migration, docs_superpowers_specs_2026_07_01_ui_overhaul_design_canvas_reskin, docs_superpowers_plans_2026_07_01_ui_overhaul_motion_primitives [EXTRACTED 1.00]
- **Three P0 audit findings (broken/misleading/inaccessible)** — docs_ui_ux_audit_2026_07_25_dead_focus_ring, docs_ui_ux_audit_2026_07_25_eval_chroma_bug, docs_ui_ux_audit_2026_07_25_utc_timezone_bug [EXTRACTED 1.00]
- **Failed-run triage flow (View Failed Runs entry point surfaces same failures shown in Needs Attention rail, flagged via FAILED status color)** — docs_design_homepage_mockups_01_command_home_quick_actions, docs_design_homepage_mockups_01_command_home_needs_attention, docs_design_homepage_mockups_01_command_home_status_badges [INFERRED 0.85]
- **Mission Control page composition (nav + KPI strip + table + activity rail)** — docs_design_homepage_mockups_03_mission_control_top_nav, docs_design_homepage_mockups_03_mission_control_kpi_strip, docs_design_homepage_mockups_03_mission_control_workflow_table, docs_design_homepage_mockups_03_mission_control_live_activity_feed [EXTRACTED 1.00]
- **Color reserved for status/data encoding against monochrome chrome** — docs_design_homepage_mockups_04_instrument_table_status_pill_system, docs_design_homepage_mockups_04_instrument_table_version_hash_chips, docs_design_homepage_mockups_04_instrument_table_design_language [INFERRED 0.85]
- **Shared bone/monochrome chrome vocabulary on warm near-black surface** — docs_design_homepage_mockups_05_directory_quiet_index_top_nav, docs_design_homepage_mockups_05_directory_quiet_index_page_header, docs_design_homepage_mockups_05_directory_quiet_index_search_input, docs_design_homepage_mockups_05_directory_quiet_index_workflow_table [INFERRED 0.85]
- **Shared bone/monochrome chrome across Aegis workbench surfaces** — docs_design_homepage_mockups_06_quiet_table_mockup, docs_design_homepage_mockups_06_quiet_table_top_nav, docs_design_homepage_mockups_06_quiet_table_workflows_table [INFERRED 0.85]
- **Warm near-black monochrome chrome shared across all surfaces** — docs_design_homepage_mockups_07_master_detail_mockup, docs_design_homepage_mockups_07_master_detail_workflow_list_sidebar, docs_design_homepage_mockups_07_master_detail_detail_pane, docs_design_homepage_mockups_07_master_detail_warm_near_black_palette [EXTRACTED 1.00]
- **** — docs_design_homepage_mockups_08_system_map_mockup, docs_design_homepage_mockups_08_system_map_workflows_map_view, docs_design_homepage_mockups_08_system_map_monochrome_chrome [INFERRED 0.85]
- **Shared lab-notebook aesthetic: aged paper, ruler timeline, handwritten red marginalia on near-black panel** — docs_design_homepage_mockups_10_lab_notebook, docs_design_homepage_mockups_10_lab_notebook_timeline_rail, docs_design_homepage_mockups_10_lab_notebook_marginalia, docs_design_homepage_mockups_10_lab_notebook_design_language [INFERRED 0.85]
- **Spatial desk metaphor: workflows as physical pinned artifacts on a dark gridded desk surface** — docs_design_homepage_mockups_11_spatial_desk_workflow_cards, docs_design_homepage_mockups_11_spatial_desk_pin_slots, docs_design_homepage_mockups_11_spatial_desk_desk_metaphor, docs_design_homepage_mockups_11_spatial_desk_dark_grid_surface [INFERRED 0.85]
- **Run pipeline core loop** — claude_graph_validation, claude_compile_workflow, claude_executor [EXTRACTED 1.00]
- **Build Guard Grade Operate loop** — future_plan_build, future_plan_guard, future_plan_grade, future_plan_operate [EXTRACTED 1.00]
- **Phase 3 consumption surfaces** — claude_session_history, claude_mcp_server, claude_hosted_chat, claude_invoke_runner [EXTRACTED 1.00]
- **Four Competitor Tiers** — docs_competitive_analysis_2026_09_27_tier_1, docs_competitive_analysis_2026_09_27_tier_2, docs_competitive_analysis_2026_09_27_tier_3, docs_competitive_analysis_2026_09_27_tier_4 [EXTRACTED 1.00]
- **Unified Trust Layer on a Canvas** — docs_competitive_analysis_2026_09_27_dim_evals, docs_competitive_analysis_2026_09_27_dim_guardrails, docs_competitive_analysis_2026_09_27_dim_observability, docs_competitive_analysis_2026_09_27_authoring_canvas [EXTRACTED 1.00]

## Communities (335 total, 66 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.02
Nodes (135): credentialBinding(), extractVariables(), PlaygroundInner(), ExpressionPreview(), hasBoundContext(), ExpressionTextarea, ExpressionTextareaProps, Segment (+127 more)

### Community 1 - "button.tsx"
Cohesion: 0.05
Nodes (72): chunkLabel(), EMPTY_SETTINGS, KnowledgePage(), splitTags(), DescribeWorkflowCard(), DescribeWorkflowCardProps, GeneratedNotes(), GeneratedWorkflow (+64 more)

### Community 2 - "RunResultsPanel.tsx"
Cohesion: 0.04
Nodes (87): EdgeData, GradientEdgeImpl(), allUpstream(), directPredecessors(), NodeDataSection(), NodeDataSectionProps, NodeEvidence, oneLine() (+79 more)

### Community 3 - "cn"
Cohesion: 0.03
Nodes (107): react, CanvasStatusBar(), TONE_CLASSES, CanvasToolbar(), ToolbarButton(), CodeBlock(), DeploySheet(), DeploySheetBody() (+99 more)

### Community 4 - "node_handlers.py"
Cohesion: 0.07
Nodes (54): _coerce_number(), evaluate_condition(), Any, Template expression rendering for workflow context (n8n-style mapping)., Replace ``{{path}}`` placeholders using workflow context., Evaluate a structured IF condition (n8n-style, expression operands)., Resolve a dotted ``{{path}}`` against the workflow context. Resolvable roots:…, _render_operand() (+46 more)

### Community 5 - "observability/page.tsx"
Cohesion: 0.06
Nodes (46): AnnotationQueue, AttentionItem, buildAttentionItems(), CostDashboard, EVENT_STATUS, KIND_STATUS, kindClass(), kindLabel() (+38 more)

### Community 6 - "validate_guardrail_content"
Cohesion: 0.09
Nodes (42): _make_guardrail_fn(), apply_fail_behavior(), LlmGuardrailVerdict, ModerationVerdict, PromptInjectionVerdict, BaseModel, validate_content(), validate_guardrail_content() (+34 more)

### Community 7 - "datasets.py"
Cohesion: 0.07
Nodes (73): enqueue(), EnqueueRequest, label_task(), LabelRequest, list_queue(), AnnotationTask, BaseModel, post (+65 more)

### Community 8 - "test_agent_tools_runtime.py"
Cohesion: 0.28
Nodes (21): approval_run(), call(), execute(), graph(), BaseLlm, parametrize, Consumer behavior under actual ADK Runner, sessions, and FunctionTools., Only MCP transport is isolated; ADK declarations, calls, loop are real. (+13 more)

### Community 9 - "test_checkpoints.py"
Cohesion: 0.08
Nodes (64): Per-node execution checkpoint for crash/restart resume. Status mirrors node…, RunCheckpoint, compute_resume(), _incoming_exec_edges(), _list_checkpoints(), load_checkpoints(), mark_node_completed(), mark_node_started() (+56 more)

### Community 10 - "guardrail_policy_plugin.py"
Cohesion: 0.11
Nodes (26): GuardrailBlockedError, _before_model_multipart(), _contents_to_text(), _decide_soft(), _decode_str_response(), _expects_json(), Any, LlmResponse (+18 more)

### Community 11 - "prompts.py"
Cohesion: 0.16
Nodes (31): create_prompt(), create_version(), delete_prompt(), _detail(), get_prompt_detail(), get_version_detail(), list_prompts(), list_versions() (+23 more)

### Community 12 - "test_model_matrix.py"
Cohesion: 0.04
Nodes (77): Credential, _guardrail_pm(), _pm_unavailable(), The resolved model for a guardrail LLM call. Prefer the model resolved at…, Ask the model to coerce ``text`` into JSON matching ``schema``. Returns the…, True when the resolved provider has no usable API key configured., LLM cleanup pass: remove the violating material, keep the substance., _repair_to_schema() (+69 more)

### Community 13 - "test_startup.py"
Cohesion: 0.12
Nodes (33): Fail orphaned running jobs after a crash or deploy; keep queued ones. Only…, Recover orphaned runs after a crash or deploy. Only rows older than…, recover_stale_jobs(), recover_stale_runs(), _expire_runs(), _get_run(), WorkflowRun, A run that keeps crashing stops resuming and fails with the stale message. (+25 more)

### Community 14 - "test_event_triggers.py"
Cohesion: 0.19
Nodes (19): _event_signed_headers(), _issue(), _published_bound_workflow(), _published_workflow(), fixture, Phase 5: multiple schedules per workflow + inbound event webhooks., Schedule rows pin the published version: publish re-syncs from the published…, Workflow whose webhook trigger declares its Slack workspace. (+11 more)

### Community 15 - "valid_graph"
Cohesion: 0.09
Nodes (54): executable_graph(), Extract executable nodes/edges from an already validated graph., Validate canvas graph before save or compile. Returns summary metadata., validate_workflow_graph(), Build a graph that satisfies Trigger → … → End validation., valid_graph(), P1-2: bare google-search Agent never sets ctx.route — error edges dead-end., Wrapped tool handlers still support error routing. (+46 more)

### Community 16 - "event_bus.py"
Cohesion: 0.06
Nodes (66): _as_uuid(), _catchup_sweep(), _consume_notifications(), delete_run_events(), _deliver_run_event(), _dispatch_new_events(), _drain_notifies(), fetch_run_events() (+58 more)

### Community 17 - "WorkflowCanvas.tsx"
Cohesion: 0.05
Nodes (67): ClipboardStore, copyToClipboard(), duplicateFragment(), hasClipboard(), materialize(), materializeClipboard(), materializeFragmentAt(), nextNodeIndex() (+59 more)

### Community 18 - "run_concurrency.py"
Cohesion: 0.08
Nodes (42): publish_terminal_sync(), Best-effort terminal event pair for writers outside ``execute_run``.…, active_run_ids(), _cas_terminal_write(), Run ids that currently have a live in-process asyncio task., Single-winner terminal write: UPDATE … WHERE status non-terminal. Every…, purge_old_runs(), Data retention for old workflow runs. (+34 more)

### Community 19 - "executor.py"
Cohesion: 0.06
Nodes (58): configure_runtime_env(), Unset IDE-local Gemini proxy vars that break direct API calls., EvalThresholdBlockedError, Exception, _as_utc(), _commit_db(), _drain_queued_runs(), _ensure_api_key() (+50 more)

### Community 20 - "app/main.py"
Cohesion: 0.10
Nodes (35): AbstractEventLoop, Idempotent acquire of the process-shared HTTP client. Lifespans (API, worker)…, shutdown_http_client(), startup_http_client(), configure_logging(), StructuredFormatter, health(), _health_db_counts() (+27 more)

### Community 21 - "tracing.py"
Cohesion: 0.09
Nodes (37): install_http_middleware(), _is_content_key(), _is_secret_key(), langsmith_traces_endpoint(), _llm_messages(), Any, OpenTelemetry tracing for workflow execution, HTTP requests and model calls.…, Full OTLP traces URL for a LangSmith API base. ``base`` is the LangSmith *API*… (+29 more)

### Community 22 - "eval.py"
Cohesion: 0.18
Nodes (10): compute_aggregate_score(), preview_eval(), Any, Live rubric preview — run the LLM judge on a sample input/output. Powers the…, Score a sample with the given rubric. Returns the per-dimension scores + the…, scores_delta(), Custom rubric editor: eval-preset update (PATCH) + live sample preview. The…, test_preview_without_key_skips() (+2 more)

### Community 23 - "experiment_runner.py"
Cohesion: 0.17
Nodes (21): _aggregate(), _compute_verdict(), Any, UUID, Batch experiments: run a dataset against workflow version(s), score, compare.…, Regression verdict for one candidate aggregate vs the baseline., run_experiment(), _run_one_item() (+13 more)

### Community 24 - "app/page.tsx"
Cohesion: 0.09
Nodes (44): buildContinueItems(), HomePage(), PromptsPage(), ContinueTiles(), HomePulseBar(), PulseStat(), NextActionsPanel(), PinnedPanel() (+36 more)

### Community 25 - "services/assist.py"
Cohesion: 0.08
Nodes (41): AssistHistoryTurn, DraftedDataset, DraftedDatasetItem, attached_tool_node_ids(), Declaration IDs referenced by agents; call validation before execution. This…, _builtin_preset_catalog_prompt(), _capped_history(), draft_eval_suite() (+33 more)

### Community 26 - "Recommended Build Sequence"
Cohesion: 0.16
Nodes (31): aegis CLI and CI Gate, deploy_descriptor.py, Dify, Agent Tool-Calling Loop, Agents as Artifacts, AI-assisted Authoring, Chat Surface and Session Memory, Event Triggers (+23 more)

### Community 27 - "_get"
Cohesion: 0.10
Nodes (49): approve_run(), _as_utc(), create_run(), _create_run_record(), export_run(), get_run(), get_run_llm_calls(), get_run_timeline() (+41 more)

### Community 28 - "CanvasSidebar.tsx"
Cohesion: 0.15
Nodes (17): CanvasSidebarProps, CanvasSidebarTab, RunComparison, TabPanelFade(), tabs, VersionHistory, WorkflowDataPanel, WorkflowQualityPanel (+9 more)

### Community 29 - "test_p3c_boot.py"
Cohesion: 0.10
Nodes (25): field_validator, Settings, claim_pending_runs(), UUID, Claim claimable runs by CAS-ing their status to ``running``. The selection…, _get_status(), WorkflowRun, P3-C slice A: config/boot/worker fixes. Covers: - #25: run_execution_mode is… (+17 more)

### Community 30 - "ingest_otlp_run"
Cohesion: 0.06
Nodes (43): NodeResult, _attrs(), _bounded_duration_ms(), _coerce_output_text(), _collect_spans(), _decode_anyvalue(), ingest_otlp_run(), _model() (+35 more)

### Community 31 - "CommandPalette.tsx"
Cohesion: 0.07
Nodes (31): DraftTextarea(), ErrorBoundary, AppShell(), Action, CommandPalette(), emitAddNode(), EXPORT_TRACE_EVENT, NAV_ACTIONS (+23 more)

### Community 32 - "models.py"
Cohesion: 0.06
Nodes (40): _columns(), downgrade(), _indexes(), _inspector(), upgrade(), upgrade(), upgrade(), upgrade() (+32 more)

### Community 33 - "test_executor.py"
Cohesion: 0.08
Nodes (49): _enqueue_event(), _extract_text_parts(), _json_default(), _normalize_text_part(), _on_remote_run_event(), _put_run_event(), Any, Queue (+41 more)

### Community 34 - "job_queue.py"
Cohesion: 0.20
Nodes (18): job_status(), Session, UUID, Background job status API., BackgroundJob, create_job(), dispatch_job(), get_job() (+10 more)

### Community 35 - "test_langsmith_tracing.py"
Cohesion: 0.15
Nodes (32): _all_text(), _execute(), _FailingExporter, _graph_with_secret(), langsmith_sink(), asyncio, fixture, SpanExporter (+24 more)

### Community 36 - "api/assist.py"
Cohesion: 0.10
Nodes (51): compare(), draft_eval_suite(), edit_graph(), explain_run(), generate_schema(), generate_workflow(), _get_user_run(), DraftEvalSuiteResponse (+43 more)

### Community 37 - "AssistRail.tsx"
Cohesion: 0.17
Nodes (14): assistantHistoryContent(), AssistantTurn(), AssistRail(), AssistRailProps, AssistTurn, buildHistory(), buildLabelMap(), DiffGroup() (+6 more)

### Community 38 - "graph_validation.py"
Cohesion: 0.07
Nodes (41): AgentToolSchemaError, MCPToolReference, NodeToolReference, TypedDict, ValueError, Agent tool references and the executable/declaration boundary of a graph., Validate stable references and bounds, returning attached declarations. MCP…, validate_agent_tool_schema() (+33 more)

### Community 39 - "CanvasTour.tsx"
Cohesion: 0.18
Nodes (19): FirstRunHero(), CanvasTour(), computePosition(), findVisibleAnchor(), Position, resolveStepIndex(), warnDev(), GettingStartedBanner() (+11 more)

### Community 40 - "BaseNode.tsx"
Cohesion: 0.10
Nodes (27): NodePaletteProps, BaseNode, BORDER_BY_STATE, ExtendedNodeData, formatTokens(), NodeChip(), NodeChipRow(), NodeRuntimeState (+19 more)

### Community 41 - "decrypt_value"
Cohesion: 0.16
Nodes (20): _coerce_config(), downgrade(), Encrypt existing plaintext credential secret values at rest (Fernet).…, config may come back as dict (PG JSONB) or str (SQLite JSON)., _rewrite(), _secret_keys(), upgrade(), decrypt_value() (+12 more)

### Community 42 - "workflows.py"
Cohesion: 0.14
Nodes (46): bulk_import_knowledge(), compare_runs(), create_knowledge_document(), create_workflow(), delete_knowledge_document(), delete_workflow(), delete_workflow_memory(), duplicate_workflow() (+38 more)

### Community 43 - "test_rag_v1.py"
Cohesion: 0.06
Nodes (53): chunk_by_strategy(), _chunk_fixed(), _chunk_paragraphs(), chunk_text(), _decode_text(), _expand_ratio(), parse_document(), _parse_docx() (+45 more)

### Community 44 - "node-registry.ts"
Cohesion: 0.08
Nodes (26): COMPARE_ELIGIBLE, NodeInspector(), RELIABILITY_NODE_TYPES, accent, ACCEPTS_NOUN, describeKindMismatch(), EXPRESSION_HINT, getNodeDefinition() (+18 more)

### Community 45 - "platform.py"
Cohesion: 0.11
Nodes (38): deployment_descriptor(), GenericInvokePayload, get_deploy_descriptor(), get_published(), ingest_run(), IngestNodeEvent, IngestRunPayload, invoke_deployment() (+30 more)

### Community 46 - "WorkflowContext"
Cohesion: 0.07
Nodes (38): _ancestors(), _node_data(), _node_type(), prune_graph_for_start(), ValueError, Authoring-only run helpers: pin outputs + run-from-here. These features let the…, All nodes that can reach ``node_id`` (strict upstream set)., Return a new graph that begins execution at ``start_node_id``. Strictly-… (+30 more)

### Community 47 - "GuardrailPlayground.tsx"
Cohesion: 0.14
Nodes (25): GuardrailPlayground(), policyPresets, PolicyTemplates(), PolicyTemplatesProps, ruleSummary(), toConfig(), configFromRules(), GUARDRAIL_TYPES (+17 more)

### Community 48 - "compiler.py"
Cohesion: 0.06
Nodes (65): AdkEdge, AST, AsyncExitStack, AgentBudgetExceeded, AgentFunctionTool, AgentToolState, _build_tools(), RuntimeError (+57 more)

### Community 49 - "mcp_server.py"
Cohesion: 0.10
Nodes (34): _MCPASGIEndpoint, MCP mount surface: wires the stateless MCP ASGI app into the FastAPI router.…, _args_to_payload(), _authenticate_deployment_headers(), call_tool(), _deployment_auth_missing(), _handle_post(), _json_rpc_error() (+26 more)

### Community 50 - "api"
Cohesion: 0.07
Nodes (50): WorkflowCanvas, ExperimentsPanel(), ExperimentsPanelProps, verdictBadge(), InspectorSection(), PanelStat(), PanelStatGrid(), STAT_TONES (+42 more)

### Community 51 - "test_workflow_capabilities.py"
Cohesion: 0.22
Nodes (23): missing_provider_keys(), LLM providers a graph needs at run time (from per-node model selection)., Env vars for providers a graph needs but has no usable key for. A provider…, workflow_needs_gemini(), workflow_required_providers(), _agent(), Provider-aware run gating: which API keys a graph needs before it can run., A node with a bound provider credential runs even without an env key. (+15 more)

### Community 52 - "services/credentials.py"
Cohesion: 0.12
Nodes (30): decrypt_credential_config(), encrypt_credential_config(), get_user_credential(), load_mcp_credential(), mask_credential_config(), mcp_cached_tools(), Any, Session (+22 more)

### Community 53 - "cron_is_valid"
Cohesion: 0.13
Nodes (18): preview_cron(), cron_is_valid(), cron_next_runs(), _is_supported_shape(), datetime, Cron expression helpers for schedule triggers., Only 5-field expressions (or an ``@`` macro) are supported. croniter accepts a…, UUID (+10 more)

### Community 54 - "test_phase9.py"
Cohesion: 0.11
Nodes (31): get_node_meta(), NodeTypeMeta, TypedDict, Canonical node type metadata for the agentic workflow builder., normalize_workflow_import(), ValueError, Validate Aegis JSON imports; not an OpenAI Agent Builder code converter., Reject malformed or unsupported nodes before DAG validation can omit them. (+23 more)

### Community 55 - "services/node_test.py"
Cohesion: 0.07
Nodes (54): expression_preview(), _load_workflow_graph(), node_test(), post, Session, UUID, Ephemeral node-test and expression-preview endpoints (canvas authoring aids).…, Blocking DB reads for the node-test endpoint (runs in a worker thread). (+46 more)

### Community 56 - "Migrate from OpenAI Agent Builder to Aegis"
Cohesion: 0.33
Nodes (5): Deadline and supported path, Executable safe Aegis import example, Migrate from OpenAI Agent Builder to Aegis, Node-by-node manual mapping, What JSON import accepts and rejects

### Community 57 - "retrieve_documents"
Cohesion: 0.15
Nodes (25): _cosine_similarity(), Any, Keyword and BM25 knowledge retrieval (Lyzr RAG-lite)., retrieve_documents(), score_document(), score_document_bm25(), score_document_tfidf(), _tokenize() (+17 more)

### Community 58 - "observability_service.py"
Cohesion: 0.06
Nodes (81): InsightQueueRequest, observability_costs(), observability_dashboards(), observability_errors(), observability_insights(), observability_overview(), observability_quality(), observability_runs() (+73 more)

### Community 59 - "get_vector_store"
Cohesion: 0.11
Nodes (28): delete_document_vectors(), _embedding_literal(), get_vector_store(), pgvector_available(), PgVectorStore, Any, Session, UUID (+20 more)

### Community 60 - "test_mvp2_infra.py"
Cohesion: 0.13
Nodes (20): rate_limit_middleware(), check_rate_limit(), deployment_invoke_path(), _limit_setting_for(), Request, rate_limited_path(), Which paths the middleware should submit to the limiter., _apply_call_resilience() (+12 more)

### Community 61 - "safe_http_request"
Cohesion: 0.05
Nodes (57): _pg_engine(), _hostname_blocked(), _is_blocked_ip(), AsyncClient, Response, DNS-resolving endpoint check for keyless providers (Ollama). Resolves the…, Like :func:`validate_hostname_public` but permits loopback/private IPs. Still…, Reject URLs that target private networks or local services (SSRF mitigation). (+49 more)

### Community 62 - "guardrail_policies.py"
Cohesion: 0.17
Nodes (22): create_policy(), delete_policy(), _get_policy(), list_policies(), list_templates(), PolicyCreate, PolicyUpdate, BaseModel (+14 more)

### Community 63 - "test_upgrade_phase3.py"
Cohesion: 0.14
Nodes (27): _alternation_risks_backtracking(), evaluate_embedding_similarity(), evaluate_exact(), evaluate_json_schema(), evaluate_numeric(), evaluate_regex(), evaluate_substring(), _has_nested_quantifier() (+19 more)

### Community 64 - "mcp_client.py"
Cohesion: 0.17
Nodes (23): _allowed_hosts(), _bounded_json(), make_mcp_tool_cache(), MCPClientError, MCPDisabledError, MCPSession, MCPTimeoutError, MCPToolError (+15 more)

### Community 65 - "RunDeck.tsx"
Cohesion: 0.17
Nodes (28): asRecord(), eventClass(), EventGlyph(), eventLabel(), eventStatus(), eventTime(), formatElapsed(), metricNumber() (+20 more)

### Community 66 - "test_assist.py"
Cohesion: 0.16
Nodes (29): GenEdge, GeneratedWorkflowDraft, GenNode, A node as returned by Gemini structured output., _assign_positions(), _draft_to_graph(), generate_workflow(), Layer nodes left-to-right by BFS depth from entry nodes. Faithful port of the… (+21 more)

### Community 67 - "wait_for_approval"
Cohesion: 0.21
Nodes (24): park_approval(), Park an approval wait, returning the wait metadata. ``allow_reuse`` (tool…, wait_for_approval(), backdate(), asyncio, parametrize, Approval audit transitions, deadline boundaries, and notification failures., A waiter whose Event was never signalled still resolves via the DB poll. (+16 more)

### Community 68 - "eval_presets.py"
Cohesion: 0.17
Nodes (24): _as_list_item(), create_eval_preset(), delete_eval_preset(), list_eval_presets(), preview_eval_preset(), delete, patch, post (+16 more)

### Community 69 - "wrap_graph_with_trigger_end"
Cohesion: 0.13
Nodes (28): executable_nodes(), Workflow steps, excluding annotations and agent-attached declarations., Helpers for standard Trigger → … → End workflow graphs., Prepend Trigger and append End, wiring entry/exit automatically. When…, wrap_graph_with_trigger_end(), prune_graph_for_resume(), Return a new graph that resumes a crashed run at ``frontier_ids``. Nodes…, _declaration_graph() (+20 more)

### Community 70 - "services/alerts.py"
Cohesion: 0.18
Nodes (26): AlertRule, Threshold rule evaluated by the scheduler tick., _breached(), evaluate_alert_rules(), _metric_over_window(), _metric_value(), AlertRule, Session (+18 more)

### Community 71 - "test_audit_p1_p2_fixes.py"
Cohesion: 0.20
Nodes (26): _approval_key(), clear_approval_state(), _linear_graph(), _park_run_approval(), parametrize, WorkflowRun, Integration coverage for previously-dark critical paths (audit P1/P2). Targets…, A decision committed by another process reaches a waiter that never gets the… (+18 more)

### Community 72 - "test_security_fixes.py"
Cohesion: 0.07
Nodes (49): validate_code_safety(), _in_spans(), _literal_spans(), _parameterize_query(), _post_integration_webhook(), Any, Integration node handlers — Slack, Email, Postgres (n8n-style)., Validate the URL targets a public Postgres host and return the pinned IP.… (+41 more)

### Community 73 - "chat.ts"
Cohesion: 0.19
Nodes (23): invokeWithKey(), invokeWithSession(), isSameOriginRequest(), POST(), relay(), isSameOriginRequest(), POST(), ChatPage() (+15 more)

### Community 74 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 75 - "Backend Requirements"
Cohesion: 0.10
Nodes (26): Backend Requirements, duckduckgo-search, FastAPI, google-adk 2.11.0, google-genai, pypdf, python-docx, SQLAlchemy (+18 more)

### Community 76 - "test_p3c_input.py"
Cohesion: 0.10
Nodes (13): _make_run(), _make_workflow(), _post_raw_json(), P3-C / M8: request inputs that previously sailed through Pydantic and crashed…, Send a body with non-standard JSON (NaN/Infinity) — requests' strict serializer…, test_alert_threshold_inf_rejected(), test_alert_threshold_nan_rejected(), test_eval_preset_score_weight_nan_rejected() (+5 more)

### Community 77 - "Canvas Commoditization"
Cohesion: 0.16
Nodes (15): Aegis Competitive Landscape September 2026, Adaptive ML, Six Adoption Blockers, August 6 2026 Internal Analysis, Authoring Canvas, Canvas Commoditization, Build Guard Grade Operate Convergence, Report Coverage Boundaries (+7 more)

### Community 78 - "app/layout.tsx"
Cohesion: 0.09
Nodes (25): metadata, plexMono, Toaster, viewport, AppRail(), MobileNav(), MotionProvider(), Toaster() (+17 more)

### Community 79 - "test_agentops_phase3.py"
Cohesion: 0.14
Nodes (22): enrich_graph_guardrail_policies(), Resolve guardrail nodes' policyId into concrete rules before compile. Node-…, GuardrailPolicy, Named, reusable guardrail rule bundle., check_workflow_budget(), _positive_number(), Session, Workflow (+14 more)

### Community 80 - "db/__init__.py"
Cohesion: 0.12
Nodes (26): ObservabilityRollup, _adjust_bucket(), aggregate_rollups_for_user(), _bucket_hour(), _claim_ledger_transition(), datetime, Session, UUID (+18 more)

### Community 81 - "test_p3c_bus.py"
Cohesion: 0.14
Nodes (16): _bounded_put(), Insert ``key``/``value``, evicting the oldest entry when the map is full.…, asyncio, P3-C fixes: event-bus retry/queue bounds, async task logging, audit truncation,…, Unknown run id → permanent FK violation: raised immediately., The pre-fix bug: f.exception() on a cancelled concurrent Future raises…, Cancelled cross-thread coroutines must not log a failure traceback. Exercises…, test_bounded_put_evicts_oldest() (+8 more)

### Community 82 - "test_node_test_api.py"
Cohesion: 0.15
Nodes (25): EvalScores, BaseModel, _agent_workflow(), Tests for the ephemeral node-test and expression-preview endpoints. No test…, _seed_run(), _seed_workflow(), test_expression_preview_from_run_steps_resolution(), test_expression_preview_most_recent_run_when_no_run_id() (+17 more)

### Community 83 - "test_p3c_graph.py"
Cohesion: 0.15
Nodes (26): _edge(), _node(), _pinned_graph(), parametrize, P3-C slice G: reliability fields on bare-Agent nodes, pinned-output…, Outer router → inner router → merge → parallel → join is valid. Whichever inner…, Inner route y never reaches the join — that join can stall., test_join_accepts_nested_router_that_reconverges_before_the_join() (+18 more)

### Community 84 - "test_p3c_workflows.py"
Cohesion: 0.15
Nodes (19): _create_workflow(), P3-C workflow-slice fixes: upload cap enforcement, workflow-delete vector…, title → String(255), source_name → String(512): the multipart fields bypass…, sqlite-vec needs a Python whose sqlite3 exposes loadable extensions — absent on…, The staged payload lands whole in background_jobs.payload_json — the endpoint…, A lying/absent Content-Length must not bypass the cap: the endpoint accumulates…, test_bulk_import_job_payload_capped(), test_bulk_import_small_payload_still_queues() (+11 more)

### Community 85 - "embeddings.py"
Cohesion: 0.14
Nodes (27): cosine_similarity_vectors(), embed_text(), _hashing_vector(), Any, Text embeddings for vector RAG (Gemini with TF-IDF fallback)., retrieve_by_embedding(), delete_embedding_vector(), _pgvector_available() (+19 more)

### Community 86 - "conftest.py"
Cohesion: 0.10
Nodes (20): _clear_rate_buckets(), _enter_app_lifespan(), fixture, Clear every process-local sliding-window limiter we know about., Delete all rows after each test so fixtures and writes can't leak. The suite…, Stamp the DB at Alembic head so the startup migration gate sees it current. The…, Run the FastAPI lifespan once so startup/shutdown paths execute. Module-level…, Function-scoped reset of the in-process rate limiter. Auth-enabled endpoints… (+12 more)

### Community 87 - "test_assist_eval_suite.py"
Cohesion: 0.20
Nodes (22): _EvalItemDraft, _EvalPresetDraft, _EvalSuiteDraft, Gemini structured-output shape for the draft-eval-suite prompt., _clear_rate_buckets(), _draft(), _mock_response(), fixture (+14 more)

### Community 88 - "test_upgrade_phase4.py"
Cohesion: 0.18
Nodes (16): broadcast_observability_event(), Any, Queue, User-scoped SSE fan-out for live observability updates., stream_observability_events(), subscribe_observability(), unsubscribe_observability(), maybe_emit_eval_regression() (+8 more)

### Community 89 - "Evaluation"
Cohesion: 0.22
Nodes (18): Braintrust, Braintrust Loop, Annotation Queues, Evaluation, Observability, Prompt Registry and Playground, Humanloop, LangSmith Insights (+10 more)

### Community 90 - "index.ts"
Cohesion: 0.18
Nodes (14): registry, StaggerRecord, useEntryStagger(), HoverLift(), Props, NumberTween(), Props, PageEnter() (+6 more)

### Community 91 - "meta.py"
Cohesion: 0.10
Nodes (31): list_models(), list_node_types(), OnlineSamplingUpdate, ops_config(), preview_guardrail(), BaseModel, field_validator, patch (+23 more)

### Community 92 - "Workbench.tsx"
Cohesion: 0.05
Nodes (49): metadata, CodeTab, IncidentLink(), CODE_TABS, DURABILITY, LandingPage(), LOOP, NAV (+41 more)

### Community 93 - "test_assist_history.py"
Cohesion: 0.29
Nodes (17): SuggestionsDraft, _current_graph(), _last_prompt(), _mock_response(), patch, Tests for threaded copilot history on the edit-graph / suggest-nodes assist…, Absent/empty history -> no history block, endpoint behaves as before., Different history -> cache miss; same history -> cache hit. (+9 more)

### Community 94 - "guardrail.py"
Cohesion: 0.09
Nodes (40): _parse_guardrail_status(), _bounded_regex_sub(), _evaluate_moderation_scores(), GuardrailResult, _judge_failure(), _judge_provider_model(), _mask_all_violations(), _mask_violation() (+32 more)

### Community 95 - "test_reviewfix_auth.py"
Cohesion: 0.25
Nodes (22): _chat_invoke(), _echo_workflow(), _exchange(), _invoke_headers(), _issue(), _publish_echo(), fixture, Review-fix regressions: MCP deployment-scoped discovery + body-bound… (+14 more)

### Community 96 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 97 - "create_template"
Cohesion: 0.16
Nodes (19): _builtin_items(), create_template(), list_eval_presets(), list_templates(), _persisted_item(), post, Session, UUID (+11 more)

### Community 98 - "test_mcp_client.py"
Cohesion: 0.12
Nodes (22): get_db(), open_mcp_session(), Initialize, list/call on, and deterministically close one credential session., Synchronous write-path validation; requests independently revalidate DNS., validate_mcp_endpoint(), deployment_client(), fixture, _assert_process_gone() (+14 more)

### Community 99 - "validate_safe_regex"
Cohesion: 0.14
Nodes (20): _alternation_branches_overlap(), _body_has_unbounded_quantifier(), _branch_profile(), _has_catastrophic_structure(), _iter_quantified_groups(), ValueError, Guardrails against catastrophic backtracking in user-supplied regex patterns.…, Yield the inner body of every group immediately followed by an unbounded… (+12 more)

### Community 100 - "test_chat_token.py"
Cohesion: 0.22
Nodes (22): _bind_session_id(), Namespace stored chat history under the session token's ``sid``. A bare client-…, _chat_invoke(), _deployment(), _echo_graph(), _exchange(), _expired_session(), _issue() (+14 more)

### Community 101 - "test_mcp_server.py"
Cohesion: 0.21
Nodes (19): _sanitize_tool_name(), _invoke_headers(), _mcp_post(), _published_workflow(), asyncio, Response, MCP server surface: /mcp JSON-RPC tools exposed from published deployments., The stdio server's tool comes from the deployment descriptor; calls POST to the… (+11 more)

### Community 102 - "knowledge_library.py"
Cohesion: 0.16
Nodes (37): add_file(), add_text(), _base_out(), _chunk_counts(), _citation(), create_base(), delete_base(), delete_source() (+29 more)

### Community 103 - "sync_workflow_schedule"
Cohesion: 0.17
Nodes (24): WorkflowSchedule, Session, sync_workflow_schedule(), _create_scheduled_run_row(), Claim the fire minute by inserting its pending run row. The row IS the claim:…, _scan_scheduled_workflows(), _graph_with_crons(), A renamed cron must not double-fire the same minute, but a newly added sibling… (+16 more)

### Community 104 - "test_assist_mvp2.py"
Cohesion: 0.24
Nodes (19): _EditGraphDraft, _GeneratedSchemaDraft, Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)., Gemini structured-output shape. schema_object_json is a JSON-encoded string…, _current_graph(), _edit_draft_add_guardrail(), _mock_response(), patch (+11 more)

### Community 105 - "RunDetailView.tsx"
Cohesion: 0.08
Nodes (26): WorkflowPage(), TraceIdBadge(), GuardrailEvent, GuardrailEventsPanel(), GuardrailEventsPanelProps, guardrailIcon(), guardrailVariant(), ApprovalMetadata() (+18 more)

### Community 106 - "run_email_integration"
Cohesion: 0.42
Nodes (8): Return an error message when the recipient is invalid; None if acceptable., run_email_integration(), _validate_single_email_recipient(), asyncio, test_email_missing_to_after_render(), test_email_rejects_multiple_recipients(), test_email_single_recipient_succeeds_without_smtp(), test_email_without_smtp_does_not_leak_payload()

### Community 107 - "TokenTrackerPlugin"
Cohesion: 0.11
Nodes (31): estimate_cost_usd(), _local_cost_map(), ModelRates, Any, BasePlugin, Per-run token and cost accounting via ADK plugin callbacks. ADK 2.x's workflow…, Accumulates LLM token usage per ADK agent name for a single run., Flatten genai contents/parts into readable prompt text. (+23 more)

### Community 108 - "init_tracing"
Cohesion: 0.17
Nodes (16): _build_langsmith_processor(), _exported_context(), get_trace_id(), init_tracing(), _parse_headers(), Idempotent: safe to call from both the API and the worker process., Context of the current span, only if it will actually be exported. An unsampled…, A non-recording span has a valid context; persisting its id would point at a… (+8 more)

### Community 109 - "GuardrailPolicyPlugin"
Cohesion: 0.14
Nodes (30): Build a workflow-level guardrail plugin from the trigger node's config. The…, _resolve_workflow_guardrail_plugin(), GuardrailPolicyPlugin, BasePlugin, Applies a single guardrail policy to every agent's model input/output. ``mode``…, LlmResponse, parametrize, Workflow-level guardrail policy plugin (ADK callbacks). A single policy applied… (+22 more)

### Community 110 - "Run Executor"
Cohesion: 0.11
Nodes (20): psycopg Drivers, Workflow Budget Enforcement, Direct LLM Accounting Bypass, WorkflowRun Lost Updates, Schedules Pin Draft Versions, Trace Secret Scrub Gaps, SSE Broker Lifecycle Leaks, Stale Recovery versus Live Runs (+12 more)

### Community 112 - "Author Harden Grade Operate Ship"
Cohesion: 0.12
Nodes (19): Phase 3 Guardrails as policy layer, Presidio, Guardrail Fail-Open Paths, Annotation Queue, dataset copy_runs, Deferred Enterprise Tenancy, Fail-Closed Guardrails, Grade Stage (+11 more)

### Community 113 - "api/credentials.py"
Cohesion: 0.25
Nodes (17): cached_mcp_tools(), create_credential(), delete_credential(), discover_mcp_tools(), list_credentials(), _owned_mcp_credential(), delete, post (+9 more)

### Community 114 - "approval_service.py"
Cohesion: 0.17
Nodes (21): ApprovalRequest, Durable approval wait truth; any process can resolve, waiters poll the row., _decision_from_state(), _metadata(), _notification_data(), notify_approval(), _on_remote_decision(), Any (+13 more)

### Community 115 - "test_iteration_node.py"
Cohesion: 0.30
Nodes (19): _ctx(), _iter_fn(), Tests for the iteration node (map-over-list, Dify-style single-node loop). The…, Parallel children folding _direct_llm_calls through the shallow item_ctx copy…, _run(), test_iteration_empty_items_yields_empty_array(), test_iteration_fail_on_error_raises(), test_iteration_folds_child_direct_llm_calls_into_parent_ctx() (+11 more)

### Community 116 - "test_phase3_surfaces.py"
Cohesion: 0.27
Nodes (14): _echo_graph(), _get_run(), _invoke(), _invoke_headers(), _issue_invoke_key(), _published_workflow(), Phase 3 platform surfaces: session rehydration, streaming invoke, token deltas.…, Second invoke with the same session_id sees turn 1's input+output. (+6 more)

### Community 117 - "test_sqlite_uuid_affinity.py"
Cohesion: 0.16
Nodes (18): test_regression_gate_has_no_shell_interpolation(), _broken_db(), Regression coverage for the SQLite NUMERIC-affinity UUID defect fixed by…, Rows that were always fine (mixed-case hex, letters present) survive the repair…, A numeric UUID like …0010 collapses to integer 10; the repair must restore the…, End-to-end the original crash: insert via the real models on a migrated DB and…, Run `alembic upgrade head` against a scratch file. env.py resolves the URL from…, Hand-build the pre-021 defect: UUID-affinity column + an int-stored all-digit… (+10 more)

### Community 118 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @next/bundle-analyzer, postcss, tailwindcss (+11 more)

### Community 119 - "useRunReplay.ts"
Cohesion: 0.16
Nodes (16): PostRunTransport(), PostRunTransportProps, RunProgressStrip(), RunProgressStripProps, useElapsedSeconds(), deriveState(), isCompletedStatus(), isFailedStatus() (+8 more)

### Community 120 - "playground.py"
Cohesion: 0.13
Nodes (27): _clip(), list_playground_runs(), _persist_playground_run(), post, Session, UUID, Standalone prompt playground — run a template against N model targets without…, run_playground() (+19 more)

### Community 121 - "schedule_worker.py"
Cohesion: 0.12
Nodes (28): _catchup_minutes(), _created_at_in_minute(), cron_matches_now(), _dispatch_due_runs(), _evaluate_alerts(), _maybe_recover_stale_runs(), _maybe_run_retention(), _minute_key_dt() (+20 more)

### Community 122 - "api/knowledge.py"
Cohesion: 0.16
Nodes (26): get_documents(), get_libraries(), KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeQuery, KnowledgeTextCreate, KnowledgeUrlCreate, patch_library() (+18 more)

### Community 123 - "02 Split Studio Homepage Mockup"
Cohesion: 0.15
Nodes (18): Aegis Visual Agent Workflow Workbench, Bone and Monochrome Chrome, 02 Split Studio Homepage Mockup, Invoice Processing Pipeline, Last Run Summary, Open Canvas Action, Pipeline Graph Preview, Color-Coded Pipeline Nodes (+10 more)

### Community 124 - "api/alerts.py"
Cohesion: 0.24
Nodes (16): AlertRuleCreate, AlertRuleUpdate, create_rule(), delete_rule(), list_events(), list_rules(), AlertRule, BaseModel (+8 more)

### Community 125 - "chat.py"
Cohesion: 0.23
Nodes (14): chat_invoke(), ChatInvokeRequest, ChatSessionRequest, create_chat_session(), BaseModel, datetime, post, Session (+6 more)

### Community 126 - "templates/page.tsx"
Cohesion: 0.11
Nodes (24): CapabilityBadges(), complexityLabel(), FILTER_IDS, FILTER_OPTIONS, TemplateCard(), TemplateCardProps, TemplateFilter, templateFlags() (+16 more)

### Community 127 - "dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, clsx, framer-motion, dependencies, class-variance-authority, clsx, framer-motion, next (+9 more)

### Community 128 - "Attention Inbox layout"
Cohesion: 0.14
Nodes (17): Approvals queue, Bone monochrome chrome, data/warehouse-sync-pipeline failed run, Editorial Aegis home page header, Monospace error log trace, Failed runs queue, Failure metadata header, Attention Inbox layout (+9 more)

### Community 129 - "test_online_sampling.py"
Cohesion: 0.30
Nodes (14): get_online_eval_sample_rate(), Session, The instance-wide, durable online-evaluation sampling override., set_online_eval_sample_rate(), asyncio, fixture, parametrize, sampling_client() (+6 more)

### Community 130 - "test_deployment_auth.py"
Cohesion: 0.40
Nodes (13): invoke_headers(), issue(), Consumer-visible scope, publication, rotation and raw-body signing guarantees., signed_headers(), test_account_keys_cannot_invoke_and_invoke_keys_cannot_manage(), test_invoke_key_matches_only_published_deployment(), test_invoke_quota_shared_across_routes_and_ignores_account_headers(), test_only_owner_editor_can_rotate_or_revoke() (+5 more)

### Community 131 - "Cross-App Node Type System"
Cohesion: 0.16
Nodes (15): Error-Swallowing Node Handlers, Branch Edge Semantics, Aegis, compile_workflow, Design Language, Frontend Node Registry, Frontend Workflow Types, Google ADK (+7 more)

### Community 132 - "Provider-aware cost estimates"
Cohesion: 0.50
Nodes (3): Provider-aware cost estimates, Rate source, Usage contract

### Community 133 - "deps.py"
Cohesion: 0.16
Nodes (22): alias, _api_key_user_map(), get_current_user_id(), get_owner_user_id(), Request, UUID, Map api key -> (user_id, role). Values may be a bare uuid string or {"user_id":…, _resolve_api_token() (+14 more)

### Community 134 - "test_prompt_registry.py"
Cohesion: 0.16
Nodes (19): get_prompt(), get_version(), PromptVersion, Session, UUID, Prompt registry: versioned prompt objects + agent-node promptRef resolution. A…, The pinned ``version`` row, or ``current_version`` when unpinned., Template text for a prompt version; ``None`` when not resolvable. (+11 more)

### Community 135 - "run_sandboxed_code"
Cohesion: 0.11
Nodes (18): Attribute, _execute_code(), Any, Queue, Restricted Python execution for the Code node (n8n-style). Runs user code in a…, Child process entry: run code and put (ok, payload) on the queue., Expose only loads/dumps — never the stdlib module (avoids codecs.sys escape)., run_sandboxed_code() (+10 more)

### Community 136 - "invoke_runner.py"
Cohesion: 0.19
Nodes (18): create_event_run(), create_invoked_run(), event_session_id(), invoke_and_wait(), InvokeRequestBody, _load_session_history(), poll_run_terminal_result(), Session (+10 more)

### Community 137 - "score_rag"
Cohesion: 0.20
Nodes (11): Any, BaseModel, rag_aggregate(), RagScores, RAG-specific evaluation scorers. Standard RAG quality dimensions an LLM judge…, Mean of the three RAG dimensions (1-5), rounded., Score a RAG triple. Returns per-dimension scores + aggregate, or a skip/error…, score_rag() (+3 more)

### Community 138 - "mcp_stdio_entry.py"
Cohesion: 0.21
Nodes (14): _args_to_invoke_body(), build_stdio_server(), _deployment_headers(), _env(), fetch_tool_descriptor(), main(), Any, AsyncClient (+6 more)

### Community 139 - "apiBase SSRF and Env-Key Exfiltration"
Cohesion: 0.15
Nodes (15): litellm, apiBase SSRF and Env-Key Exfiltration, Pinned HTTP TLS and Redirect Leaks, LiteLLM, LLM Provider Registry, Experiment Model Override, Ollama, ProviderModel (+7 more)

### Community 140 - "Build Guard Grade Operate"
Cohesion: 0.16
Nodes (15): mcp SDK, Agent Tool Loop, Build Stage, Competitive Analysis 2026-09-27, Deterministic Graph, Aegis Future Plan, LangSmith, MCP Client (+7 more)

### Community 141 - "test_error_routing.py"
Cohesion: 0.19
Nodes (16): _normalize_output(), Any, Record upstream input and node output in the shared workflow context, applying…, wrap_with_context(), _error_graph(), _FakeCtx, Tests for per-node error-branch routing (n8n-style). A node that fails but…, Minimal stand-in for the ADK Context the wrapper writes ctx.route on. (+8 more)

### Community 142 - "test_tool_call_guardrail.py"
Cohesion: 0.23
Nodes (18): _ctx(), _plugin(), Action-layer (tool_call scope) guardrail policies. A policy's…, test_blocked_call_returns_synthetic_result_and_blocked_span(), test_both_scope_guards_text_and_tools(), test_clean_call_flows_through_normally(), test_frequency_cap_across_two_calls_on_same_tool(), test_frequency_cap_blocks_n_plus_1() (+10 more)

### Community 143 - "Tier 2 Big-tech Agent Platforms"
Cohesion: 0.14
Nodes (18): Capabilities Most Builders Lack, Agent Script, Amazon Bedrock AgentCore, AgentCore Policy, Salesforce Agentforce, Cisco AI Defense, Microsoft Copilot Studio, Deferred Enterprise Platform Gaps (+10 more)

### Community 144 - "aegis_cli/main.py"
Cohesion: 0.24
Nodes (12): ArgumentParser, build_parser(), CliError, cmd_gate(), main(), _pick_versions(), Exception, aegis — Aegis platform CLI. Commands: gate — run a regression experiment and… (+4 more)

### Community 145 - "MCPPinnedTransport"
Cohesion: 0.16
Nodes (8): AsyncByteStream, _BoundedResponseStream, MCPPinnedTransport, Request, Response, Resolve/revalidate and pin every request, including SDK reconnects and DELETE., test_compressed_http_response_rejected_before_decompression(), test_http_transport_pins_every_request_and_never_follows_redirects()

### Community 146 - "test_p3c_obs.py"
Cohesion: 0.23
Nodes (14): _b64url(), _b64url_decode(), mint_session_token(), datetime, UUID, Hosted-chat session tokens: short-lived HMAC-bound deployment handles. A…, Mint a session token bound to one deployment's pinned version., Return the bound claims when the signature and expiry hold, else None. (+6 more)

### Community 147 - "eval_preset_service.py"
Cohesion: 0.35
Nodes (14): build_eval_instruction(), _batch_load_custom_presets(), builtin_preset_rows(), enrich_graph_eval_presets(), get_preset_config(), list_all_presets(), list_user_presets(), Any (+6 more)

### Community 148 - "Worker create_all Bypasses Alembic"
Cohesion: 0.15
Nodes (14): Alembic, Worker create_all Bypasses Alembic, SQLite UUID Numeric Affinity, Test Harness Blind Spots, Worker HTTP Client Uninitialized, Alembic Schema Ownership, migration_check_strict, SQLite UUID Column Type (+6 more)

### Community 149 - "test_annotation_queue.py"
Cohesion: 0.23
Nodes (13): Annotation queue: enqueue paths, dedup, label→dataset seam, and filters. Seeds…, A run already captured via thumbs-down keeps its row; the human label becomes…, Two sessions racing the same (user_id, run_id) enqueue: the loser must get the…, Create a workflow + version + runs; return (workflow_id, [run_ids])., _seed(), test_enqueue_insert_race_recovers_winner_row(), test_label_lands_dataset_row(), test_label_updates_existing_dataset_row() (+5 more)

### Community 150 - "test_trace_search.py"
Cohesion: 0.27
Nodes (12): _add_llm_call(), _add_span(), datetime, Cross-run span/LLM-call search: GET /api/observability/spans. Seeds two…, Foreign user's spans must not leak through the search., Create workflow+version+run; return (workflow_id, run_id) as UUIDs., _seed_run(), test_spans_search_filters() (+4 more)

### Community 151 - "Audit Remediation Program"
Cohesion: 0.15
Nodes (14): Cross-Tenant Execution, Aegis Audit Findings, Documented Execution Limitations, Audit Remediation Program, Code Sandbox Format Escape, Review-Only Assist, Eval-Suite Assist, Eval Coverage Copilot (+6 more)

### Community 152 - "invoke"
Cohesion: 0.22
Nodes (12): fetch_v4_outputs(), main(), A/B experiment: grounded-prompt v5 vs the ungrounded v4 baseline. v4…, Latest completed v4 run per input, with its n1 search context., invoke(), main(), poll_run(), post_run() (+4 more)

### Community 153 - "validate_structured_output"
Cohesion: 0.24
Nodes (12): Parse ``text`` as JSON and validate it against ``schema``. Pure — no LLM.…, Enforce a JSON schema on output; on failure, re-ask the model to repair it…, validate_against_schema(), validate_structured_output(), Structured-output guardrail: JSON-schema validation + bounded re-ask. The re-…, test_invalid_output_without_key_fails(), test_json_missing_required_field_fails(), test_no_schema_configured_passes_with_warning() (+4 more)

### Community 154 - "Optional API Key Auth"
Cohesion: 0.18
Nodes (13): cryptography, Chat Session Isolation, Optional API Key Auth, Fernet Credential Encryption, Hosted Chat, Invoke Runner, Published MCP Server, Session History (+5 more)

### Community 155 - "test_mvp2_foundation.py"
Cohesion: 0.19
Nodes (6): _make_workflow(), Tests for MVP2 backend foundation: timeline, deploy, dashboards, crypto, cost…, test_cost_alert_rule_is_supported(), test_credential_secret_encrypted_at_rest(), test_deploy_descriptor_after_publish_includes_mcp_tool(), test_deploy_descriptor_requires_published_version()

### Community 156 - "submit_approval"
Cohesion: 0.28
Nodes (9): _key_run_id(), _keys_for_run(), _publish_decision(), Best-effort NOTIFY to waiters in other processes; the DB poll is the fallback., _resolve_key(), submit_approval(), asyncio, test_approval_early_submit_satisfies_later_wait() (+1 more)

### Community 157 - "test_dataset_loop.py"
Cohesion: 0.33
Nodes (11): _csv(), _items(), parametrize, Dataset-loop API regressions: atomic CSV and exact, tenant-safe run reuse., test_add_run_dedupes_across_capture_and_rejects_other_workflows(), test_cluster_capture_exact_members_and_scope(), test_csv_bad_rows_are_reported_without_partial_import(), test_csv_preserves_quoted_multiline_labels_and_metadata() (+3 more)

### Community 158 - "auth.ts"
Cohesion: 0.18
Nodes (17): SettingsPage(), applyDensity(), Density, getDensity(), useDensity(), request(), ApiKeyAuditAction, ApiKeyAuditEntry (+9 more)

### Community 159 - "setup.sh"
Cohesion: 0.39
Nodes (10): allocate_ports(), apply_port_env(), copy_untracked_files(), error(), info(), install_deps(), persist_ports(), port_in_use() (+2 more)

### Community 160 - "config.py"
Cohesion: 0.14
Nodes (16): _build_input(), _event_source(), Any, post, Request, Session, UUID, Inbound event webhooks: ``POST /v1/webhooks/{workflow_id}``. The generic… (+8 more)

### Community 161 - "dispatch_webhook"
Cohesion: 0.21
Nodes (13): get_http_client(), AsyncClient, run_search(), search_duckduckgo(), search_exa(), dispatch_webhook(), Any, asyncio (+5 more)

### Community 162 - "_run_single_node_variant"
Cohesion: 0.23
Nodes (12): CompareVariantResult, compare_variants(), Wrap a single node between a trigger and end for single-node execution., Execute one variant as a single-node LLM run, capturing telemetry. Reuses the…, Run each variant (base_config merged with overrides) as a single-node run.…, _run_single_node_variant(), _single_node_graph(), _extract_text_from_event() (+4 more)

### Community 163 - "Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions"
Cohesion: 0.22
Nodes (11): Aegis visual agent-workflow workbench — observability/triage surface for LLM agent workflows, Aegis design language — warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Filter/search toolbar — 'Search workflows…', All Status, All Versions, Last 30d filters, List/Table view toggle, Templates, primary 'New workflow' button, 04-instrument-table.jpg — 'Instrument Table' homepage UI mockup for Aegis, Instrument Table layout — homepage concept: dense tabular inventory of agent workflows ('42 active workflows • 7 running'), Pagination footer — '1–25 of 142' with prev/next controls, Per-row action controls — run (play), edit (pencil), overflow menu, plus bulk-select checkboxes, Color-coded status pill system — SUCCESS (green), RUNNING (amber), FAILED (red); success-rate text colored green/red (+3 more)

### Community 164 - "deploy_descriptor.py"
Cohesion: 0.36
Nodes (8): build_deploy_descriptor(), build_mcp_input_schema(), find_input_schema_fields(), _node_type(), Any, Build a deploy descriptor (invoke URL, cURL, MCP tool) for a published…, Return the first input_schema node's ``inputFields`` (or [])., Derive a JSON Schema object for the MCP tool's input. Uses the workflow's…

### Community 165 - "deployments.py"
Cohesion: 0.15
Nodes (25): DeploymentWebhookReceipt, WorkflowDeployment, authenticate_event_webhook(), authenticate_invoke(), issue_credential(), owner_published_workflow(), CredentialKind, Session (+17 more)

### Community 166 - "Run Checkpoints"
Cohesion: 0.27
Nodes (10): Approval Identity and Timeouts, approval_requests, recover_stale_runs, Run Checkpoints, wait_for_approval, At-Least-Once Resume, Postgres-First Durable Execution, Human Approval Gate (+2 more)

### Community 167 - "Homepage mockup 05: Directory / Quiet Index (Workflows index page)"
Cohesion: 0.24
Nodes (10): Data typography: IBM Plex Mono for identifiers, versions, dates and the font badge; sans-serif for descriptions and headings, Aegis design language: warm near-black surfaces, bone/monochrome chrome, hairline dividers, color reserved for status and data, Homepage mockup 05: Directory / Quiet Index (Workflows index page), Monochrome status treatment: 'published' rendered as plain bone text, not a colored badge — color withheld even for status in the quiet index, Page header: oversized 'Workflows' title with descriptive subline 'Orchestrate, version, and publish internal automation sequences. 12 total', Directory / Quiet Index layout: calm, table-first index page with generous whitespace, no cards or dashboards, Sample workflow entries: onboard-new-hire, fraud-alert-escalate, daily-recon-csv, api-key-rotate, vendor-onboarding, incident-triage (6 of 12 shown), Quiet search input: hairline-outlined 'Search workflows…' field with magnifier icon, narrow width (+2 more)

### Community 168 - "Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions"
Cohesion: 0.27
Nodes (10): Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions, macOS-style window chrome: traffic-light dots top-left, centered 'Aegis' title, Master-Detail layout pattern, Mixed typography: serif display face for detail title, monospace face for description and metadata, Aegis homepage mockup: master-detail workflow browser, Open (ghost/outlined) and Run (filled warm-taupe primary) action buttons, Selected list row highlighted with warm taupe/bone fill (Compliance Audit Trail), Warm near-black surfaces with bone/monochrome chrome; warm taupe accent reserved for selection and primary action (+2 more)

### Community 169 - "HighlightedSample.tsx"
Cohesion: 0.33
Nodes (9): escapeRegExp(), findKeywordMatches(), findPiiMatches(), HighlightedSample(), HighlightedSampleProps, MatchSpan, mergeSpans(), PII_PATTERNS (+1 more)

### Community 170 - "run_filters.py"
Cohesion: 0.44
Nodes (8): filter_runs_by_eval_passed(), filter_runs_by_guardrail_blocked(), filter_runs_by_has_eval(), WorkflowRun, Cross-database filters for workflow run list queries., run_eval_passed(), run_guardrail_blocked(), run_has_eval()

### Community 171 - "test_experiment_gate.py"
Cohesion: 0.39
Nodes (7): Trust-layer Phase 2: GET /api/experiments/{id}/gate CI regression gate. Wraps a…, _seed_experiment(), test_gate_failed_regression_and_strict_409(), test_gate_not_applicable_for_batch(), test_gate_passed_regression(), test_gate_pending_while_running(), _verdict()

### Community 172 - "Next.js Workbench"
Cohesion: 0.25
Nodes (9): Frontend API Client, TanStack Query Keys, Next.js SSE Proxy, Workflow Canvas, src/lib/api.ts, Frontend README, src/lib/query-keys.ts, Frontend SSE Proxies (+1 more)

### Community 173 - "Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc"
Cohesion: 0.33
Nodes (9): Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc, Design language: warm near-black panel on stained aged paper, bone monospace/typewriter type, red ink reserved for annotation/status, Workflow lifecycle log entries: 'Published v2 fraud-alert', 'Eval suite failed - 3 cases', 'Edited guardrail transaction-volume', 'Workflow forked refund-arbiter', Field-log metaphor: agent workflow archive rendered as a scientist's chronological lab notebook with volume/instrument metadata, Handwritten red-ink marginalia annotations: 'retry queue', 'human review suspected', 'observe drift inside docker', 'data drift review upcoming', 'see notebook vol. 16', 'run-8842', Boxed '+' button labeled 'NEW ENTRY / NEW WORKFLOW' in top-right of the log panel, Observability/triage surface framing: eval failures, guardrail threshold edits, drift, regressions, and forks presented as auditable history, Initialed authorship per entry (-M, -S, -K, -L) implying multi-operator triage journal (+1 more)

### Community 174 - "OpenTelemetry SDK"
Cohesion: 0.25
Nodes (8): LLM-call traces (llm_calls table, gen_ai.* spans), North star loop Build to Run to Trust, Phase 1 Truthful runtime, Phase 4 Observability you can operate on, Phase 5 Platform (harness for any agent), Token and cost accounting via ADK plugin, Trace ingestion SDK for external agents, OpenTelemetry SDK

### Community 175 - "026_event_triggers.py"
Cohesion: 0.46
Nodes (7): downgrade(), Multi-schedule workflows + inbound event webhooks. Drops the UNIQUE constraint…, _schedule_table(), upgrade(), _workflow_id_unique_names(), MetaData, Table

### Community 176 - "apply_embedding"
Cohesion: 0.27
Nodes (12): _index_uploaded_chunks(), Parse, chunk, and embed off the event loop. Owns its session: the request…, KnowledgeDocument, apply_embedding(), Session, _bulk_import_sync(), UUID, Background knowledge base indexing jobs. (+4 more)

### Community 177 - "QuickAddMenu.tsx"
Cohesion: 0.20
Nodes (15): GraphContext, QuickAddMenu(), QuickAddMenuProps, resolveSuggestion(), NodeSuggestion, NODE_REGISTRY, getRecentNodes(), RecentNode (+7 more)

### Community 178 - "experiments.py"
Cohesion: 0.24
Nodes (16): _check_version(), create_experiment(), experiment_gate(), ExperimentCreate, get_experiment(), list_experiments(), ModelTarget, BaseModel (+8 more)

### Community 179 - "Command Home Layout (Aegis Workbench Homepage)"
Cohesion: 0.36
Nodes (8): Command Palette Search Bar (Search workflows, runs, or jump to... ⌘K), Aegis Design Language (warm near-black surfaces, bone/monochrome chrome, color reserved for status and data), Command Home Layout (Aegis Workbench Homepage), Needs Attention Triage Rail (Failed Runs with Dismiss Controls), Quick Action Cards (New Workflow, Browse Templates, View Failed Runs), Recent Workflows Card Grid with Sparkline Thumbnails, Status Badge System (PUBLISHED green, FAILED red, version chips), Top Navigation Bar (Aegis Workbench logo, Workflows/Runs/Agents/Templates, user avatar)

### Community 180 - "Mission Control layout (named concept: fleet-wide observability overview of all workflows)"
Cohesion: 0.43
Nodes (8): Aegis Workbench product (visual agent-workflow workbench: React Flow canvas, observability/triage surface), KPI stat-card strip (Active runs 37, Failed 24h 9, Published 84, Avg latency 142ms) with status-colored dots, Live activity feed right rail (Last 15 min run events: run started, step timeout failure, completed run with confidence, queued runs), Mission Control layout (named concept: fleet-wide observability overview of all workflows), Homepage mockup 03: Mission Control Workflows overview, Status-only color design language (warm near-black surfaces, bone/monochrome chrome, green/amber/red reserved for status and data), Top navigation bar (Aegis Workbench brand, Workflows/Observability/Guardrails/Settings tabs, workflow search, New workflow CTA), Workflows table (name, version, publish state pill, run status pill, last-updated; Running/Paused/Failed color coding)

### Community 181 - "Workflows map view (Aegis header 'Aegis | Workflows map')"
Cohesion: 0.29
Nodes (8): Left-to-right directed graph (DAG) layout of workflow nodes with thin light edges and directional arrows, LIST toggle button in top-right header (map/list view switcher), Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold, System Map / Workflows map UI mockup (08-system-map.jpg), Warm near-black canvas surface with bone/monochrome chrome; no color used (color reserved for status/data), Selected-node detail card: 'core-orchestrator v2.4', 'last run: 11m ago', 'Open ->' button, anchored adjacent to highlighted node, Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv, Workflows map view (Aegis header 'Aegis | Workflows map')

### Community 182 - "Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk"
Cohesion: 0.32
Nodes (8): Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk, Warm near-black background with faint graph-paper grid texture, evoking both a physical desk and the React Flow canvas, Physical-desk metaphor details: paperclip on Q3 FORECAST ADJUST card, slight rotations, overlapping layering, paper-grain card textures, Bold condensed uppercase display typography for workflow names on cards, contrasted with small monospace-style version/recency labels, Minimal bone-on-black chrome: 'Aegis' wordmark top-left, 'Browse all ->' link top-right; no other navigation, Empty dashed-outline slots labeled 'Pin workflow' with '+' markers: affordance for adding workflows to the spatial desk, doubling as empty-state placeholder, Version + recency metadata per card (v4.1/YESTERDAY, v2/MONDAY, v3/TODAY, v1/2WKS) with muted green, rust, and olive accents: color reserved for status/data per design language, Scattered tilted workflow cards (INVOICE RECONCILE v4.1, SUPPLIER ONBOARD v2, Q3 FORECAST ADJUST v3, CERT RENEWALS v1) rendered as overlapping pinned index/polaroid cards with varied bone, tan, and gray paper tones

### Community 183 - "useRunInput.ts"
Cohesion: 0.39
Nodes (7): coerce(), deriveFields(), normalizeField(), readStored(), RunField, StoredInput, useRunInput()

### Community 184 - "KnowledgeBulkImport"
Cohesion: 0.38
Nodes (5): KnowledgeBulkImport, KnowledgeDocumentCreate, KnowledgeDocumentResponse, BaseModel, model_validator

### Community 185 - "compile_workflow"
Cohesion: 0.09
Nodes (32): _build_author_lookup(), compile_workflow(), _graph_cache_key(), Workflow, filter_executable_graph(), _make_if_fn(), _make_input_schema_fn(), _make_json_parse_fn() (+24 more)

### Community 186 - "Aegis homepage mockup 06: Quiet Table (Workflows list view)"
Cohesion: 0.33
Nodes (7): Aegis design language: warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Aegis homepage mockup 06: Quiet Table (Workflows list view), Primary actions: Templates ghost button and filled bone New workflow + button, Quiet Table layout, Status filter tabs: All / Published / Draft, Top navigation chrome: AEGIS shield logo, Workflows/Agents/Templates/Runs/Settings, v4.12 prod environment badge, Workflows list table with Name, Version, Updated columns and rows like Lead Qualification Agent v2.4

### Community 187 - "Terminal Shell layout"
Cohesion: 0.33
Nodes (7): CLI/terminal metaphor for the agent workbench: workflows and runs operated via shell commands instead of GUI panels, Command header: 'aegis >' prompt with block cursor; right-aligned 'AEGIS AGENT WORKBENCH v0.14.3 · session 47 · 03:41 UTC' on a raised title band, Warm near-black surface with bone/monochrome monospace text; amber/gold reserved for command echoes and accent data, 'recent runs' timestamped log: run IDs (name#hash), status (completed/failed), duration, and inline metrics (score:0.97, flagged:3, ERR: timeout, routed:2, stage:verify), Bottom status bar: left 'tab complete · type new · open <name> · last sync 41s ago'; right '↑ 3 workflows running · agents: 12 online', Terminal Shell layout, '$ list workflows' output table: NAME / VERSION / UPDATED columns with dashed separators (lead-qualifier 2.3.1, fraud-detector 4.1.0, contract-analyzer 1.9.4, escalation-router 3.0.2, onboarding-flow 2.7.1)

### Community 188 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, analyze, build, dev, lint, start, typecheck

### Community 189 - "use-pinned-workflows.ts"
Cohesion: 0.62
Nodes (5): usePinnedWorkflows(), getPinnedWorkflowIds(), isWorkflowPinned(), setPinnedWorkflowIds(), togglePinnedWorkflow()

### Community 190 - "workflow-import.ts"
Cohesion: 0.33
Nodes (5): parseWorkflowExport(), readWorkflowExportFile(), WORKFLOW_EXPORT_FORMAT, WorkflowExportPayload, WorkflowImportError

### Community 191 - "teardown.sh"
Cohesion: 0.62
Nodes (6): info(), kill_dev_servers(), kill_port(), release_port(), teardown.sh script, warn()

### Community 192 - "Local Postgres Service"
Cohesion: 0.33
Nodes (6): backend CI job (alembic upgrade head on SQLite + pytest), frontend CI job (npm typecheck + lint + build), migrations-postgres CI job (alembic upgrade head on pgvector/pgvector:pg16), CI GitHub Actions Workflow, Docker Compose, Local Postgres Service

### Community 193 - "Regression Gate Job"
Cohesion: 0.47
Nodes (6): Regression Gate Workflow, Regression Gate Job, CLI Gate Baseline Semantics, aegis gate CLI, Regression CLI and GitHub Action, CI Regression Gate

### Community 194 - "012_run_spans_tags_sessions.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 195 - "013_alert_baseline_comparison.py"
Cohesion: 0.73
Nodes (5): _columns(), downgrade(), _existing_tables(), _inspector(), upgrade()

### Community 196 - "014_workflow_memory_unique.py"
Cohesion: 0.73
Nodes (5): downgrade(), _existing_indexes(), _existing_tables(), _inspector(), upgrade()

### Community 197 - "TracePlugin"
Cohesion: 0.23
Nodes (8): Any, BasePlugin, Exception, Per-run tool-call capture + action-layer guardrails (Trust-layer trace tree).…, Close cancellation/interruption starts without claiming completion., Accumulates tool-call spans (name/args/result/timing) per ADK agent., _summarize(), TracePlugin

### Community 198 - "021_sqlite_uuid_affinity.py"
Cohesion: 0.40
Nodes (4): _columns_with_broken_affinity(), Repair SQLite type affinity for columns declared with sa.UUID() in older…, Columns whose declared type yields NUMERIC affinity — ``UUID`` (the original…, upgrade()

### Community 199 - "029_workflow_version_number_unique.py"
Cohesion: 0.40
Nodes (4): Unique (workflow_id, version_number) on workflow_versions. Concurrent ``POST…, Shift colliding version_numbers to fresh slots, preserving every row. For each…, _renumber_duplicates(), upgrade()

### Community 200 - "032_schedule_unique_entry.py"
Cohesion: 0.40
Nodes (4): _dedup_existing(), Unique (workflow_id, trigger_node_id, cron_expr) on workflow_schedules.…, Keep the oldest row per entry; drop newer duplicates (same version pin family —…, upgrade()

### Community 201 - "upload_knowledge_document"
Cohesion: 0.47
Nodes (6): _capped_request_body(), _parse_capped_multipart(), Request, Upload a document file, chunk it, and index each chunk for retrieval., Read the raw body, refusing once ``limit`` bytes have arrived.…, upload_knowledge_document()

### Community 203 - "database.py"
Cohesion: 0.12
Nodes (18): _sqlite_enable_foreign_keys(), _cleanup(), Bulk capture of production runs into a golden dataset. Covers the filter modes…, _seed(), test_capture_failed_then_dedups(), test_capture_low_eval(), _cleanup(), GET /api/datasets returns per-dataset item counts from a single grouped query. (+10 more)

### Community 204 - "Workflow"
Cohesion: 0.10
Nodes (38): Workflow, WorkflowRun, WorkflowVersion, approval_run(), fixture, fixture, seeded(), _make_graph_run() (+30 more)

### Community 205 - "test_phase6.py"
Cohesion: 0.26
Nodes (13): _check_object(), _check_value(), enforce_output_schema(), normalize_output_schema(), _normalize_property(), _parse_and_check(), Any, JSON object schemas for agent final answers. The schema is a small subset: one… (+5 more)

### Community 206 - "Glass & glow visual language"
Cohesion: 0.33
Nodes (6): Motion primitives (PageEnter, StaggerList, HoverLift, NumberTween, useGlowPulse), Reduced-motion gating (useReducedMotionStrict), Design token system (CSS variables + Tailwind config), Glass & glow visual language, Design-system quality bar (instrument aesthetic, chroma for data only), Hardcoded white sheen vs --surface-highlight token (light theme loses lift)

### Community 207 - "get_workflow_memory"
Cohesion: 0.60
Nodes (4): get_workflow_memory(), BaseModel, WorkflowMemoryEntry, WorkflowMemoryResponse

### Community 208 - "009_agentops_tables_backfill.py"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 209 - "011_workflow_templates.py"
Cohesion: 0.83
Nodes (3): downgrade(), _existing_tables(), upgrade()

### Community 210 - "Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5)"
Cohesion: 0.50
Nodes (4): Evaluation suite (faithfulness/helpfulness/relevance/toxicity, 1-5), P0: misleading eval chroma (1-5 scores banded on 0-1), User-defined eval presets & weighting (EvaluationPreset model), Deterministic evaluators (exact/substring, regex, embedding similarity)

### Community 211 - "extends"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 212 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 234 - "Guardrail engine (blocklist/regex/PII, block vs warn)"
Cohesion: 0.67
Nodes (3): Guardrail engine (blocklist/regex/PII, block vs warn), Advanced PII (Microsoft Presidio) + prompt injection shield, Guardrail graceful fallbacks & PII masking/redaction

### Community 235 - "Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)"
Cohesion: 0.67
Nodes (3): shadcn/ui primitive migration (Radix-backed), P0: dead focus ring (Tailwind v4 ring-3 in v3 build), Tailwind v4 syntax dead in v3 build (vendored shadcn primitives)

### Community 237 - "Aegis Frontend UI/UX Audit 2026-07-11"
Cohesion: 0.67
Nodes (3): Aegis Frontend UI/UX Audit 2026-07-11, Mobile canvas layout-lock mode, text-2xs Tailwind token consolidation

### Community 296 - "schedule_task"
Cohesion: 0.22
Nodes (13): _log_task_failure(), Any, Helpers for fire-and-forget asyncio tasks with exception logging., Schedule ``coro`` on the running event loop. When called from a worker thread…, schedule_task(), Any, UUID, Workflow (+5 more)

### Community 297 - "test_compiler.py"
Cohesion: 0.17
Nodes (14): _safe_eval(), topological_sort(), test_compile_agent_default_model_is_gemini_string(), test_compile_agent_openai_model_uses_litellm(), test_compile_evaluation_node_honors_openai_model(), test_compile_google_search_enables_server_side_tool_invocations(), test_compile_google_search_tool_stays_gemini_despite_model_override(), test_compile_llm_preset_nodes_honor_anthropic_model() (+6 more)

### Community 298 - "ToolCallGuard"
Cohesion: 0.20
Nodes (5): Action-layer guardrail for a policy — enforced inside TracePlugin's…, Whether this guard runs inside the tool hook at all., Return a block message when the tool call must be rejected., Validate serialized args when the scope/tool_rule asks for it., ToolCallGuard

### Community 299 - "test_guardrail_advanced.py"
Cohesion: 0.30
Nodes (12): _analyzer_available(), _default_entities(), detect_pii_presidio(), _get_analyzer(), _get_anonymizer(), Any, Optional Microsoft Presidio integration for entity-based PII detection., redact_pii_presidio() (+4 more)

### Community 300 - "startup.py"
Cohesion: 0.21
Nodes (13): _alembic_head_revisions(), check_database(), check_migrations_current(), _current_db_revisions(), MigrationsBehindError, _older_than(), datetime, RuntimeError (+5 more)

### Community 301 - "Aegis — Future Roadmap (Feature Gaps)"
Cohesion: 0.14
Nodes (13): Aegis — Future Roadmap (Feature Gaps), Deliberately out of scope (not gaps), Framing, P0.1 · Multi-model / multi-provider support — **SHIPPED 2026-09**, P0.2 · Bidirectional MCP (client + real server), P0 — Table-stakes gaps (highest leverage), P1.1 · RAG depth (Knowledge Pipeline), P1.2 · Evaluation rigor — online evals + CI gates (+5 more)

### Community 302 - "CanvasContextMenu.tsx"
Cohesion: 0.21
Nodes (12): buildNodeRunMenuItems(), CanvasContextMenu(), CanvasContextMenuProps, ContextMenuItem, firstEnabledIndex(), isSeparator(), CanvasSidebar(), clamp() (+4 more)

### Community 303 - "schedule_info.py"
Cohesion: 0.35
Nodes (12): list_user_scheduled_workflows(), list_workflow_schedules(), Any, datetime, Session, UUID, Schedule metadata for workflows (next fire, last scheduled run)., One info dict per configured schedule entry (unsaved graph view). (+4 more)

### Community 304 - "sub_workflow.py"
Cohesion: 0.23
Nodes (11): Evaluate multiple nodes concurrently. Returns (node_id, scores, error)., run_parallel_evaluations(), _parse_evaluation_scores(), _check_child_evaluations(), Any, UUID, _raise_on_blocked_eval(), Execute a child workflow from a Sub-workflow node (n8n Execute Workflow). (+3 more)

### Community 305 - "eval_runner.py"
Cohesion: 0.29
Nodes (10): _build_eval_prompt(), evaluate_content_async(), _evaluate_content_sync(), evaluate_node_async(), Any, Parallel and deferred evaluation execution (LLM + deterministic)., Judge the content as a response to the original request when we have it —…, model_call_span() (+2 more)

### Community 306 - "test_templates_mvp2.py"
Cohesion: 0.24
Nodes (6): Workflow, Tests for MVP2 template publishing + provenance endpoints., _seed_workflow(), test_create_template_then_appears_in_list(), test_persisted_templates_are_private_to_publisher(), test_use_persisted_template_increments_usage_and_returns_graph()

### Community 307 - "Aegis — System Architecture"
Cohesion: 0.20
Nodes (9): 1. System overview, 2. Run pipeline (the core loop), 3. Backend layering, 4. Node type system (spans both apps), 5. LLM provider layer, 6. Execution modes and cross-process transport, 7. Data model (key relationships), Aegis — System Architecture (+1 more)

### Community 308 - "request_validation_error_handler"
Cohesion: 0.25
Nodes (9): _json_safe(), Exception, Request, Recursively replace non-finite floats so ``json.dumps`` cannot raise., Return 422 for malformed bodies — sanitizing the echoed errors first.…, request_validation_error_handler(), unhandled_exception_handler(), exception_handler (+1 more)

### Community 309 - "_trigger_schedules"
Cohesion: 0.28
Nodes (7): count_scheduled_workflows(), All ``(trigger_node_id, cron_expr)`` entries configured on the trigger. One…, scheduler_status(), _trigger_schedules(), test_trigger_schedules_reads_list_and_legacy_single(), test_count_scheduled_workflows(), test_scheduler_status_shape()

### Community 310 - "ModelCallRecorder"
Cohesion: 0.25
Nodes (5): _content_capture_enabled(), ModelCallRecorder, Handle yielded by :func:`model_call_span`., Duck-typed usage extraction for google-genai and litellm responses., Attach content only when capture is on — never built otherwise.

### Community 311 - "LangSmithSpanExporter"
Cohesion: 0.25
Nodes (5): LangSmithSpanExporter, SpanExporter, Sanitizing wrapper around an OTLP exporter pointed at LangSmith. A span that…, ReadableSpan, SpanExportResult

### Community 312 - "Tier 1 Visual Builders"
Cohesion: 0.22
Nodes (9): Activepieces, CrewAI AMP, Gumloop, Gumstack, Lindy, Security-hardened Self-host Audience, Tier 1 Visual Builders, VectorShift (+1 more)

### Community 313 - ".from_input"
Cohesion: 0.36
Nodes (6): test_workflow_context_snapshot_truncates_large_outputs(), test_workflow_context_session_history_helpers(), test_context_from_json_input(), test_context_from_plain_text(), test_record_step_updates_last_output(), test_snapshot_for_metrics_excludes_memory()

### Community 314 - "Token Streaming"
Cohesion: 0.43
Nodes (8): Postgres Checkpoint Shortcut, Durable Execution, Token Streaming, Hatchet, LangSmith Deployment, Restack, Temporal Agent Harness, Tier 4 Execution Substrate

### Community 315 - "_extract_run_eval_metrics"
Cohesion: 0.33
Nodes (6): batch_eval_snippets(), _extract_run_eval_metrics(), _flatten_eval_scores(), WorkflowRun, Recent eval history snippets. ``limit`` is the total number of snippets…, test_extract_run_eval_metrics_flattens_completed_run_scores()

### Community 316 - "_consume_with_timeout"
Cohesion: 0.38
Nodes (7): _consume_with_timeout(), Run the event-consumption coroutine under the run timeout, but do NOT count…, asyncio, test_consume_with_timeout_exempts_awaiting_approval(), test_consume_with_timeout_returns_when_work_completes(), test_consume_with_timeout_times_out_on_active_work(), test_run_parallel_evaluations_runs_concurrently_and_maps_errors()

### Community 317 - "NodeSpanTracker"
Cohesion: 0.29
Nodes (3): NodeSpanTracker, Tracks in-flight ADK node spans for a single workflow run., Attach OTel gen_ai semantic-convention attributes to a node span.

## Ambiguous Edges - Review These
- `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` → `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`  [AMBIGUOUS]
  docs/design/homepage-mockups/08-system-map.jpg · relation: conceptually_related_to
- `CI Regression Gate` → `CLI Gate Baseline Semantics`  [AMBIGUOUS]
  bugs.md · relation: conceptually_related_to
- `Retrieval Correctness` → `Embedding Dimension Alignment`  [AMBIGUOUS]
  issues.md · relation: conceptually_related_to

## Knowledge Gaps
- **563 isolated node(s):** `run.sh script`, `aegis-cli`, `next/core-web-vitals`, `next/typescript`, `$schema` (+558 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **66 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` and `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `CI Regression Gate` and `CLI Gate Baseline Semantics`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Retrieval Correctness` and `Embedding Dimension Alignment`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ToolAgentNode` connect `compiler.py` to `BaseNode.tsx`, `test_agent_tools_runtime.py`, `services/node_test.py`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Why does `BaseNode` connect `BaseNode.tsx` to `compiler.py`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `api.ts`, `button.tsx`, `RunResultsPanel.tsx`, `observability/page.tsx`, `WorkflowCanvas.tsx`, `app/page.tsx`, `CanvasSidebar.tsx`, `AssistRail.tsx`, `CanvasTour.tsx`, `BaseNode.tsx`, `node-registry.ts`, `CanvasContextMenu.tsx`, `GuardrailPlayground.tsx`, `api`, `RunDeck.tsx`, `app/layout.tsx`, `Workbench.tsx`, `RunDetailView.tsx`, `templates/page.tsx`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `run.sh script`, `aegis-cli`, `next/core-web-vitals` to the rest of the system?**
  _563 weakly-connected nodes found - possible documentation gaps or missing edges._