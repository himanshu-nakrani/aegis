# Graph Report - aegis  (2026-11-18)

## Corpus Check
- 599 files · ~691,174 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6739 nodes · 18094 edges · 358 communities (292 shown, 66 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 445 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d133f419`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.ts
- AssistRail.tsx
- RunDetailView.tsx
- cn
- compiler.py
- observability/page.tsx
- validate_guardrail_content
- datasets.py
- test_agent_tools_runtime.py
- test_checkpoints.py
- GuardrailJudgeUnavailableError
- prompts.py
- guardrail.py
- build_deployment
- meta.py
- valid_graph
- event_bus.py
- WorkflowCanvas.tsx
- run_concurrency.py
- executor.py
- app/main.py
- tracing.py
- eval_runner.py
- experiment_runner.py
- formatRelativeTime
- services/assist.py
- Recommended Build Sequence
- runs.py
- use-resizable-panel.ts
- test_p3c_boot.py
- otlp_ingest.py
- CommandPalette.tsx
- models.py
- test_executor.py
- db/__init__.py
- test_langsmith_tracing.py
- api/assist.py
- add_credential
- graph_validation.py
- settings/page.tsx
- BaseNode.tsx
- Workflow
- workflows.py
- test_rag_v1.py
- NodePalette.tsx
- platform.py
- test_run_from_here.py
- api
- agent_tools.py
- mcp_server.py
- button.tsx
- workflow_capabilities.py
- services/credentials.py
- schedule_info.py
- test_phase9.py
- services/node_test.py
- Migrate from OpenAI Agent Builder to Aegis
- persistent_memory.py
- observability.py
- vector_stores.py
- config.py
- safe_http_request
- guardrail_policies.py
- test_upgrade_phase3.py
- mcp_client.py
- RunDeck.tsx
- test_assist.py
- wait_for_approval
- eval_presets.py
- wrap_graph_with_trigger_end
- test_p3c_obs.py
- test_audit_p1_p2_fixes.py
- test_security_fixes.py
- chat.ts
- compilerOptions
- Backend Requirements
- test_p3c_input.py
- Canvas Commoditization
- test_model_matrix.py
- app/layout.tsx
- observability_rollups.py
- test_p3c_bus.py
- test_node_test_api.py
- test_agentops_phase3.py
- test_p3c_workflows.py
- embeddings.py
- test_draft_identity.py
- test_assist_eval_suite.py
- parametrize
- Evaluation
- motion/index.ts
- drive_sync.py
- Workbench.tsx
- test_assist_history.py
- validate_structured_output
- test_reviewfix_auth.py
- components.json
- authoring_version
- test_mcp_client.py
- validate_safe_regex
- run_repair.py
- test_mcp_server.py
- knowledge_library.py
- schedule_worker.py
- test_assist_mvp2.py
- knowledge_revisions.py
- NodeExecutionError
- SimpleNamespace
- NodeSpanTracker
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
- test_event_secrets.py
- test_otlp_ingest.py
- code_runtime.py
- 02 Split Studio Homepage Mockup
- deployments.py
- quality_metrics.py
- test_routing_adk2.py
- dependencies
- Attention Inbox layout
- test_online_sampling.py
- api/knowledge.py
- Cross-App Node Type System
- Provider-aware cost estimates
- seal_scope
- Continuously synced knowledge sources — Google Drive
- Eval-backed run repair: “Fix this run”
- invoke_runner.py
- score_rag
- mcp_stdio_entry.py
- apiBase SSRF and Env-Key Exfiltration
- Build Guard Grade Operate
- test_error_routing.py
- test_tool_call_guardrail.py
- Tier 2 Big-tech Agent Platforms
- aegis_cli/main.py
- .handle_async_request
- test_p3c_graph.py
- eval_preset_service.py
- Worker create_all Bypasses Alembic
- test_annotation_queue.py
- test_trace_search.py
- Audit Remediation Program
- invoke
- Quality-gated publishing — design specification
- Optional API Key Auth
- test_mvp2_foundation.py
- GuardrailResult
- test_dataset_loop.py
- QuickAddMenu.tsx
- setup.sh
- WorkflowContext
- search.py
- _run_single_node_variant
- Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions
- test_knowledge_lock_order.py
- verify_slack_signature
- Run Checkpoints
- Homepage mockup 05: Directory / Quiet Index (Workflows index page)
- Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions
- test_code_sandbox_isolation.py
- test_moderation_guardrail.py
- test_experiment_gate.py
- Next.js Workbench
- Lab Notebook / Field Log homepage mockup: 'AEGIS // FIELD LOG - AGENT WORKFLOW ARCHIVE', Vol. 17, Instrument v0.8.3-rc
- OpenTelemetry SDK
- 026_event_triggers.py
- compute_resume
- import_workflow
- experiments.py
- Command Home Layout (Aegis Workbench Homepage)
- Mission Control layout (named concept: fleet-wide observability overview of all workflows)
- Workflows map view (Aegis header 'Aegis | Workflows map')
- Spatial Desk homepage mockup (11-spatial-desk.jpg): hero concept showing agent workflows as pinned index cards scattered on a dark desk
- useRunInput.ts
- test_run_concurrency.py
- api/node_test.py
- Aegis homepage mockup 06: Quiet Table (Workflows list view)
- Terminal Shell layout
- scripts
- use-pinned-workflows.ts
- test_run_repair.py
- teardown.sh
- agent_tool_schema.py
- Regression Gate Job
- 012_run_spans_tags_sessions.py
- 013_alert_baseline_comparison.py
- 014_workflow_memory_unique.py
- TracePlugin
- 021_sqlite_uuid_affinity.py
- 029_workflow_version_number_unique.py
- 032_schedule_unique_entry.py
- 4. User journey and surfaces
- 8. API contract and concrete examples
- 10. API contracts
- test_sessions.py
- test_phase6.py
- Glass & glow visual language
- utils.ts
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
- retrieve_documents
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
- render_template
- 7. Sync algorithm, removals and freshness
- 5. Shared immutable artifacts
- test_guardrail_advanced.py
- 7. Evaluation and verdict semantics
- Aegis — Future Roadmap (Feature Gaps)
- CanvasContextMenu.tsx
- api/templates.py
- sub_workflow.py
- schedule_task
- test_templates_mvp2.py
- Aegis — System Architecture
- workflow.py
- test_deployment_auth.py
- recovery-state.tsx
- event_webhooks.py
- Tier 1 Visual Builders
- 6. Shared evaluation and execution semantics
- Token Streaming
- 6. Durable storage and immutable revision contract
- 3. User experience
- observability_service.py
- test_api.py
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
- .hoplite/run.sh
- .hoplite/setup.sh
- Local Postgres Service
- authenticate_invoke
- get_db
- clipboard.ts
- SkyClock.tsx
- deploy_descriptor.py
- _SafetyVisitor
- run_filters.py
- graph-preview.tsx
- KnowledgeBulkImport
- HighlightedSample.tsx
- record_audit
- test_dataset_capture.py
- submit_approval
- trace_insights
- workflow-import.ts
- MCPStdioConfig
- test_mark_node_started_leaves_terminal_updated_at_untouched
- cmdk

## God Nodes (most connected - your core abstractions)
1. `cn()` - 244 edges
2. `valid_graph()` - 162 edges
3. `validate_workflow_graph()` - 116 edges
4. `_get()` - 102 edges
5. `build_deployment()` - 70 edges
6. `Button` - 67 edges
7. `Base` - 63 edges
8. `Workflow` - 60 edges
9. `WorkflowVersion` - 59 edges
10. `api` - 56 edges

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

## Communities (358 total, 66 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.02
Nodes (134): TemplateCardProps, ExpressionTextarea, ExpressionTextareaProps, Segment, charDiff(), DiffSpan, PromptDiff(), deriveUpstreamNodeIds() (+126 more)

### Community 1 - "AssistRail.tsx"
Cohesion: 0.17
Nodes (14): assistantHistoryContent(), AssistantTurn(), AssistRail(), AssistRailProps, AssistTurn, buildHistory(), buildLabelMap(), DiffGroup() (+6 more)

### Community 2 - "RunDetailView.tsx"
Cohesion: 0.05
Nodes (61): WorkflowPage(), allUpstream(), directPredecessors(), NodeDataSection(), NodeDataSectionProps, NodeEvidence, NodeLiveResult, oneLine() (+53 more)

### Community 3 - "cn"
Cohesion: 0.03
Nodes (107): react, CanvasStatusBar(), TONE_CLASSES, CanvasToolbar(), ToolbarButton(), CodeBlock(), DeploySheet(), DeploySheetBody() (+99 more)

### Community 4 - "compiler.py"
Cohesion: 0.05
Nodes (94): AdkEdge, AST, _branch_default_label(), _build_adk_node(), _build_author_lookup(), _build_bound_workflow(), _build_graph_edges(), compile_workflow() (+86 more)

### Community 5 - "observability/page.tsx"
Cohesion: 0.04
Nodes (54): AnnotationQueue, AttentionItem, buildAttentionItems(), CostDashboard, EVENT_STATUS, KIND_STATUS, kindClass(), kindLabel() (+46 more)

### Community 6 - "validate_guardrail_content"
Cohesion: 0.08
Nodes (44): _make_guardrail_fn(), apply_fail_behavior(), LlmGuardrailVerdict, _mask_all_violations(), ModerationVerdict, BaseModel, Redact every violation, not just the first, then re-validate.…, validate_content() (+36 more)

### Community 7 - "datasets.py"
Cohesion: 0.07
Nodes (74): enqueue(), EnqueueRequest, label_task(), LabelRequest, list_queue(), AnnotationTask, BaseModel, post (+66 more)

### Community 8 - "test_agent_tools_runtime.py"
Cohesion: 0.27
Nodes (23): Streams a native ADK Agent while enforcing canvas-node reliability. Budgets…, ToolAgentNode, approval_run(), call(), execute(), graph(), BaseLlm, parametrize (+15 more)

### Community 9 - "test_checkpoints.py"
Cohesion: 0.11
Nodes (42): mark_node_completed(), Upsert a ``completed`` checkpoint carrying the node's raw output. ``output`` is…, _linear_graph(), asyncio, Tests for durable per-node checkpoints and the resume plan (Phase 2, slice C).…, Crash with a completed 'a' and 'b' mid-flight: resume at b only., b never started but every parent completed → it is safe-ready., Unstarted children of a completed router never resume implicitly. (+34 more)

### Community 10 - "GuardrailJudgeUnavailableError"
Cohesion: 0.08
Nodes (33): GuardrailBlockedError, GuardrailJudgeUnavailableError, _before_model_multipart(), _contents_to_text(), _decide_soft(), _decode_str_response(), _expects_json(), Any (+25 more)

### Community 11 - "prompts.py"
Cohesion: 0.06
Nodes (75): _clip(), list_playground_runs(), _persist_playground_run(), post, Session, UUID, Standalone prompt playground — run a template against N model targets without…, run_playground() (+67 more)

### Community 12 - "guardrail.py"
Cohesion: 0.11
Nodes (37): _bounded_regex_sub(), _guardrail_pm(), _judge_failure(), _judge_provider_model(), _mask_violation(), _parse_schema(), _pm_unavailable(), Any (+29 more)

### Community 13 - "build_deployment"
Cohesion: 0.07
Nodes (53): assert_rejected(), build_deployment(), event_body(), UUID, Minimal published graph whose trigger node declares the Slack binding., Workflow + published version + deployment, with the trigger binding set., Assert a 401 with an exact detail, and that the detail leaks no secret., ``signature or ""`` guards the None case (a missing header upstream). (+45 more)

### Community 14 - "meta.py"
Cohesion: 0.17
Nodes (18): list_models(), list_node_types(), OnlineSamplingUpdate, ops_config(), preview_cron(), preview_guardrail(), BaseModel, field_validator (+10 more)

### Community 15 - "valid_graph"
Cohesion: 0.11
Nodes (49): executable_graph(), Extract executable nodes/edges from an already validated graph., Validate canvas graph before save or compile. Returns summary metadata., validate_workflow_graph(), Build a graph that satisfies Trigger → … → End validation., valid_graph(), test_validation_allows_single_error_edge_from_handler_node(), test_validation_rejects_error_edge_from_llm_node() (+41 more)

### Community 16 - "event_bus.py"
Cohesion: 0.06
Nodes (66): _as_uuid(), _catchup_sweep(), _consume_notifications(), delete_run_events(), _deliver_run_event(), _dispatch_new_events(), _drain_notifies(), fetch_run_events() (+58 more)

### Community 17 - "WorkflowCanvas.tsx"
Cohesion: 0.06
Nodes (59): buildNodeRunMenuItems(), hasClipboard(), EdgeInspector(), ConnectionLine(), absolutePosition(), COLLAPSED_GROUP_H, COLLAPSED_GROUP_W, DEFAULT_NODE_H (+51 more)

### Community 18 - "run_concurrency.py"
Cohesion: 0.15
Nodes (25): active_run_ids(), Run ids that currently have a live in-process asyncio task., _as_aware(), count_active_runs(), mark_run_unscheduled(), _parse_resumed_at(), datetime, Session (+17 more)

### Community 19 - "executor.py"
Cohesion: 0.08
Nodes (53): configure_runtime_env(), Unset IDE-local Gemini proxy vars that break direct API calls., Evaluate multiple nodes concurrently. Returns (node_id, scores, error)., run_parallel_evaluations(), _as_utc(), _cas_terminal_write(), _commit_db(), _consume_with_timeout() (+45 more)

### Community 20 - "app/main.py"
Cohesion: 0.05
Nodes (72): AbstractEventLoop, Idempotent acquire of the process-shared HTTP client. Lifespans (API, worker)…, shutdown_http_client(), startup_http_client(), configure_logging(), StructuredFormatter, health(), _health_db_counts() (+64 more)

### Community 21 - "tracing.py"
Cohesion: 0.08
Nodes (32): _content_capture_enabled(), finalize_workflow_span(), install_http_middleware(), _is_content_key(), _is_secret_key(), _llm_messages(), ModelCallRecorder, Any (+24 more)

### Community 22 - "eval_runner.py"
Cohesion: 0.12
Nodes (20): compute_aggregate_score(), preview_eval(), Any, Live rubric preview — run the LLM judge on a sample input/output. Powers the…, Score a sample with the given rubric. Returns the per-dimension scores + the…, _build_eval_prompt(), evaluate_content_async(), _evaluate_content_sync() (+12 more)

### Community 23 - "experiment_runner.py"
Cohesion: 0.17
Nodes (21): _aggregate(), _compute_verdict(), Any, UUID, Batch experiments: run a dataset against workflow version(s), score, compare.…, Regression verdict for one candidate aggregate vs the baseline., run_experiment(), _run_one_item() (+13 more)

### Community 24 - "formatRelativeTime"
Cohesion: 0.08
Nodes (55): HomePage(), PromptsPage(), ExperimentsPanel(), verdictBadge(), StatusGlyph(), VersionHistory(), ContinueTiles(), HomePulseBar() (+47 more)

### Community 25 - "services/assist.py"
Cohesion: 0.08
Nodes (46): AssistHistoryTurn, DraftedDataset, DraftedDatasetItem, DraftedEvalPreset, DraftEvalSuiteResponse, GenerateSchemaResponse, NodeSuggestion, Rubric suggestion. A set ``builtin_preset_id`` references an existing built-in… (+38 more)

### Community 26 - "Recommended Build Sequence"
Cohesion: 0.16
Nodes (31): aegis CLI and CI Gate, deploy_descriptor.py, Dify, Agent Tool-Calling Loop, Agents as Artifacts, AI-assisted Authoring, Chat Surface and Session Memory, Event Triggers (+23 more)

### Community 27 - "runs.py"
Cohesion: 0.11
Nodes (44): approve_run(), _as_utc(), create_run(), _create_run_record(), export_run(), get_run(), get_run_llm_calls(), get_run_timeline() (+36 more)

### Community 28 - "use-resizable-panel.ts"
Cohesion: 0.43
Nodes (6): CanvasSidebar(), clamp(), readStoredWidth(), useResizablePanel(), UseResizablePanelOptions, UseResizablePanelResult

### Community 29 - "test_p3c_boot.py"
Cohesion: 0.11
Nodes (25): field_validator, Settings, claim_pending_runs(), UUID, Dedicated worker loop for pending workflow runs., Claim claimable runs by CAS-ing their status to ``running``. The selection…, start_run_worker(), _worker_loop() (+17 more)

### Community 30 - "otlp_ingest.py"
Cohesion: 0.11
Nodes (29): _attrs(), _bounded_duration_ms(), _coerce_output_text(), _collect_spans(), _decode_anyvalue(), ingest_otlp_run(), _model(), _nano() (+21 more)

### Community 31 - "CommandPalette.tsx"
Cohesion: 0.07
Nodes (34): DraftTextarea(), ErrorBoundary, AppShell(), Action, ADD_NODE_EVENT, CommandPalette(), emitAddNode(), EXPORT_TRACE_EVENT (+26 more)

### Community 32 - "models.py"
Cohesion: 0.04
Nodes (61): _columns(), downgrade(), _indexes(), _inspector(), upgrade(), upgrade(), upgrade(), upgrade() (+53 more)

### Community 33 - "test_executor.py"
Cohesion: 0.08
Nodes (53): _enqueue_event(), _extract_delta_text(), _extract_text_from_event(), _extract_text_parts(), _extract_token_usage(), _json_default(), _normalize_text_part(), _on_remote_run_event() (+45 more)

### Community 34 - "db/__init__.py"
Cohesion: 0.07
Nodes (36): job_status(), Session, UUID, Background job status API., _sqlite_enable_foreign_keys(), BackgroundJob, create_job(), dispatch_job() (+28 more)

### Community 35 - "test_langsmith_tracing.py"
Cohesion: 0.09
Nodes (46): langsmith_traces_endpoint(), Full OTLP traces URL for a LangSmith API base. ``base`` is the LangSmith *API*…, Return the attributes that may leave the process for LangSmith., sanitize_span_attributes(), _all_text(), _execute(), _FailingExporter, _graph_with_secret() (+38 more)

### Community 36 - "api/assist.py"
Cohesion: 0.11
Nodes (43): compare(), draft_eval_suite(), edit_graph(), explain_run(), generate_schema(), generate_workflow(), _get_user_run(), DraftEvalSuiteResponse (+35 more)

### Community 37 - "add_credential"
Cohesion: 0.09
Nodes (43): add_credential(), DOCUMENTED BEHAVIOUR, not an endorsement: unlike the Aegis HMAC scheme there is…, No counter, no receipt row: a second session sees the same verdict, which is…, Read-only auth path: nothing on the hot path writes rows., Guard against the frozen clock hiding a unit mismatch: a signature built from…, Insert a credential row the way the API stores one., Call the subject; a passing verification returns None and raises nothing., ``abs(now - ts) > 300`` is a strict comparison: exactly ±300s is in. (+35 more)

### Community 38 - "graph_validation.py"
Cohesion: 0.07
Nodes (41): AgentToolSchemaError, ValueError, Validate stable references and bounds, returning attached declarations. MCP…, validate_agent_tool_schema(), template_uses_expressions(), _error_branch_unsupported(), GraphValidationError, _is_annotation() (+33 more)

### Community 39 - "settings/page.tsx"
Cohesion: 0.08
Nodes (40): SettingsPage(), CanvasTour(), computePosition(), findVisibleAnchor(), Position, resolveStepIndex(), warnDev(), GettingStartedBanner() (+32 more)

### Community 40 - "BaseNode.tsx"
Cohesion: 0.13
Nodes (20): BaseNode, BORDER_BY_STATE, ExtendedNodeData, formatTokens(), NodeChip(), NodeChipRow(), NodeRuntimeState, NodeTelemetry (+12 more)

### Community 41 - "Workflow"
Cohesion: 0.06
Nodes (70): Workflow, WorkflowRun, WorkflowVersion, Recover orphaned runs after a crash or deploy. Only rows older than…, recover_stale_runs(), approval_run(), fixture, fixture (+62 more)

### Community 42 - "workflows.py"
Cohesion: 0.12
Nodes (47): batch_eval_snippets(), _capped_request_body(), compare_runs(), create_knowledge_document(), delete_knowledge_document(), delete_workflow(), delete_workflow_memory(), eval_history() (+39 more)

### Community 43 - "test_rag_v1.py"
Cohesion: 0.07
Nodes (46): chunk_by_strategy(), _chunk_fixed(), _chunk_paragraphs(), chunk_text(), _decode_text(), _expand_ratio(), parse_document(), _parse_docx() (+38 more)

### Community 44 - "NodePalette.tsx"
Cohesion: 0.06
Nodes (43): CanvasSidebarProps, CanvasSidebarTab, RunComparison, tabs, VersionHistory, WorkflowDataPanel, WorkflowQualityPanel, CATEGORY_SECTIONS (+35 more)

### Community 45 - "platform.py"
Cohesion: 0.14
Nodes (31): deployment_descriptor(), GenericInvokePayload, get_deploy_descriptor(), get_published(), ingest_run(), IngestNodeEvent, IngestRunPayload, invoke_deployment() (+23 more)

### Community 46 - "test_run_from_here.py"
Cohesion: 0.09
Nodes (36): _ancestors(), apply_model_override(), _node_data(), _node_type(), prune_graph_for_start(), Any, ValueError, Authoring-only run helpers: pin outputs + run-from-here. These features let the… (+28 more)

### Community 47 - "api"
Cohesion: 0.05
Nodes (71): WorkflowCanvas, PolicyTemplates(), PolicyTemplatesProps, ruleSummary(), toConfig(), configFromRules(), GUARDRAIL_TYPES, PLAYGROUND_GUARDRAIL_TYPES (+63 more)

### Community 48 - "agent_tools.py"
Cohesion: 0.08
Nodes (30): AsyncExitStack, AgentBudgetExceeded, AgentFunctionTool, AgentToolState, _build_tools(), Any, RuntimeError, Native ADK tool agents, owner-bound MCP sessions, and per-node budgets. (+22 more)

### Community 49 - "mcp_server.py"
Cohesion: 0.10
Nodes (34): _MCPASGIEndpoint, MCP mount surface: wires the stateless MCP ASGI app into the FastAPI router.…, _args_to_payload(), _authenticate_deployment_headers(), call_tool(), _deployment_auth_missing(), _handle_post(), _json_rpc_error() (+26 more)

### Community 50 - "button.tsx"
Cohesion: 0.06
Nodes (68): chunkLabel(), EMPTY_SETTINGS, KnowledgePage(), splitTags(), credentialBinding(), extractVariables(), PlaygroundInner(), FILTER_IDS (+60 more)

### Community 51 - "workflow_capabilities.py"
Cohesion: 0.13
Nodes (36): attached_tool_node_ids(), executable_nodes(), Declaration IDs referenced by agents; call validation before execution. This…, Workflow steps, excluding annotations and agent-attached declarations., _gemini_ref(), missing_provider_keys(), _node_provider_models(), Session (+28 more)

### Community 52 - "services/credentials.py"
Cohesion: 0.13
Nodes (29): decrypt_credential_config(), encrypt_credential_config(), get_user_credential(), load_mcp_credential(), mask_credential_config(), mcp_cached_tools(), Any, Credential (+21 more)

### Community 53 - "schedule_info.py"
Cohesion: 0.13
Nodes (27): cron_is_valid(), cron_next_runs(), _is_supported_shape(), datetime, Cron expression helpers for schedule triggers., Only 5-field expressions (or an ``@`` macro) are supported. croniter accepts a…, list_user_scheduled_workflows(), list_workflow_schedules() (+19 more)

### Community 54 - "test_phase9.py"
Cohesion: 0.16
Nodes (22): normalize_workflow_import(), Import Aegis exports or manually converted graph_json, without dropping nodes., _agent_tool_export(), parametrize, _sample_export(), test_agent_tool_declarations_round_trip_save_export_import(), test_export_workflow_matches_import_format(), test_import_into_existing_workflow_versions_graph() (+14 more)

### Community 55 - "services/node_test.py"
Cohesion: 0.12
Nodes (34): check_provider_endpoint(), provider_env_var(), Conventional env var name for a provider's API key., Keyless-aware DNS policy for a resolved provider endpoint. Keyed providers must…, _build_test_context(), _cap_rendered(), _execute_node(), _format_result() (+26 more)

### Community 56 - "Migrate from OpenAI Agent Builder to Aegis"
Cohesion: 0.33
Nodes (5): Deadline and supported path, Executable safe Aegis import example, Migrate from OpenAI Agent Builder to Aegis, Node-by-node manual mapping, What JSON import accepts and rejects

### Community 57 - "persistent_memory.py"
Cohesion: 0.25
Nodes (14): clear_workflow_memory(), flush_memory_writes(), load_workflow_memory(), merge_memory_into_context(), namespace_to_dict(), Any, Session, UUID (+6 more)

### Community 58 - "observability.py"
Cohesion: 0.15
Nodes (26): InsightQueueRequest, observability_costs(), observability_dashboards(), observability_errors(), observability_insights(), observability_overview(), observability_quality(), observability_runs() (+18 more)

### Community 59 - "vector_stores.py"
Cohesion: 0.14
Nodes (19): delete_document_vectors(), _embedding_literal(), PgVectorStore, Any, Session, UUID, Pluggable vector stores for knowledge retrieval (Phase 4 RAG).…, Workflow documents with no ``embedding_vector`` — i.e. absent from the index… (+11 more)

### Community 60 - "config.py"
Cohesion: 0.07
Nodes (48): alias, _api_key_user_map(), get_current_user_id(), get_owner_user_id(), Request, UUID, Map api key -> (user_id, role). Values may be a bare uuid string or {"user_id":…, _resolve_api_token() (+40 more)

### Community 61 - "safe_http_request"
Cohesion: 0.04
Nodes (67): get_http_client(), AsyncClient, _pg_engine(), Validate the URL targets a public Postgres host and return the pinned IP.…, _validate_postgres_connection_url(), _hostname_blocked(), _is_blocked_ip(), AsyncClient (+59 more)

### Community 62 - "guardrail_policies.py"
Cohesion: 0.17
Nodes (22): create_policy(), delete_policy(), _get_policy(), list_policies(), list_templates(), PolicyCreate, PolicyUpdate, BaseModel (+14 more)

### Community 63 - "test_upgrade_phase3.py"
Cohesion: 0.14
Nodes (27): _alternation_risks_backtracking(), evaluate_embedding_similarity(), evaluate_exact(), evaluate_json_schema(), evaluate_numeric(), evaluate_regex(), evaluate_substring(), _has_nested_quantifier() (+19 more)

### Community 64 - "mcp_client.py"
Cohesion: 0.15
Nodes (26): _allowed_hosts(), _bounded_json(), make_mcp_tool_cache(), MCPClientError, MCPDisabledError, MCPSession, MCPTimeoutError, MCPToolError (+18 more)

### Community 65 - "RunDeck.tsx"
Cohesion: 0.17
Nodes (28): asRecord(), eventClass(), EventGlyph(), eventLabel(), eventStatus(), eventTime(), formatElapsed(), metricNumber() (+20 more)

### Community 66 - "test_assist.py"
Cohesion: 0.18
Nodes (26): GenEdge, GeneratedWorkflowDraft, _assign_positions(), _draft_to_graph(), Layer nodes left-to-right by BFS depth from entry nodes. Faithful port of the…, Convert a Gemini draft into canvas-shaped nodes/edges. Drops nodes with unknown…, _invalid_draft(), _mock_response() (+18 more)

### Community 67 - "wait_for_approval"
Cohesion: 0.21
Nodes (24): park_approval(), Park an approval wait, returning the wait metadata. ``allow_reuse`` (tool…, wait_for_approval(), backdate(), asyncio, parametrize, Approval audit transitions, deadline boundaries, and notification failures., A waiter whose Event was never signalled still resolves via the DB poll. (+16 more)

### Community 68 - "eval_presets.py"
Cohesion: 0.16
Nodes (25): _as_list_item(), create_eval_preset(), delete_eval_preset(), list_eval_presets(), preview_eval_preset(), delete, patch, post (+17 more)

### Community 69 - "wrap_graph_with_trigger_end"
Cohesion: 0.14
Nodes (26): Helpers for standard Trigger → … → End workflow graphs., Prepend Trigger and append End, wiring entry/exit automatically. When…, wrap_graph_with_trigger_end(), prune_graph_for_resume(), Return a new graph that resumes a crashed run at ``frontier_ids``. Nodes…, _declaration_graph(), _ids(), _linear_graph() (+18 more)

### Community 70 - "test_p3c_obs.py"
Cohesion: 0.15
Nodes (30): AlertRule, Threshold rule evaluated by the scheduler tick., _breached(), evaluate_alert_rules(), _metric_over_window(), _metric_value(), AlertRule, Session (+22 more)

### Community 71 - "test_audit_p1_p2_fixes.py"
Cohesion: 0.16
Nodes (31): _approval_key(), clear_approval_state(), _linear_graph(), _park_run_approval(), asyncio, parametrize, WorkflowRun, Integration coverage for previously-dark critical paths (audit P1/P2). Targets… (+23 more)

### Community 72 - "test_security_fixes.py"
Cohesion: 0.07
Nodes (51): Any, Code node validation and CPython/WASI execution. AST restrictions are defense…, run_sandboxed_code(), validate_code_safety(), broadcast_observability_event(), Any, Queue, User-scoped SSE fan-out for live observability updates. (+43 more)

### Community 73 - "chat.ts"
Cohesion: 0.19
Nodes (23): invokeWithKey(), invokeWithSession(), isSameOriginRequest(), POST(), relay(), isSameOriginRequest(), POST(), ChatPage() (+15 more)

### Community 74 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, moduleResolution (+18 more)

### Community 75 - "Backend Requirements"
Cohesion: 0.10
Nodes (26): Backend Requirements, duckduckgo-search, FastAPI, google-adk 2.11.0, google-genai, pypdf, python-docx, SQLAlchemy (+18 more)

### Community 76 - "test_p3c_input.py"
Cohesion: 0.10
Nodes (13): _make_run(), _make_workflow(), _post_raw_json(), P3-C / M8: request inputs that previously sailed through Pydantic and crashed…, Send a body with non-standard JSON (NaN/Infinity) — requests' strict serializer…, test_alert_threshold_inf_rejected(), test_alert_threshold_nan_rejected(), test_eval_preset_score_weight_nan_rejected() (+5 more)

### Community 77 - "Canvas Commoditization"
Cohesion: 0.16
Nodes (15): Aegis Competitive Landscape September 2026, Adaptive ML, Six Adoption Blockers, August 6 2026 Internal Analysis, Authoring Canvas, Canvas Commoditization, Build Guard Grade Operate Convergence, Report Coverage Boundaries (+7 more)

### Community 78 - "test_model_matrix.py"
Cohesion: 0.07
Nodes (41): Credential, api_key_available(), build_adk_model(), _looks_like_schema_rejection(), model_catalog(), provider_configured(), Any, Exception (+33 more)

### Community 79 - "app/layout.tsx"
Cohesion: 0.14
Nodes (17): metadata, plexMono, Toaster, viewport, MotionProvider(), TooltipProvider(), applyTheme(), getStoredTheme() (+9 more)

### Community 80 - "observability_rollups.py"
Cohesion: 0.18
Nodes (19): ObservabilityRollup, _adjust_bucket(), aggregate_rollups_for_user(), _bucket_hour(), _claim_ledger_transition(), datetime, Session, UUID (+11 more)

### Community 81 - "test_p3c_bus.py"
Cohesion: 0.12
Nodes (18): _bounded_put(), Insert ``key``/``value``, evicting the oldest entry when the map is full.…, asyncio, P3-C fixes: event-bus retry/queue bounds, async task logging, audit truncation,…, Unknown run id → permanent FK violation: raised immediately., context_ref carries a threading.Event the stages can poll., The pre-fix bug: f.exception() on a cancelled concurrent Future raises…, Cancelled cross-thread coroutines must not log a failure traceback. Exercises… (+10 more)

### Community 82 - "test_node_test_api.py"
Cohesion: 0.13
Nodes (28): EvalScores, BaseModel, _agent_workflow(), parametrize, Tests for the ephemeral node-test and expression-preview endpoints. No test…, _seed_run(), _seed_workflow(), test_expression_preview_from_run_steps_resolution() (+20 more)

### Community 83 - "test_agentops_phase3.py"
Cohesion: 0.12
Nodes (25): enrich_graph_guardrail_policies(), Resolve guardrail nodes' policyId into concrete rules before compile. Node-…, GuardrailPolicy, Named, reusable guardrail rule bundle., check_workflow_budget(), _positive_number(), Session, Workflow (+17 more)

### Community 84 - "test_p3c_workflows.py"
Cohesion: 0.12
Nodes (24): _create_workflow(), vec_required, P3-C workflow-slice fixes: upload cap enforcement, workflow-delete vector…, title → String(255), source_name → String(512): the multipart fields bypass…, Bulk KnowledgeDocument delete must not leave orphaned vec_knowledge rows on the…, Unit coverage for the bulk delete helper itself., sqlite-vec needs a Python whose sqlite3 exposes loadable extensions — absent on…, The staged payload lands whole in background_jobs.payload_json — the endpoint… (+16 more)

### Community 85 - "embeddings.py"
Cohesion: 0.10
Nodes (36): cosine_similarity_vectors(), embed_text(), Any, Text embeddings for vector RAG (Gemini with TF-IDF fallback)., retrieve_by_embedding(), load_workflow_kb_documents(), Any, Session (+28 more)

### Community 86 - "test_draft_identity.py"
Cohesion: 0.47
Nodes (9): _create(), _graph(), Draft identity: append-only authoring versions and compare-and-swap., test_changed_save_appends_and_keeps_the_old_graph(), test_dataset_revision_bumps_when_an_item_is_added(), test_omitted_revision_still_saves(), test_repair_candidate_does_not_become_the_draft(), test_stale_draft_revision_conflicts_without_a_new_row() (+1 more)

### Community 87 - "test_assist_eval_suite.py"
Cohesion: 0.20
Nodes (22): _EvalItemDraft, _EvalPresetDraft, _EvalSuiteDraft, Gemini structured-output shape for the draft-eval-suite prompt., _clear_rate_buckets(), _draft(), _mock_response(), fixture (+14 more)

### Community 88 - "parametrize"
Cohesion: 0.12
Nodes (17): Credential, parametrize, Format failures 401 without a query — a garbage header must not reach…, Non-ASCII decimal digits pass ``str.isdecimal()`` — the ``isascii()`` guard is…, Clock-skew tolerance is bounded in both directions — a captured delivery cannot…, ``None`` is a meaningful result, not an error: it is what lets the…, ``(None, None)`` is the fail-closed default — an unparseable or non-webhook…, No prefix matching, no truncation tolerance: flipping one hex digit of a… (+9 more)

### Community 89 - "Evaluation"
Cohesion: 0.22
Nodes (18): Braintrust, Braintrust Loop, Annotation Queues, Evaluation, Observability, Prompt Registry and Playground, Humanloop, LangSmith Insights (+10 more)

### Community 90 - "motion/index.ts"
Cohesion: 0.13
Nodes (18): TabPanelFade(), FrameData, GroupNode, StatusDot(), registry, StaggerRecord, useEntryStagger(), HoverLift() (+10 more)

### Community 91 - "drive_sync.py"
Cohesion: 0.11
Nodes (31): KnowledgeOAuthAttempt, collect(), connector_block_reason(), _delete_working_chunks(), _drive_source_ids(), _drive_version_matches(), DriveProvider, _hash() (+23 more)

### Community 92 - "Workbench.tsx"
Cohesion: 0.11
Nodes (23): BY_ID, CanvasNode, clamp(), DOT, Edge, edgePath(), EDGES, HOME (+15 more)

### Community 93 - "test_assist_history.py"
Cohesion: 0.22
Nodes (21): AssistHistoryTurn, One prior turn of a copilot thread. ``role`` is ``"user"`` (a past instruction)…, SuggestionsDraft, _current_graph(), _last_prompt(), _mock_response(), patch, Tests for threaded copilot history on the edit-graph / suggest-nodes assist… (+13 more)

### Community 94 - "validate_structured_output"
Cohesion: 0.24
Nodes (12): Parse ``text`` as JSON and validate it against ``schema``. Pure — no LLM.…, Enforce a JSON schema on output; on failure, re-ask the model to repair it…, validate_against_schema(), validate_structured_output(), Structured-output guardrail: JSON-schema validation + bounded re-ask. The re-…, test_invalid_output_without_key_fails(), test_json_missing_required_field_fails(), test_no_schema_configured_passes_with_warning() (+4 more)

### Community 95 - "test_reviewfix_auth.py"
Cohesion: 0.08
Nodes (56): _bind_session_id(), Namespace stored chat history under the session token's ``sid``. A bare client-…, _b64url(), _b64url_decode(), mint_session_token(), datetime, UUID, Hosted-chat session tokens: short-lived HMAC-bound deployment handles. A… (+48 more)

### Community 96 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 97 - "authoring_version"
Cohesion: 0.19
Nodes (20): adopt_draft(), annotate_version(), append_repair_candidate(), authoring_version(), DraftConflict, _next_number(), published_or_draft(), Exception (+12 more)

### Community 98 - "test_mcp_client.py"
Cohesion: 0.13
Nodes (20): MCPPinnedTransport, open_mcp_session(), Resolve/revalidate and pin every request, including SDK reconnects and DELETE., Initialize, list/call on, and deterministically close one credential session., _assert_process_gone(), mcp_credentials(), fixture, parametrize (+12 more)

### Community 99 - "validate_safe_regex"
Cohesion: 0.14
Nodes (20): _alternation_branches_overlap(), _body_has_unbounded_quantifier(), _branch_profile(), _has_catastrophic_structure(), _iter_quantified_groups(), ValueError, Guardrails against catastrophic backtracking in user-supplied regex patterns.…, Yield the inner body of every group immediately followed by an unbounded… (+12 more)

### Community 100 - "run_repair.py"
Cohesion: 0.14
Nodes (42): ArmRunner, get_repair(), post_adopt(), post_candidate(), post_context(), post_proposal(), post_repair(), post_validation() (+34 more)

### Community 101 - "test_mcp_server.py"
Cohesion: 0.22
Nodes (18): _invoke_headers(), _mcp_post(), _published_workflow(), asyncio, Response, MCP server surface: /mcp JSON-RPC tools exposed from published deployments., The stdio server's tool comes from the deployment descriptor; calls POST to the…, Create + publish a transform-only workflow; return (body, credential). (+10 more)

### Community 102 - "knowledge_library.py"
Cohesion: 0.17
Nodes (36): add_file(), add_text(), _base_out(), _chunk_counts(), _citation(), create_base(), delete_base(), delete_source() (+28 more)

### Community 103 - "schedule_worker.py"
Cohesion: 0.06
Nodes (72): Session, UUID, Keep workflow_schedules index in sync with canvas graphs. One workflow may…, sync_workflow_schedule(), _catchup_minutes(), count_scheduled_workflows(), _create_scheduled_run_row(), _created_at_in_minute() (+64 more)

### Community 104 - "test_assist_mvp2.py"
Cohesion: 0.22
Nodes (21): _EditGraphDraft, _GeneratedSchemaDraft, GenNode, Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)., Gemini structured-output shape. schema_object_json is a JSON-encoded string…, A node as returned by Gemini structured output., _current_graph(), _edit_draft_add_guardrail() (+13 more)

### Community 105 - "knowledge_revisions.py"
Cohesion: 0.12
Nodes (39): upgrade(), KnowledgeDocumentVersion, KnowledgeRevision, KnowledgeSourceDocument, Logical document inside one library or one workflow. Content lives on versions., _activate_empty(), _active_revision(), assert_allowed() (+31 more)

### Community 106 - "NodeExecutionError"
Cohesion: 0.11
Nodes (29): _in_spans(), _literal_spans(), _parameterize_query(), _post_integration_webhook(), Any, Integration node handlers — Slack, Email, Postgres (n8n-style)., (start, end) spans of single-quoted SQL string literals in ``query``. Handles…, Return an error message when the recipient is invalid; None if acceptable. (+21 more)

### Community 107 - "SimpleNamespace"
Cohesion: 0.09
Nodes (41): _apply_call_resilience(), estimate_cost_usd(), _local_cost_map(), ModelRates, Any, BasePlugin, Per-run token and cost accounting via ADK plugin callbacks. ADK 2.x's workflow…, Set a bounded per-call timeout + backoff retry on the outgoing LlmRequest. Uses… (+33 more)

### Community 108 - "NodeSpanTracker"
Cohesion: 0.12
Nodes (16): _exported_context(), get_span_id(), get_trace_id(), NodeSpanTracker, _parse_headers(), Context of the current span, only if it will actually be exported. An unsampled…, Tracks in-flight ADK node spans for a single workflow run., Attach OTel gen_ai semantic-convention attributes to a node span. (+8 more)

### Community 109 - "GuardrailPolicyPlugin"
Cohesion: 0.16
Nodes (28): GuardrailPolicyPlugin, BasePlugin, Applies a single guardrail policy to every agent's model input/output. ``mode``…, LlmResponse, parametrize, Workflow-level guardrail policy plugin (ADK callbacks). A single policy applied…, Mask sanitizes the aggregate, but the post-salvage recheck hits a production…, _request() (+20 more)

### Community 110 - "Run Executor"
Cohesion: 0.11
Nodes (20): psycopg Drivers, Workflow Budget Enforcement, Direct LLM Accounting Bypass, WorkflowRun Lost Updates, Schedules Pin Draft Versions, Trace Secret Scrub Gaps, SSE Broker Lifecycle Leaks, Stale Recovery versus Live Runs (+12 more)

### Community 112 - "Author Harden Grade Operate Ship"
Cohesion: 0.12
Nodes (19): Phase 3 Guardrails as policy layer, Presidio, Guardrail Fail-Open Paths, Annotation Queue, dataset copy_runs, Deferred Enterprise Tenancy, Fail-Closed Guardrails, Grade Stage (+11 more)

### Community 113 - "api/credentials.py"
Cohesion: 0.20
Nodes (20): cached_mcp_tools(), create_credential(), delete_credential(), discover_mcp_tools(), list_credentials(), _owned_mcp_credential(), delete, post (+12 more)

### Community 114 - "approval_service.py"
Cohesion: 0.14
Nodes (25): ApprovalRequest, Durable approval wait truth; any process can resolve, waiters poll the row., _decision_from_state(), _key_run_id(), _metadata(), _notification_data(), notify_approval(), _on_remote_decision() (+17 more)

### Community 115 - "test_iteration_node.py"
Cohesion: 0.27
Nodes (20): _ctx(), _iter_fn(), Tests for the iteration node (map-over-list, Dify-style single-node loop). The…, Parallel children folding _direct_llm_calls through the shallow item_ctx copy…, _run(), test_iteration_compiles(), test_iteration_empty_items_yields_empty_array(), test_iteration_fail_on_error_raises() (+12 more)

### Community 116 - "test_phase3_surfaces.py"
Cohesion: 0.25
Nodes (16): _adk_event(), _echo_graph(), _get_run(), _invoke(), _invoke_headers(), _issue_invoke_key(), _published_workflow(), asyncio (+8 more)

### Community 117 - "test_sqlite_uuid_affinity.py"
Cohesion: 0.17
Nodes (17): _broken_db(), Path, Regression coverage for the SQLite NUMERIC-affinity UUID defect fixed by…, Rows that were always fine (mixed-case hex, letters present) survive the repair…, A numeric UUID like …0010 collapses to integer 10; the repair must restore the…, End-to-end the original crash: insert via the real models on a migrated DB and…, Run `alembic upgrade head` against a scratch file. env.py resolves the URL from…, Hand-build the pre-021 defect: UUID-affinity column + an int-stored all-digit… (+9 more)

### Community 118 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @next/bundle-analyzer, postcss, tailwindcss (+11 more)

### Community 119 - "useRunReplay.ts"
Cohesion: 0.16
Nodes (16): PostRunTransport(), PostRunTransportProps, RunProgressStrip(), RunProgressStripProps, useElapsedSeconds(), deriveState(), isCompletedStatus(), isFailedStatus() (+8 more)

### Community 120 - "test_event_secrets.py"
Cohesion: 0.14
Nodes (23): authenticate_event_webhook(), Authenticate an inbound event webhook POST for a workflow. Unlike…, handshake_body(), Contract tests for Slack event-webhook authentication. Target:…, ``if slack_sig or slack_ts`` — a lone timestamp header must not silently fall…, Header precedence is part of the contract: a *bad* event token must not be…, The mirror case: the token authenticates, so a garbage Slack header pair must…, No Slack headers → the Aegis HMAC path runs and reports its own error, proving… (+15 more)

### Community 121 - "test_otlp_ingest.py"
Cohesion: 0.14
Nodes (13): _otlp_payload(), Inbound OTLP: POST /v1/ingest/runs accepts OTLP/GenAI-convention spans. An…, One batch, two independent traces: trace A ok, trace B errored., A collector batch with two trace ids must land as two independent runs — one…, A minimal-but-realistic OTel/GenAI export: agent root → llm + tool., M10: an ingested service named like a real workflow lands in the reserved…, M10: the savepoint+reselect only converges a create race when an IntegrityError…, test_external_workflow_name_unique_index() (+5 more)

### Community 122 - "code_runtime.py"
Cohesion: 0.26
Nodes (21): _download_archive(), _extract_archive(), fetch_runtime(), _identity(), _install_path(), _installed_files(), main(), _make_readable() (+13 more)

### Community 123 - "02 Split Studio Homepage Mockup"
Cohesion: 0.15
Nodes (18): Aegis Visual Agent Workflow Workbench, Bone and Monochrome Chrome, 02 Split Studio Homepage Mockup, Invoice Processing Pipeline, Last Run Summary, Open Canvas Action, Pipeline Graph Preview, Color-Coded Pipeline Nodes (+10 more)

### Community 124 - "deployments.py"
Cohesion: 0.16
Nodes (21): _coerce_config(), downgrade(), Encrypt existing plaintext credential secret values at rest (Fernet).…, config may come back as dict (PG JSONB) or str (SQLite JSON)., _rewrite(), _secret_keys(), upgrade(), decrypt_value() (+13 more)

### Community 125 - "quality_metrics.py"
Cohesion: 0.13
Nodes (26): aggregate_quality_metrics(), aggregate_workflow_quality(), detect_eval_regression(), enrich_run_summary(), extract_graph_quality_config(), Any, WorkflowRun, Aggregate evaluation and guardrail metrics for observability. (+18 more)

### Community 126 - "test_routing_adk2.py"
Cohesion: 0.48
Nodes (6): _branch_graph(), parametrize, Regression: conditional routing must work under ADK 2.x. ADK 2.x routes…, _run_graph(), test_if_decision_is_not_leaked_as_output(), test_if_routes_correct_branch()

### Community 127 - "dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, clsx, framer-motion, dependencies, class-variance-authority, clsx, framer-motion, next (+9 more)

### Community 128 - "Attention Inbox layout"
Cohesion: 0.14
Nodes (17): Approvals queue, Bone monochrome chrome, data/warehouse-sync-pipeline failed run, Editorial Aegis home page header, Monospace error log trace, Failed runs queue, Failure metadata header, Attention Inbox layout (+9 more)

### Community 129 - "test_online_sampling.py"
Cohesion: 0.21
Nodes (19): get_online_eval_sample_rate(), Session, The instance-wide, durable online-evaluation sampling override., set_online_eval_sample_rate(), clock(), db(), fixture, Freeze ``event_secrets.time`` for the whole module. Autouse because every test… (+11 more)

### Community 130 - "api/knowledge.py"
Cohesion: 0.16
Nodes (28): drive_callback(), get_documents(), get_libraries(), KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeQuery, KnowledgeTextCreate, KnowledgeUrlCreate (+20 more)

### Community 131 - "Cross-App Node Type System"
Cohesion: 0.16
Nodes (15): Error-Swallowing Node Handlers, Branch Edge Semantics, Aegis, compile_workflow, Design Language, Frontend Node Registry, Frontend Workflow Types, Google ADK (+7 more)

### Community 132 - "Provider-aware cost estimates"
Cohesion: 0.50
Nodes (3): Provider-aware cost estimates, Rate source, Usage contract

### Community 133 - "seal_scope"
Cohesion: 0.14
Nodes (23): KnowledgeDocument, Build one sealed revision from the chunks currently stored for this scope., seal_scope(), _make_kb_retrieve_fn(), _library(), Sealed knowledge revisions hide chunks that are not members., test_add_text_seals_a_revision_and_hides_a_later_stray_chunk(), test_cached_retrieval_drops_revoked_text_after_the_revision_is_emptied() (+15 more)

### Community 134 - "Continuously synced knowledge sources — Google Drive"
Cohesion: 0.10
Nodes (21): 10. Security, privacy, retention and observability, 11. Migration and implementation ownership, 12. Observable acceptance criteria, 1. Product decision and scope, 2. Current implementation and required cutover, 3.1 Authorization scope and operational eligibility, 3.2 Selection and hierarchy, 3.3 Exact content support (+13 more)

### Community 135 - "Eval-backed run repair: “Fix this run”"
Cohesion: 0.11
Nodes (19): 10. Privacy, permission invalidation, budgets, and retention, 11. Implementation seams and migration plan, 12. Behavior-level acceptance scenarios, 13. Definition of complete implementation, 1. Decision and companion contracts, 2. Current-code evidence and the actual gaps, 3. Terms and invariants, 5. Supported patch surface and validation (+11 more)

### Community 136 - "invoke_runner.py"
Cohesion: 0.11
Nodes (34): chat_invoke(), ChatInvokeRequest, ChatSessionRequest, create_chat_session(), BaseModel, datetime, post, Session (+26 more)

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
Cohesion: 0.18
Nodes (17): _normalize_output(), Any, Record upstream input and node output in the shared workflow context, applying…, wrap_with_context(), _error_graph(), _FakeCtx, Tests for per-node error-branch routing (n8n-style). A node that fails but…, Minimal stand-in for the ADK Context the wrapper writes ctx.route on. (+9 more)

### Community 142 - "test_tool_call_guardrail.py"
Cohesion: 0.23
Nodes (18): _ctx(), _plugin(), Action-layer (tool_call scope) guardrail policies. A policy's…, test_blocked_call_returns_synthetic_result_and_blocked_span(), test_both_scope_guards_text_and_tools(), test_clean_call_flows_through_normally(), test_frequency_cap_across_two_calls_on_same_tool(), test_frequency_cap_blocks_n_plus_1() (+10 more)

### Community 143 - "Tier 2 Big-tech Agent Platforms"
Cohesion: 0.14
Nodes (18): Capabilities Most Builders Lack, Agent Script, Amazon Bedrock AgentCore, AgentCore Policy, Salesforce Agentforce, Cisco AI Defense, Microsoft Copilot Studio, Deferred Enterprise Platform Gaps (+10 more)

### Community 144 - "aegis_cli/main.py"
Cohesion: 0.24
Nodes (12): ArgumentParser, build_parser(), CliError, cmd_gate(), main(), _pick_versions(), Exception, aegis — Aegis platform CLI. Commands: gate — run a regression experiment and… (+4 more)

### Community 145 - ".handle_async_request"
Cohesion: 0.25
Nodes (4): AsyncByteStream, _BoundedResponseStream, Request, Response

### Community 146 - "test_p3c_graph.py"
Cohesion: 0.15
Nodes (26): _edge(), _node(), _pinned_graph(), parametrize, P3-C slice G: reliability fields on bare-Agent nodes, pinned-output…, Outer router → inner router → merge → parallel → join is valid. Whichever inner…, Inner route y never reaches the join — that join can stall., test_join_accepts_nested_router_that_reconverges_before_the_join() (+18 more)

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

### Community 153 - "Quality-gated publishing — design specification"
Cohesion: 0.12
Nodes (17): 11. Atomic publication and freshness, 12. Frontend and CLI integration, 13. Security, privacy, and operational limits, 14. Delivery and migration plan, 15. Acceptance and verification, 1. Product decision, 2. Current implementation and necessary changes, 4. Invariants (+9 more)

### Community 154 - "Optional API Key Auth"
Cohesion: 0.18
Nodes (13): cryptography, Chat Session Isolation, Optional API Key Auth, Fernet Credential Encryption, Hosted Chat, Invoke Runner, Published MCP Server, Session History (+5 more)

### Community 155 - "test_mvp2_foundation.py"
Cohesion: 0.19
Nodes (6): _make_workflow(), Tests for MVP2 backend foundation: timeline, deploy, dashboards, crypto, cost…, test_cost_alert_rule_is_supported(), test_credential_secret_encrypted_at_rest(), test_deploy_descriptor_after_publish_includes_mcp_tool(), test_deploy_descriptor_requires_published_version()

### Community 156 - "GuardrailResult"
Cohesion: 0.27
Nodes (9): _parse_guardrail_status(), GuardrailResult, asyncio, parametrize, test_compile_quality_enforcement_metadata(), test_eval_threshold_blocked_error_carries_aggregate(), test_guardrail_preview_llm_engine(), test_quality_webhook_delivers_failure_payload_only() (+1 more)

### Community 157 - "test_dataset_loop.py"
Cohesion: 0.33
Nodes (11): _csv(), _items(), parametrize, Dataset-loop API regressions: atomic CSV and exact, tenant-safe run reuse., test_add_run_dedupes_across_capture_and_rejects_other_workflows(), test_cluster_capture_exact_members_and_scope(), test_csv_bad_rows_are_reported_without_partial_import(), test_csv_preserves_quoted_multiline_labels_and_metadata() (+3 more)

### Community 158 - "QuickAddMenu.tsx"
Cohesion: 0.14
Nodes (21): EdgeData, GradientEdge, GradientEdgeImpl(), NodeRow(), categorize(), CATEGORY_LABEL, ERROR_BRANCH_SOURCE_TYPES, NodeCategory (+13 more)

### Community 159 - "setup.sh"
Cohesion: 0.39
Nodes (10): allocate_ports(), apply_port_env(), copy_untracked_files(), error(), info(), install_deps(), persist_ports(), port_in_use() (+2 more)

### Community 160 - "WorkflowContext"
Cohesion: 0.13
Nodes (12): Any, Prior turns seeding this run — [] when the run has no session_id., Accumulates run input and per-step outputs for expression mapping., Snapshot safe for metrics/SSE — excludes workflow memory. ``session_history``…, Seed prior-turn history for a session-scoped run (invoke path)., WorkflowContext, test_workflow_context_snapshot_truncates_large_outputs(), test_workflow_context_session_history_helpers() (+4 more)

### Community 161 - "search.py"
Cohesion: 0.40
Nodes (8): run_search(), search_duckduckgo(), search_exa(), asyncio, patch, test_run_search_duckduckgo(), test_run_search_exa_without_key(), test_search_duckduckgo_formats_results()

### Community 162 - "_run_single_node_variant"
Cohesion: 0.28
Nodes (9): CompareVariantResult, Wrap a single node between a trigger and end for single-node execution., Execute one variant as a single-node LLM run, capturing telemetry. Reuses the…, _run_single_node_variant(), _single_node_graph(), asyncio, test_compare_config_cannot_override_node_type(), test_compare_rejects_non_llm_node_type() (+1 more)

### Community 163 - "Workflow inventory data table — columns: row checkbox, icon, name, status, version, last run, success rate, updated, actions"
Cohesion: 0.22
Nodes (11): Aegis visual agent-workflow workbench — observability/triage surface for LLM agent workflows, Aegis design language — warm near-black surfaces, bone/monochrome chrome, color reserved for status and data, Filter/search toolbar — 'Search workflows…', All Status, All Versions, Last 30d filters, List/Table view toggle, Templates, primary 'New workflow' button, 04-instrument-table.jpg — 'Instrument Table' homepage UI mockup for Aegis, Instrument Table layout — homepage concept: dense tabular inventory of agent workflows ('42 active workflows • 7 running'), Pagination footer — '1–25 of 142' with prev/next controls, Per-row action controls — run (play), edit (pencil), overflow menu, plus bulk-select checkboxes, Color-coded status pill system — SUCCESS (green), RUNNING (amber), FAILED (red); success-rate text colored green/red (+3 more)

### Community 164 - "test_knowledge_lock_order.py"
Cohesion: 0.19
Nodes (20): apply_embedding(), KnowledgeDocument, Session, _bulk_import_sync(), UUID, Background knowledge base indexing jobs., _reindex_sync(), run_bulk_import_job() (+12 more)

### Community 165 - "verify_slack_signature"
Cohesion: 0.10
Nodes (23): _deployment_workflow_user(), _payload_team_id(), Session, Slack event-webhook signature verification (R2-18). Real Slack deliveries carry…, Slack workspace id for team binding (event_callback carries it)., Deployment-side Slack binding from the published trigger node. Returns…, Verify a Slack event delivery against a bound Slack workspace. Raises 401 on…, verify_slack_signature() (+15 more)

### Community 166 - "Run Checkpoints"
Cohesion: 0.27
Nodes (10): Approval Identity and Timeouts, approval_requests, recover_stale_runs, Run Checkpoints, wait_for_approval, At-Least-Once Resume, Postgres-First Durable Execution, Human Approval Gate (+2 more)

### Community 167 - "Homepage mockup 05: Directory / Quiet Index (Workflows index page)"
Cohesion: 0.24
Nodes (10): Data typography: IBM Plex Mono for identifiers, versions, dates and the font badge; sans-serif for descriptions and headings, Aegis design language: warm near-black surfaces, bone/monochrome chrome, hairline dividers, color reserved for status and data, Homepage mockup 05: Directory / Quiet Index (Workflows index page), Monochrome status treatment: 'published' rendered as plain bone text, not a colored badge — color withheld even for status in the quiet index, Page header: oversized 'Workflows' title with descriptive subline 'Orchestrate, version, and publish internal automation sequences. 12 total', Directory / Quiet Index layout: calm, table-first index page with generous whitespace, no cards or dashboards, Sample workflow entries: onboard-new-hire, fraud-alert-escalate, daily-recon-csv, api-key-rotate, vendor-onboarding, incident-triage (6 of 12 shown), Quiet search input: hairline-outlined 'Search workflows…' field with magnifier icon, narrow width (+2 more)

### Community 168 - "Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions"
Cohesion: 0.27
Nodes (10): Detail pane showing selected workflow: serif display title, monospace description, metadata rows (Version 2.4.1, Updated 11 Oct 2024 14:37, Published 03 Sep 2024), Open and Run actions, macOS-style window chrome: traffic-light dots top-left, centered 'Aegis' title, Master-Detail layout pattern, Mixed typography: serif display face for detail title, monospace face for description and metadata, Aegis homepage mockup: master-detail workflow browser, Open (ghost/outlined) and Run (filled warm-taupe primary) action buttons, Selected list row highlighted with warm taupe/bone fill (Compliance Audit Trail), Warm near-black surfaces with bone/monochrome chrome; warm taupe accent reserved for selection and primary action (+2 more)

### Community 169 - "test_code_sandbox_isolation.py"
Cohesion: 0.14
Nodes (18): _configure_process(), _main(), Standalone trusted Wasmtime runner; never import Aegis application modules.…, _run_wasi(), _guest_json(), fixture, Capability probes bypass the AST only inside the trusted WASI runner., test_code_sandbox_missing_runtime_fails_closed() (+10 more)

### Community 170 - "test_moderation_guardrail.py"
Cohesion: 0.27
Nodes (9): _evaluate_moderation_scores(), Map category scores + thresholds to a verdict. Pure and side-effect-free so it…, Trust-layer Phase 3: moderation/toxicity guardrail rail. Covers the pure…, test_above_default_threshold_flags(), test_below_threshold_passes(), test_custom_single_threshold(), test_malformed_scores_do_not_crash(), test_per_category_thresholds_override_default() (+1 more)

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

### Community 176 - "compute_resume"
Cohesion: 0.20
Nodes (18): Per-node execution checkpoint for crash/restart resume. Status mirrors node…, RunCheckpoint, compute_resume(), _incoming_exec_edges(), _list_checkpoints(), load_checkpoints(), mark_node_started(), mark_pinned_skipped() (+10 more)

### Community 177 - "import_workflow"
Cohesion: 0.24
Nodes (18): bulk_import_knowledge(), create_workflow(), duplicate_workflow(), import_into_workflow(), import_workflow(), post, Workflow, WorkflowVersion (+10 more)

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

### Community 184 - "test_run_concurrency.py"
Cohesion: 0.19
Nodes (16): datetime, WorkflowRun, Guards for the run-concurrency gate: orphaned pending/running runs must not…, Concurrent complete + cancel: exactly one terminal write lands; the loser does…, stop_run commits cancelled before complete's CAS: complete loses, the row stays…, execute_run's setup claim on a cancelled row affects 0 rows — the run never…, Create a run whose created_at is `age_seconds` in the past (naive UTC to match…, A pending run older than the staleness window must not count toward the gate —… (+8 more)

### Community 185 - "api/node_test.py"
Cohesion: 0.18
Nodes (18): expression_preview(), _load_workflow_graph(), node_test(), post, Session, UUID, Ephemeral node-test and expression-preview endpoints (canvas authoring aids).…, Blocking DB reads for the node-test endpoint (runs in a worker thread). (+10 more)

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

### Community 190 - "test_run_repair.py"
Cohesion: 0.44
Nodes (8): _candidate(), _failed_run(), _graph(), Repair validates evidence and adopts a draft without publishing., test_api_validation_is_incomplete_and_unvalidated_adopt_does_not_publish(), test_injected_runner_can_pass_and_validated_adopt_stays_unpublished(), test_stale_session_cannot_adopt_over_another_adoption(), test_validation_retrieves_workflow_knowledge_like_a_normal_run()

### Community 191 - "teardown.sh"
Cohesion: 0.62
Nodes (6): info(), kill_dev_servers(), kill_port(), release_port(), teardown.sh script, warn()

### Community 192 - "agent_tool_schema.py"
Cohesion: 0.17
Nodes (13): MCPToolReference, NodeToolReference, TypedDict, Agent tool references and the executable/declaration boundary of a graph., get_node_meta(), NodeTypeMeta, TypedDict, Canonical node type metadata for the agentic workflow builder. (+5 more)

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

### Community 201 - "4. User journey and surfaces"
Cohesion: 0.29
Nodes (7): 4.1 Select the run and base, 4.2 Context and consent, 4.3 Diagnosis and grounded proposal, 4.4 Validate against current base, 4.5 Measured review and explicit adoption, 4. User journey and surfaces, UI states and accessibility

### Community 202 - "8. API contract and concrete examples"
Cohesion: 0.29
Nodes (7): 8.1 Open a repair and inspect context, 8.2 Consent and diagnosis, 8.3 Create the candidate, 8.4 Freeze focal and regression evaluation, 8.5 Cancel, rebase, and adopt, 8. API contract and concrete examples, Error contract

### Community 203 - "10. API contracts"
Cohesion: 0.33
Nodes (6): 10. API contracts, Policy, Publish, Release checks, Shared experiments, Shared snapshots and manifests

### Community 204 - "test_sessions.py"
Cohesion: 0.60
Nodes (5): _cleanup(), Session grouping + tag/session run filters. Runs carry an optional session_id…, _seed(), test_list_runs_filters_by_session_and_tag(), test_sessions_group_by_session_id()

### Community 205 - "test_phase6.py"
Cohesion: 0.17
Nodes (20): _hashing_vector(), _check_object(), _check_value(), enforce_output_schema(), normalize_output_schema(), _normalize_property(), _parse_and_check(), Any (+12 more)

### Community 206 - "Glass & glow visual language"
Cohesion: 0.33
Nodes (6): Motion primitives (PageEnter, StaggerList, HoverLift, NumberTween, useGlowPulse), Reduced-motion gating (useReducedMotionStrict), Design token system (CSS variables + Tailwind config), Glass & glow visual language, Design-system quality bar (instrument aesthetic, chroma for data only), Hardcoded white sheen vs --surface-highlight token (light theme loses lift)

### Community 207 - "utils.ts"
Cohesion: 0.04
Nodes (69): metadata, ExpressionPreview(), hasBoundContext(), InspectorSection(), PanelStat(), PanelStatGrid(), STAT_TONES, OutputBlock() (+61 more)

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

### Community 240 - "retrieve_documents"
Cohesion: 0.25
Nodes (13): _cosine_similarity(), Any, Keyword and BM25 knowledge retrieval (Lyzr RAG-lite)., retrieve_documents(), score_document(), score_document_bm25(), score_document_tfidf(), _tokenize() (+5 more)

### Community 296 - "render_template"
Cohesion: 0.17
Nodes (20): _coerce_number(), evaluate_condition(), Any, Template expression rendering for workflow context (n8n-style mapping)., Replace ``{{path}}`` placeholders using workflow context., Evaluate a structured IF condition (n8n-style, expression operands)., Resolve a dotted ``{{path}}`` against the workflow context. Resolvable roots:…, _render_operand() (+12 more)

### Community 297 - "7. Sync algorithm, removals and freshness"
Cohesion: 0.40
Nodes (5): 7.1 Initial/full reconciliation, 7.2 Incremental polling, 7.3 Access receipts and offline behavior, 7.4 Denial versus deletion versus restoration, 7. Sync algorithm, removals and freshness

### Community 298 - "5. Shared immutable artifacts"
Cohesion: 0.40
Nodes (5): 5.1 Draft identity and version immutability, 5.2 ExecutionManifest, 5.3 EvaluationSnapshot, 5.4 WorkflowRelease, 5. Shared immutable artifacts

### Community 299 - "test_guardrail_advanced.py"
Cohesion: 0.22
Nodes (16): _analyzer_available(), _default_entities(), detect_pii_presidio(), _get_analyzer(), _get_anonymizer(), Any, Optional Microsoft Presidio integration for entity-based PII detection., redact_pii_presidio() (+8 more)

### Community 300 - "7. Evaluation and verdict semantics"
Cohesion: 0.40
Nodes (5): 7. Evaluation and verdict semantics, Evaluator contract, Execution failures and crash recovery, Policy defaults and bounds, Verdict and eligibility

### Community 301 - "Aegis — Future Roadmap (Feature Gaps)"
Cohesion: 0.14
Nodes (13): Aegis — Future Roadmap (Feature Gaps), Deliberately out of scope (not gaps), Framing, P0.1 · Multi-model / multi-provider support — **SHIPPED 2026-09**, P0.2 · Bidirectional MCP (client + real server) — **SHIPPED 2026-10**, P0 — Table-stakes gaps (highest leverage), P1.1 · RAG depth (Knowledge Pipeline), P1.2 · Evaluation rigor — online evals + CI gates (+5 more)

### Community 302 - "CanvasContextMenu.tsx"
Cohesion: 0.48
Nodes (6): CanvasContextMenu(), CanvasContextMenuProps, ContextMenuItem, firstEnabledIndex(), isSeparator(), FOCUS_EVENT

### Community 303 - "api/templates.py"
Cohesion: 0.19
Nodes (19): _builtin_items(), create_template(), list_eval_presets(), list_templates(), _persisted_item(), post, Session, UUID (+11 more)

### Community 304 - "sub_workflow.py"
Cohesion: 0.15
Nodes (18): EvalThresholdBlockedError, Exception, _parse_evaluation_scores(), DNS-level SSRF gate for provider endpoints in a graph (sync, network I/O). Call…, validate_provider_endpoints(), _check_child_evaluations(), execute_sub_workflow(), Any (+10 more)

### Community 305 - "schedule_task"
Cohesion: 0.22
Nodes (13): _log_task_failure(), Any, Helpers for fire-and-forget asyncio tasks with exception logging., Schedule ``coro`` on the running event loop. When called from a worker thread…, schedule_task(), Any, UUID, Workflow (+5 more)

### Community 306 - "test_templates_mvp2.py"
Cohesion: 0.24
Nodes (6): Workflow, Tests for MVP2 template publishing + provenance endpoints., _seed_workflow(), test_create_template_then_appears_in_list(), test_persisted_templates_are_private_to_publisher(), test_use_persisted_template_increments_usage_and_returns_graph()

### Community 307 - "Aegis — System Architecture"
Cohesion: 0.20
Nodes (9): 1. System overview, 2. Run pipeline (the core loop), 3. Backend layering, 4. Node type system (spans both apps), 5. LLM provider layer, 6. Execution modes and cross-process transport, 7. Data model (key relationships), Aegis — System Architecture (+1 more)

### Community 308 - "workflow.py"
Cohesion: 0.18
Nodes (16): BaseModel, field_validator, Result of POST /api/workflows/{id}/knowledge/upload., Accepts full aegis-workflow-v1 export JSON or a partial payload with graph_json., RunCompareResponse, ScheduledWorkflowInfo, UploadKnowledgeResponse, WorkflowCreate (+8 more)

### Community 309 - "test_deployment_auth.py"
Cohesion: 0.40
Nodes (13): invoke_headers(), issue(), Consumer-visible scope, publication, rotation and raw-body signing guarantees., signed_headers(), test_account_keys_cannot_invoke_and_invoke_keys_cannot_manage(), test_invoke_key_matches_only_published_deployment(), test_invoke_quota_shared_across_routes_and_ignores_account_headers(), test_only_owner_editor_can_rotate_or_revoke() (+5 more)

### Community 310 - "recovery-state.tsx"
Cohesion: 0.19
Nodes (6): ErrorBoundaryProps, ErrorBoundaryState, RecoveryState(), RecoveryStateProps, RecoveryTone, toneStyles

### Community 311 - "event_webhooks.py"
Cohesion: 0.21
Nodes (11): _build_input(), _event_source(), Any, post, Request, Session, UUID, Inbound event webhooks: ``POST /v1/webhooks/{workflow_id}``. The generic… (+3 more)

### Community 312 - "Tier 1 Visual Builders"
Cohesion: 0.22
Nodes (9): Activepieces, CrewAI AMP, Gumloop, Gumstack, Lindy, Security-hardened Self-host Audience, Tier 1 Visual Builders, VectorShift (+1 more)

### Community 313 - "6. Shared evaluation and execution semantics"
Cohesion: 0.50
Nodes (4): 6. Shared evaluation and execution semantics, Immutable identity, Leakage, selection bias, and incomplete observations, Safe tool execution and fixtures

### Community 314 - "Token Streaming"
Cohesion: 0.43
Nodes (8): Postgres Checkpoint Shortcut, Durable Execution, Token Streaming, Hatchet, LangSmith Deployment, Restack, Temporal Agent Harness, Tier 4 Execution Substrate

### Community 315 - "6. Durable storage and immutable revision contract"
Cohesion: 0.50
Nodes (4): 6.1 Tables and indexes, 6.2 Sealing and activation, 6.3 Immutable read seam shared with publishing and repair, 6. Durable storage and immutable revision contract

### Community 316 - "3. User experience"
Cohesion: 0.50
Nodes (4): 3. User experience, Configure a release policy, Evaluate and publish, First publish and recovery

### Community 318 - "observability_service.py"
Cohesion: 0.16
Nodes (30): enrich_leaderboard_names(), merge_rollup_quality(), Any, Blend rollup aggregates with recent-run detail metrics., build_dashboards(), build_guardrail_violations(), build_overview(), build_quality() (+22 more)

### Community 321 - "test_api.py"
Cohesion: 0.25
Nodes (5): Two racing POST .../versions must not create duplicate version_numbers., test_concurrent_version_saves_produce_unique_numbers(), test_create_and_list_workflow(), test_create_run_requires_gemini_for_agent_workflow(), test_published_invoke_accepts_serialized_json_input()

### Community 339 - "Local Postgres Service"
Cohesion: 0.33
Nodes (6): backend CI job (alembic upgrade head on SQLite + pytest), frontend CI job (npm typecheck + lint + build), migrations-postgres CI job (alembic upgrade head on pgvector/pgvector:pg16), CI GitHub Actions Workflow, Docker Compose, Local Postgres Service

### Community 340 - "authenticate_invoke"
Cohesion: 0.32
Nodes (12): WorkflowDeployment, authenticate_invoke(), issue_credential(), owner_published_workflow(), CredentialKind, Session, UUID, Workflow (+4 more)

### Community 341 - "get_db"
Cohesion: 0.16
Nodes (21): AlertRuleCreate, AlertRuleUpdate, create_rule(), delete_rule(), list_events(), list_rules(), AlertRule, BaseModel (+13 more)

### Community 342 - "clipboard.ts"
Cohesion: 0.35
Nodes (10): ClipboardStore, copyToClipboard(), duplicateFragment(), materialize(), materializeClipboard(), materializeFragmentAt(), nextNodeIndex(), serializeSelection() (+2 more)

### Community 343 - "SkyClock.tsx"
Cohesion: 0.33
Nodes (10): clock(), EMPTY, fromJulian(), nextSunrise(), pad(), Sky, span(), sunriseFor() (+2 more)

### Community 344 - "deploy_descriptor.py"
Cohesion: 0.33
Nodes (9): build_deploy_descriptor(), build_mcp_input_schema(), find_input_schema_fields(), _node_type(), Any, Build a deploy descriptor (invoke URL, cURL, MCP tool) for a published…, Return the first input_schema node's ``inputFields`` (or [])., Derive a JSON Schema object for the MCP tool's input. Uses the workflow's… (+1 more)

### Community 345 - "_SafetyVisitor"
Cohesion: 0.18
Nodes (6): Attribute, _SafetyVisitor, Call, Import, ImportFrom, Name

### Community 346 - "run_filters.py"
Cohesion: 0.44
Nodes (8): filter_runs_by_eval_passed(), filter_runs_by_guardrail_blocked(), filter_runs_by_has_eval(), WorkflowRun, Cross-database filters for workflow run list queries., run_eval_passed(), run_guardrail_blocked(), run_has_eval()

### Community 347 - "graph-preview.tsx"
Cohesion: 0.22
Nodes (9): NewWorkflowPage(), CATEGORY_COLOR_VAR, GraphLike, GraphPreview(), PreviewEdge, previewEdges(), previewLayout(), PreviewNode (+1 more)

### Community 348 - "KnowledgeBulkImport"
Cohesion: 0.38
Nodes (5): KnowledgeBulkImport, KnowledgeDocumentCreate, KnowledgeDocumentResponse, BaseModel, model_validator

### Community 349 - "HighlightedSample.tsx"
Cohesion: 0.33
Nodes (9): escapeRegExp(), findKeywordMatches(), findPiiMatches(), HighlightedSample(), HighlightedSampleProps, MatchSpan, mergeSpans(), PII_PATTERNS (+1 more)

### Community 350 - "record_audit"
Cohesion: 0.29
Nodes (7): Any, Session, UUID, Audit log: who changed what, when. Callers pass an open session; the entry…, record_audit(), test_record_audit_normal_fields(), test_record_audit_truncates_oversized_fields()

### Community 351 - "test_dataset_capture.py"
Cohesion: 0.60
Nodes (5): _cleanup(), Bulk capture of production runs into a golden dataset. Covers the filter modes…, _seed(), test_capture_failed_then_dedups(), test_capture_low_eval()

### Community 352 - "submit_approval"
Cohesion: 0.50
Nodes (5): _keys_for_run(), submit_approval(), asyncio, test_approval_early_submit_satisfies_later_wait(), test_approval_submit_unblocks_waiter()

### Community 353 - "trace_insights"
Cohesion: 0.38
Nodes (6): output_pattern(), Any, Session, UUID, Group low-scoring and thumbs-down runs by a normalized output pattern., trace_insights()

### Community 354 - "workflow-import.ts"
Cohesion: 0.33
Nodes (5): parseWorkflowExport(), readWorkflowExportFile(), WORKFLOW_EXPORT_FORMAT, WorkflowExportPayload, WorkflowImportError

### Community 356 - "test_mark_node_started_leaves_terminal_updated_at_untouched"
Cohesion: 0.67
Nodes (3): WorkflowRun, A stale started-replay must not bump updated_at on a completed row, or the…, test_mark_node_started_leaves_terminal_updated_at_untouched()

## Ambiguous Edges - Review These
- `Workflow node labels: ingest-pipeline, dedupe-v3, enrich-taxonomy, llm-classifier-4, agent-review-loop, route-decision, archive-cold, core-orchestrator v2.4, notify-slack, validate-cold, validate-echesv` → `Small ambiguous metrics/badge node labeled '2 ~ 3 m/m' with unclear companion label ('de8mm') attached below validate-cold`  [AMBIGUOUS]
  docs/design/homepage-mockups/08-system-map.jpg · relation: conceptually_related_to
- `CI Regression Gate` → `CLI Gate Baseline Semantics`  [AMBIGUOUS]
  bugs.md · relation: conceptually_related_to
- `Retrieval Correctness` → `Embedding Dimension Alignment`  [AMBIGUOUS]
  issues.md · relation: conceptually_related_to

## Knowledge Gaps
- **653 isolated node(s):** `run.sh script`, `setup.sh script`, `UV_CACHE_DIR`, `run.sh script`, `aegis-cli` (+648 more)
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
- **Why does `ToolAgentNode` connect `test_agent_tools_runtime.py` to `compiler.py`, `BaseNode.tsx`, `GuardrailJudgeUnavailableError`, `NodeExecutionError`, `test_phase6.py`, `agent_tools.py`, `services/node_test.py`?**
  _High betweenness centrality (0.306) - this node is a cross-community bridge._
- **Why does `BaseNode` connect `BaseNode.tsx` to `test_agent_tools_runtime.py`?**
  _High betweenness centrality (0.305) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `api.ts`, `AssistRail.tsx`, `RunDetailView.tsx`, `observability/page.tsx`, `WorkflowCanvas.tsx`, `formatRelativeTime`, `QuickAddMenu.tsx`, `settings/page.tsx`, `BaseNode.tsx`, `NodePalette.tsx`, `CanvasContextMenu.tsx`, `api`, `button.tsx`, `recovery-state.tsx`, `RunDeck.tsx`, `utils.ts`, `SkyClock.tsx`, `motion/index.ts`, `graph-preview.tsx`, `Workbench.tsx`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `run.sh script`, `setup.sh script`, `UV_CACHE_DIR` to the rest of the system?**
  _653 weakly-connected nodes found - possible documentation gaps or missing edges._