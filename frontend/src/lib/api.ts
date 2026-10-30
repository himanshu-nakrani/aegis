import { authHeaders } from "@/lib/auth";
import type {
  AlertEvent,
  AlertRule,
  DatasetDetail,
  DatasetSummary,
  DatasetCopyResult,
  DraftEvalSuiteResponse,
  FeedbackResult,
  Experiment,
  LlmCall,
  ObservabilityCosts,
  ObservabilityErrors,
  OpsConfig,
  RunFeedback,
  EvalHistoryEntry,
  EvalPreset,
  RunCompareResponse,
  RunListItem,
  RunSession,
  Workflow,
  WorkflowGraph,
  WorkflowListItem,
  WorkflowRun,
  Credential,
  CredentialType,
  MCPToolsResponse,
  ModelCatalogEntry,
  WorkflowTemplate,
  WorkflowVersion,
  WorkflowVersionListItem,
} from "@/types/workflow";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface NodeSuggestion {
  node_type: string;
  label: string;
  reason: string;
  default_data: Record<string, unknown> | null;
}

export interface GuardrailPolicy {
  id: string;
  name: string;
  description: string | null;
  rules_json: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface GuardrailPolicyCreate {
  name: string;
  description?: string | null;
  rules_json?: Record<string, unknown>;
}

/** A built-in guardrail policy template — adopt to create an owned copy. */
export interface GuardrailPolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  rules_json: Record<string, unknown>;
}

export interface GuardrailPolicyUpdate {
  name?: string | null;
  description?: string | null;
  rules_json?: Record<string, unknown> | null;
}

/** Error thrown by `request()` for non-2xx responses; `status` lets callers
 *  branch on specific HTTP codes (e.g. 413 for upload size caps). */
export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      // FormData bodies must let the browser set the multipart boundary.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.detail === "string") {
          message = parsed.detail;
        } else if (parsed && Array.isArray(parsed.detail)) {
          // O9: FastAPI 422 sends detail as [{loc, msg, type, ...}] — join the
          // human-readable pieces so toasts don't render raw JSON/HTML.
          message = parsed.detail
            .map((d: Record<string, unknown>) => {
              const loc = Array.isArray(d?.loc) ? d.loc.join(".") : "";
              const msg = typeof d?.msg === "string" ? d.msg : "Invalid value";
              return loc ? `${loc}: ${msg}` : msg;
            })
            .join("; ");
        }
      } catch {
        // not JSON — HTML/doctype/empty error pages must not land raw in toasts
        const trimmed = text.trim().toLowerCase();
        if (trimmed.startsWith("<") || trimmed.includes("<!doctype")) {
          message = "";
        }
      }
    }
    throw new ApiRequestError(response.status, message || `Request failed: ${response.status}`);
  }

  // 204 No Content (and other empty bodies) have nothing to parse.
  const text = await response.text();
  // #28: 2xx with non-JSON body (proxy HTML, dev-server page) must not surface
  // a raw SyntaxError as a status-handled failure — normalize to ApiRequestError.
  try {
    return (text ? JSON.parse(text) : undefined) as T;
  } catch {
    throw new ApiRequestError(response.status, `Request failed: ${response.status} (non-JSON response)`);
  }
}

// ---- MVP 2 read-endpoint contracts (backend Milestone 0C) ----

/** One node execution on a run's timeline — offset+duration for a true
 *  span waterfall and for re-driving canvas state during run replay. */
export interface RunTimelineNode {
  node_id: string;
  node_type: string;
  label: string | null;
  status: string;
  latency_ms: number | null;
  start_offset_ms: number;
  duration_ms: number;
}

export interface RunTimeline {
  run_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_duration_ms: number | null;
  nodes: RunTimelineNode[];
}

/** CI regression gate result for an experiment. `status` reflects the gate,
 *  not the experiment run: pending (poll), passed, failed, error, or
 *  not_applicable (batch experiments have no baseline to gate against). */
export interface ExperimentGate {
  experiment_id: string;
  kind: string;
  status: "pending" | "passed" | "failed" | "error" | "not_applicable";
  gate_passed: boolean | null;
  eval_delta: number | null;
  failure_delta: number | null;
  max_eval_drop: number | null;
  reasons: string[];
}

/** Trust layer: a node in a run's nested execution trace tree. Kinds nest as
 *  node → agent_step → tool_call / llm_call / guardrail / eval, sharing one
 *  offset+duration axis so the waterfall drills into agent internals. */
export type RunSpanKind =
  | "node"
  | "agent_step"
  | "tool_call"
  | "llm_call"
  | "guardrail"
  | "eval";

export interface RunSpan {
  id: string;
  parent_span_id: string | null;
  node_id: string | null;
  kind: RunSpanKind;
  name: string;
  status: string;
  offset_ms: number | null;
  duration_ms: number | null;
  attributes: Record<string, unknown> | null;
  tokens: Record<string, number> | null;
  cost_usd: number | null;
  /** Nested children, pre-assembled server-side into a tree. */
  children: RunSpan[];
}

export interface RunTrace {
  run_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_duration_ms: number | null;
  /** Root-level spans (typically one per node), each with nested children. */
  spans: RunSpan[];
}

/** One row of the cross-run trace search (GET /api/observability/spans).
 * `record` says which table the hit came from. */
export interface TraceSearchHit {
  record: "span" | "llm_call";
  id: string;
  run_id: string;
  workflow_id: string;
  workflow_name: string;
  node_id: string | null;
  kind: string;
  name: string;
  status: string | null;
  latency_ms: number | null;
  model: string | null;
  total_tokens: number | null;
  cost_usd: number | null;
  created_at: string | null;
}

export interface TraceSearchFilters {
  source?: "all" | "spans" | "llm_calls";
  workflow_id?: string;
  run_id?: string;
  node_id?: string;
  kind?: string;
  status?: string;
  model?: string;
  min_latency_ms?: number;
  max_latency_ms?: number;
  min_tokens?: number;
  max_tokens?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface TraceSearchResult {
  total: number;
  limit: number;
  offset: number;
  items: TraceSearchHit[];
}

/** One row of the annotation review queue (GET /api/annotation/queue). */
export interface AnnotationTask {
  id: string;
  run_id: string;
  workflow_id: string;
  workflow_name: string | null;
  status: "pending" | "labeled" | "skipped";
  priority: number;
  assignee: string | null;
  created_by: string;
  expected_output: string | null;
  notes: string | null;
  rating: number | null;
  category: string | null;
  dataset_item_id: string | null;
  labeled_at: string | null;
  created_at: string | null;
  run: {
    status: string;
    input_text: string;
    final_output: string | null;
    eval_aggregate: number | null;
    eval_passed: boolean | null;
    created_at: string | null;
  } | null;
}

export interface AnnotationQueueResult {
  total: number;
  items: AnnotationTask[];
}

export interface AnnotationFilters {
  status?: "pending" | "labeled" | "skipped";
  workflow_id?: string;
  unlabeled_first?: boolean;
  limit?: number;
  offset?: number;
}

export interface AnnotationEnqueueResult {
  task: AnnotationTask;
  created: boolean;
}

/** Bulk enqueue payload mirrors the backend `EnqueueRequest` bulk shape:
 *  capture recent `failed` / `low_eval` runs for review. */
export interface AnnotationEnqueueBulkPayload {
  workflow_id: string;
  filter: "failed" | "low_eval";
  limit?: number;
  max_eval?: number;
  priority?: number;
  assignee?: string;
}

export interface AnnotationEnqueueBulkResult {
  enqueued: number;
  already_queued: number;
  filter: string;
}

export interface AnnotationLabelResult {
  task: AnnotationTask;
  dataset: { dataset_id: string; dataset_name: string | null; item_id: string } | null;
}

export interface DeployMcpTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type?: string; description?: string; default?: unknown }>;
    required: string[];
  };
}

/** Descriptor for the Publish & Deploy sheet — invoke URL, cURL, MCP spec. */
export interface DeployDescriptor {
  workflow_id: string;
  workflow_name: string;
  published_version_id: string;
  published_version_number: number | null;
  invoke_url: string;
  invoke_path: string;
  method: "POST";
  curl: string;
  mcp_tool: DeployMcpTool;
  deployment_id: string | null;
  invoke_key_active: boolean;
  webhook_secret_active: boolean;
  chat_token_active: boolean;
  chat_token_expires_at: string | null;
  headers: Record<string, string>;
  webhook: {
    algorithm: string;
    window_seconds: number;
    headers: string[];
    signing_format: string;
    signature_format: string;
  };
}

export type DeploymentCredentialKind = "invoke_key" | "webhook_secret" | "chat_token";

export interface DeploymentCredentialStatus {
  deployment_id: string | null;
  invoke_key_active: boolean;
  webhook_secret_active: boolean;
  chat_token_active: boolean;
  chat_token_expires_at: string | null;
}

export interface DeploymentCredential extends DeploymentCredentialStatus {
  kind: DeploymentCredentialKind;
  secret: string;
  version_id: string;
}

export interface DashboardWorkflowRow {
  workflow_id: string;
  workflow_name: string;
  run_count: number;
  failed_count: number;
  cost_usd: number | null;
  total_tokens: number;
}

export interface DashboardNodeTypeRow {
  node_type: string;
  count: number;
  failed_count: number;
  avg_latency_ms: number | null;
}

export interface DashboardModelRow {
  model: string;
  call_count: number;
  total_tokens: number;
  cost_usd: number | null;
  avg_latency_ms: number | null;
}

export interface ObservabilityDashboards {
  filters: {
    status: string | null;
    workflow_id: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  run_count: number;
  status_counts: Record<string, number>;
  total_cost_usd: number | null;
  total_tokens: number;
  latency_ms: { p50: number | null; p95: number | null; p99: number | null; sample_size: number };
  by_workflow: DashboardWorkflowRow[];
  by_node_type: DashboardNodeTypeRow[];
  by_model: DashboardModelRow[];
}

export interface ObservabilityDashboardFilters {
  status?: string;
  workflow_id?: string;
  start_date?: string;
  end_date?: string;
}

// ---- MVP 2 AI-authoring contracts (backend Milestone 2) ----

export interface GraphDiff {
  added_node_ids: string[];
  removed_node_ids: string[];
  changed_node_ids: string[];
  added_edges: { source: string; target: string; route: string | null }[];
  removed_edges: { source: string; target: string; route: string | null }[];
}

/** Canvas Assist rail: a reviewable proposal (never auto-applied). */
export interface EditGraphResponse {
  proposed_graph: WorkflowGraph;
  diff: GraphDiff;
  notes: string[];
  summary: string;
}

/** One prior turn of a threaded copilot conversation. Assistant turns carry a
 *  compact summary of what was proposed plus the outcome the user chose. */
export interface AssistHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompareVariantResult {
  label: string;
  output: string | null;
  latency_ms: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  error: string | null;
}

export interface GenerateSchemaResponse {
  json_schema?: Record<string, unknown> | null;
  regex?: string | null;
  notes: string[];
}

/** Live rubric preview: LLM-judge scores for a sample, or a skip/error marker. */
export interface EvalPreview {
  faithfulness?: number;
  helpfulness?: number;
  relevance?: number;
  toxicity?: number;
  reasoning?: string;
  aggregate_score?: number | null;
  skipped?: boolean;
  message?: string;
  error?: string;
}

/** RAG-specific judge scores for a (question, context, answer) triple. */
export interface RagPreview {
  context_precision?: number;
  faithfulness?: number;
  answer_relevance?: number;
  reasoning?: string;
  rag_aggregate?: number | null;
  skipped?: boolean;
  message?: string;
  error?: string;
}

/** Unified Trust surface: every rate computed over one consistent recent-run
 *  window (see backend build_trust) so quality + safety + cost tell one story. */
export interface TrustSummary {
  runs_scanned: number;
  window_limit: number;
  eval_evaluated: number;
  eval_passed: number;
  /** Runs with an explicit fail verdict (eval_passed === false). Not
   *  eval_evaluated - eval_passed — scored-but-unjudged runs are neither. */
  eval_failed: number;
  /** passed / (passed + failed); null when no pass/fail verdicts exist. */
  eval_pass_rate: number | null;
  avg_eval: number | null;
  eval_trend: number[];
  guardrail_blocked_runs: number;
  guardrail_block_rate: number | null;
  guardrail_events: { passed: number; warned: number; failed: number; total: number };
  failed_runs: number;
  failure_rate: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  latency_p99_ms: number | null;
  total_cost_usd: number | null;
  total_tokens: number;
  top_workflows_by_cost: Array<{
    workflow: string;
    runs: number;
    cost_usd: number | null;
    failures: number;
  }>;
}

/** Guardrail violation drill-down: events grouped by rail type + a recent log. */
export interface GuardrailViolations {
  runs_scanned: number;
  window_limit: number;
  total_events: number;
  total_violations: number;
  by_type: Array<{
    type: string;
    passed: number;
    warned: number;
    failed: number;
    total: number;
    violations: number;
  }>;
  top_workflows: Array<{ workflow: string; violations: number; runs: number }>;
  recent: Array<{
    run_id: string;
    workflow: string | null;
    node_label: string | null;
    type: string;
    status: string;
    message: string;
    created_at: string | null;
  }>;
}

// ---- Canvas data loop: single-node step-run + live expression preview ----

/** Single-node step-run request. `extra_context.steps` maps upstream node ids
 *  to their latest output so {{steps.x.output}} references resolve server-side.
 *  `node_data` carries the node's current on-canvas config so unsaved inspector
 *  edits (and not-yet-saved nodes) are what actually gets tested. */
export interface NodeTestRequest {
  node_id: string;
  input_text: string;
  extra_context: { steps: Record<string, string> } | null;
  node_data?: Record<string, unknown> | null;
}

/** Result of testing one node in isolation. `unsupported` is not a failure —
 *  some node kinds (e.g. triggers) have nothing to step-run. */
export interface NodeTestResult {
  node_id: string;
  status: "completed" | "failed" | "unsupported";
  output: string | null;
  error: string | null;
  latency_ms: number;
}

/** Live expression preview request — render a {{ }} template against a run's
 *  context. `run_id: null` lets the backend pick the workflow's latest run. */
export interface ExpressionPreviewRequest {
  expression: string;
  run_id: string | null;
  sample_input: string | null;
}

/** Rendered expression + which context slots the resolving run actually had.
 *  An all-empty `context_available` means there was no run data to bind to. */
export interface ExpressionPreviewResult {
  rendered: string | null;
  error: string | null;
  run_id: string | null;
  context_available: { input: boolean; last_output: boolean; steps: string[] };
}

// ---- Knowledge base (RAG) contracts ----

/** One row in knowledge_documents — the retrievable unit. Rows produced by a
 *  file upload carry source and chunk provenance; manually added docs leave
 *  them null. */
export interface KnowledgeDocument {
  id: string;
  workflow_id: string;
  title?: string;
  text: string;
  has_embedding?: boolean;
  source_name?: string | null;
  source_mime?: string | null;
  source_document_id?: string | null;
  chunk_index?: number | null;
  chunk_start?: number | null;
  chunk_end?: number | null;
  created_at: string;
  updated_at: string;
}

/** Response of POST /knowledge/upload — one source file chunked into N rows.
 *  `document_id` is the shared source_document_id of the created chunks. */
export interface KnowledgeUploadResponse {
  document_id: string;
  chunks_created: number;
  chunk_size: number;
  overlap: number;
  filename: string;
  mime: string;
}

/** Handle returned by `api.streamRun`: close the stream or read the durable
 *  last-event seq for a reconnect that resumes rather than replays from 0. */
export interface RunStreamHandle {
  close: () => void;
  getLastEventId: () => string | null;
}

/** Terminal run-event types; a clean close without one strands the run. */
const STREAM_TERMINAL_EVENTS: Record<string, true> = {
  run_completed: true,
  run_failed: true,
  run_cancelled: true,
};

export const api = {
  listWorkflows: () => request<WorkflowListItem[]>("/api/workflows"),
  createWorkflow: (payload: { name: string; description?: string; graph_json: WorkflowGraph }) =>
    request<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(payload) }),
  getWorkflow: (id: string) => request<Workflow>(`/api/workflows/${id}`),
  getWorkflowMemory: (workflowId: string) =>
    request<{
      workflow_id: string;
      entries: Array<{ namespace: string; key: string; value: string; updated_at?: string }>;
      namespaces: Record<string, Record<string, string>>;
    }>(`/api/workflows/${workflowId}/memory`),
  clearWorkflowMemory: (workflowId: string, namespace?: string) =>
    request<{ status: string; deleted: number }>(
      `/api/workflows/${workflowId}/memory${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ""}`,
      { method: "DELETE" }
    ),
  listKnowledge: (workflowId: string) =>
    request<KnowledgeDocument[]>(`/api/workflows/${workflowId}/knowledge`),
  createKnowledge: (workflowId: string, payload: { title?: string; text: string }) =>
    request(`/api/workflows/${workflowId}/knowledge`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadKnowledgeDocument: (workflowId: string, file: File, title?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title?.trim()) {
      form.append("title", title.trim());
    }
    return request<KnowledgeUploadResponse>(`/api/workflows/${workflowId}/knowledge/upload`, {
      method: "POST",
      body: form,
    });
  },
  bulkImportKnowledge: (
    workflowId: string,
    documents: Array<{ title?: string; text: string }>
  ) =>
    request<{ status: string; job_id: string; document_count: number; workflow_id: string }>(
      `/api/workflows/${workflowId}/knowledge/bulk`,
      {
        method: "POST",
        body: JSON.stringify({ documents }),
      }
    ),
  reindexKnowledge: (workflowId: string) =>
    request<{ status: string; job_id: string; count: number; workflow_id: string }>(
      `/api/workflows/${workflowId}/knowledge/reindex`,
      {
        method: "POST",
      }
    ),
  getJob: (jobId: string) =>
    request<{
      id: string;
      job_type: string;
      status: string;
      workflow_id: string | null;
      result: Record<string, unknown> | null;
      error: string | null;
      payload: Record<string, unknown> | null;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    }>(`/api/jobs/${jobId}`),
  deleteKnowledge: (workflowId: string, documentId: string) =>
    request(`/api/workflows/${workflowId}/knowledge/${documentId}`, { method: "DELETE" }),
  listKnowledgeBases: () => request<KnowledgeBase[]>("/api/knowledge"),
  createKnowledgeBase: (payload: {
    name: string;
    description?: string;
    settings?: Partial<KnowledgeSettings>;
  }) =>
    request<KnowledgeBase>("/api/knowledge", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateKnowledgeBase: (
    id: string,
    payload: { name?: string; description?: string | null; settings?: Partial<KnowledgeSettings> }
  ) =>
    request<KnowledgeBase>(`/api/knowledge/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteKnowledgeBase: (id: string) =>
    request<void>(`/api/knowledge/${id}`, { method: "DELETE" }),
  listKnowledgeSources: (id: string) =>
    request<KnowledgeSource[]>(`/api/knowledge/${id}/documents`),
  addKnowledgeText: (
    id: string,
    payload: { title?: string; text: string; tags?: string[] }
  ) =>
    request<KnowledgeIngestResult>(`/api/knowledge/${id}/documents`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadKnowledgeBaseDocument: (id: string, file: File, title?: string, tags?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title?.trim()) form.append("title", title.trim());
    if (tags?.trim()) form.append("tags", tags.trim());
    return request<KnowledgeIngestResult>(`/api/knowledge/${id}/documents/upload`, {
      method: "POST",
      body: form,
    });
  },
  addKnowledgeUrl: (id: string, payload: { url: string; title?: string; tags?: string[] }) =>
    request<KnowledgeIngestResult>(`/api/knowledge/${id}/documents/url`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteKnowledgeSource: (id: string, sourceId: string) =>
    request<{ deleted_chunks: number }>(`/api/knowledge/${id}/documents/${sourceId}`, {
      method: "DELETE",
    }),
  reindexKnowledgeBase: (id: string) =>
    request<{ reindexed: number }>(`/api/knowledge/${id}/reindex`, { method: "POST" }),
  queryKnowledgeBase: (
    id: string,
    payload: {
      query: string;
      settings?: Partial<KnowledgeSettings>;
      tags?: string[];
      top_k?: number;
      method?: string;
    }
  ) =>
    request<KnowledgeQueryResult>(`/api/knowledge/${id}/query`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  duplicateWorkflow: (id: string) =>
    request<Workflow>(`/api/workflows/${id}/duplicate`, { method: "POST" }),
  deleteWorkflow: (id: string) =>
    request<void>(`/api/workflows/${id}`, { method: "DELETE" }),
  getTracingConfig: () =>
    request<{ enabled: boolean; ui_base_url: string | null }>("/api/meta/tracing"),
  saveVersion: (
    workflowId: string,
    payload: { graph_json: WorkflowGraph; save_as_new_version?: boolean }
  ) =>
    request<WorkflowVersion>(`/api/workflows/${workflowId}/versions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listVersions: (workflowId: string) =>
    request<WorkflowVersionListItem[]>(`/api/workflows/${workflowId}/versions`),
  getVersion: (workflowId: string, versionId: string) =>
    request<WorkflowVersion>(`/api/workflows/${workflowId}/versions/${versionId}`),
  getEvalHistory: (workflowId: string) =>
    request<EvalHistoryEntry[]>(`/api/workflows/${workflowId}/eval-history`),
  getWorkflowQuality: (workflowId: string) =>
    request<{
      workflow_id: string;
      workflow_name: string;
      eval_run_count: number;
      eval_pass_count: number;
      eval_fail_count: number;
      eval_pass_rate: number | null;
      avg_dimension_scores: Record<string, number>;
      eval_trend: Array<{
        run_id: string;
        created_at: string;
        aggregate: number;
        passed?: boolean | null;
      }>;
      guardrail_stats: {
        passed: number;
        warned: number;
        failed: number;
        blocked_runs: number;
        total_events: number;
      };
      graph_config: {
        eval_node_count: number;
        guardrail_node_count: number;
        has_quality_nodes: boolean;
        eval_nodes: Array<{
          node_id: string;
          label: string;
          preset?: string;
          threshold?: number;
        }>;
        guardrail_nodes: Array<{
          node_id: string;
          label: string;
          mode?: string;
          fail_behavior?: string;
        }>;
      };
      eval_regression: {
        detected: boolean;
        latest_run_id?: string;
        latest_score?: number;
        baseline_score?: number;
        delta?: number;
        message?: string;
      } | null;
      recent_guardrail_events: Array<{
        node_id: string;
        node_label?: string;
        status: string;
        message?: string;
        run_id?: string;
        created_at?: string;
      }>;
      recent_runs: Array<{
        run_id: string;
        status: string;
        eval_aggregate?: number | null;
        eval_passed?: boolean | null;
        guardrail_blocked?: boolean;
      }>;
    }>(`/api/workflows/${workflowId}/quality`),
  previewGuardrail: (text: string, rules: Record<string, unknown>) =>
    request<{ passed: boolean; message: string; severity: string; would_block: boolean }>(
      "/api/meta/guardrail-preview",
      { method: "POST", body: JSON.stringify({ text, rules }) }
    ),
  compareRuns: (workflowId: string, runA: string, runB: string) =>
    request<RunCompareResponse>(
      `/api/workflows/${workflowId}/compare-runs?run_a=${runA}&run_b=${runB}`
    ),
  // Canvas data loop: run a single node against test input (authoring-only
  // step-run) and preview a {{ }} expression against a run's context.
  testNode: (workflowId: string, body: NodeTestRequest) =>
    request<NodeTestResult>(`/api/workflows/${workflowId}/node-test`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  previewExpression: (workflowId: string, body: ExpressionPreviewRequest) =>
    request<ExpressionPreviewResult>(`/api/workflows/${workflowId}/expression-preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateWorkflow: (id: string, payload: { name?: string; description?: string; webhook_url?: string }) =>
    request<Workflow>(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getObservabilitySummary: () =>
    request<{
      workflow_count: number;
      run_count: number;
      status_counts: Record<string, number>;
      avg_eval_score: number | null;
      avg_latency_ms: number | null;
      knowledge_doc_count: number;
      memory_entry_count: number;
      scheduled_workflow_count: number;
      scheduled_workflows: Array<{
        schedule_id: string | null;
        workflow_id: string;
        workflow_name: string;
        cron: string;
        cron_valid: boolean;
        next_run_at: string | null;
        next_runs: string[];
        last_fired_at: string | null;
      }>;
      active_runs: number;
      max_concurrent_runs: number;
      scheduler: { enabled: boolean; running: boolean; poll_seconds: number };
      tracing?: {
        enabled: boolean;
        ui_base_url: string | null;
      };
      quality: {
        eval_run_count: number;
        eval_pass_count: number;
        eval_fail_count: number;
        eval_pass_rate: number | null;
        avg_dimension_scores: Record<string, number>;
        eval_trend: Array<{
          run_id: string;
          workflow_id?: string | null;
          workflow_name?: string | null;
          created_at: string;
          aggregate: number;
          passed?: boolean | null;
        }>;
        workflow_eval_leaderboard: Array<{
          workflow_id: string;
          workflow_name: string;
          run_count: number;
          avg_eval_score: number;
        }>;
        guardrail_stats: {
          passed: number;
          warned: number;
          failed: number;
          blocked_runs: number;
          total_events: number;
        };
      };
      recent_runs: Array<{
        run_id: string;
        workflow_id?: string | null;
        workflow_name?: string | null;
        status: string;
        created_at: string;
        eval_aggregate?: number | null;
        eval_passed?: boolean | null;
        latency_ms?: number | null;
        guardrail_blocked?: boolean;
        guardrail_warn_count?: number;
        guardrail_fail_count?: number;
        trace_id?: string | null;
      }>;
    }>("/api/observability/summary"),
  listScheduledWorkflows: () =>
    request<
      Array<{
        schedule_id: string | null;
        workflow_id: string;
        workflow_name: string;
        cron: string;
        cron_valid: boolean;
        next_run_at: string | null;
        next_runs: string[];
        last_fired_at: string | null;
      }>
    >("/api/workflows/schedules"),
  getWorkflowSchedule: (workflowId: string) =>
    request<
      Array<{
        schedule_id: string | null;
        workflow_id: string;
        workflow_name: string;
        cron: string;
        cron_valid: boolean;
        next_run_at: string | null;
        next_runs: string[];
        last_fired_at: string | null;
      }>
    >(`/api/workflows/${workflowId}/schedule`),
  previewCron: (expr: string, count = 3) =>
    request<{ expr: string; next_runs: string[] }>(
      `/api/meta/cron-preview?expr=${encodeURIComponent(expr)}&count=${count}`
    ),
  exportWorkflow: async (workflowId: string) => {
    const response = await fetch(`${API_BASE}/api/workflows/${workflowId}/export`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error("Export failed");
    return response.blob();
  },
  importWorkflow: (
    payload: Record<string, unknown>,
    options?: { nameSuffix?: string }
  ) => {
    const query = options?.nameSuffix
      ? `?name_suffix=${encodeURIComponent(options.nameSuffix)}`
      : "";
    return request<Workflow>(`/api/workflows/import${query}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  importWorkflowGraph: (
    workflowId: string,
    payload: Record<string, unknown> & { save_as_new_version?: boolean }
  ) =>
    request<WorkflowVersion>(`/api/workflows/${workflowId}/import`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  exportRun: async (runId: string) => {
    const response = await fetch(`${API_BASE}/api/runs/${runId}/export`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error("Export failed");
    return response.blob();
  },
  listTemplates: () => request<WorkflowTemplate[]>("/api/templates"),
  createTemplate: (payload: { name: string; description?: string; workflow_id: string }) =>
    request<WorkflowTemplate>("/api/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  useTemplate: (templateId: string) =>
    request<{ id: string; name: string; graph_json: WorkflowGraph; usage_count: number }>(
      `/api/templates/${templateId}/use`,
      { method: "POST" }
    ),
  listCredentials: () => request<Credential[]>("/api/credentials"),
  listModels: () => request<{ providers: ModelCatalogEntry[] }>("/api/meta/models"),
  createCredential: (payload: { name: string; type: CredentialType; config: Record<string, unknown> }) =>
    request<Credential>("/api/credentials", { method: "POST", body: JSON.stringify(payload) }),
  deleteCredential: (id: string) =>
    request<{ status: string }>(`/api/credentials/${id}`, { method: "DELETE" }),
  getMCPCredentialTools: (id: string) =>
    request<MCPToolsResponse>(`/api/credentials/${id}/mcp/tools`),
  discoverMCPCredential: (id: string) =>
    request<MCPToolsResponse>(`/api/credentials/${id}/mcp/discover`, { method: "POST" }),
  listEvalPresets: () => request<EvalPreset[]>("/api/eval-presets"),
  createEvalPreset: (payload: {
    name: string;
    label: string;
    criteria: string;
    instruction?: string;
    score_weights?: Record<string, number>;
    eval_type?: string;
  }) =>
    request<EvalPreset>("/api/eval-presets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEvalPreset: (
    id: string,
    payload: {
      label?: string;
      criteria?: string;
      instruction?: string | null;
      score_weights?: Record<string, number>;
    }
  ) =>
    request<EvalPreset>(`/api/eval-presets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  previewEvalPreset: (payload: {
    input_text?: string;
    output_text: string;
    criteria?: string;
    instruction?: string;
    score_weights?: Record<string, number>;
  }) =>
    request<EvalPreview>("/api/eval-presets/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  previewRag: (payload: { question?: string; context?: string; answer: string }) =>
    request<RagPreview>("/api/eval-presets/rag-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteEvalPreset: (id: string) =>
    request<{ status: string }>(`/api/eval-presets/${id}`, { method: "DELETE" }),
  listRuns: (filters?: {
    status?: string;
    eval_passed?: boolean;
    guardrail_blocked?: boolean;
    has_eval?: boolean;
    session_id?: string;
    tag?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.eval_passed !== undefined) params.set("eval_passed", String(filters.eval_passed));
    if (filters?.guardrail_blocked !== undefined) {
      params.set("guardrail_blocked", String(filters.guardrail_blocked));
    }
    if (filters?.has_eval !== undefined) params.set("has_eval", String(filters.has_eval));
    if (filters?.session_id) params.set("session_id", filters.session_id);
    if (filters?.tag) params.set("tag", filters.tag);
    if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters?.offset !== undefined) params.set("offset", String(filters.offset));
    const query = params.toString();
    return request<RunListItem[]>(`/api/runs${query ? `?${query}` : ""}`);
  },
  getRunSessions: () =>
    request<{ sessions: RunSession[] }>("/api/runs/sessions"),
  createRun: (payload: {
    workflow_id: string;
    version_id?: string;
    input_text: string;
    // Authoring-only (pin output / run-from-here); never honored on /v1 invoke.
    pinned_outputs?: Record<string, unknown>;
    start_node_id?: string;
  }) => request<WorkflowRun>("/api/runs", { method: "POST", body: JSON.stringify(payload) }),
  getRun: (id: string, init?: RequestInit) => request<WorkflowRun>(`/api/runs/${id}`, init),
  getRunLlmCalls: (id: string) => request<LlmCall[]>(`/api/runs/${id}/llm-calls`),
  // Datasets & experiments
  listDatasets: (workflowId: string) =>
    request<DatasetSummary[]>(`/api/datasets?workflow_id=${workflowId}`),
  createDataset: (workflowId: string, name: string) =>
    request<DatasetSummary>("/api/datasets", {
      method: "POST",
      body: JSON.stringify({ workflow_id: workflowId, name }),
    }),
  getDataset: (id: string) => request<DatasetDetail>(`/api/datasets/${id}`),
  importDatasetCsv: (id: string, csvText: string) =>
    request<{ imported: number }>(`/api/datasets/${id}/import-csv`, {
      method: "POST", body: JSON.stringify({ csv_text: csvText }),
    }),
  addDatasetItem: (id: string, item: { input_text: string; expected_output?: string }) =>
    request<{ id: string }>(`/api/datasets/${id}/items`, {
      method: "POST",
      body: JSON.stringify(item),
    }),
  importDatasetItems: (
    id: string,
    items: { input_text: string; expected_output?: string | null; tags?: Record<string, unknown> }[]
  ) =>
    request<{ imported: number }>(`/api/datasets/${id}/import`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  addRunToDataset: (datasetId: string, runId: string) =>
    request<DatasetCopyResult>(`/api/datasets/${datasetId}/add-run/${runId}`, { method: "POST" }),
  captureRunsToDataset: (
    datasetId: string,
    payload: { filter: "recent" | "failed" | "low_eval" | "cluster"; limit?: number; max_eval?: number; run_ids?: string[]; cluster_signature?: string }
  ) =>
    request<{ added: number; skipped: number; filter: string }>(
      `/api/datasets/${datasetId}/capture`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  listExperiments: (workflowId: string) =>
    request<Experiment[]>(`/api/experiments?workflow_id=${workflowId}`),
  createExperiment: (payload: {
    workflow_id: string;
    dataset_id: string;
    version_id: string;
    kind: "batch" | "regression";
    baseline_version_id?: string;
    // Multi-model matrix: run the version once per pair and return a
    // per-model comparison (summary.matrix).
    models?: Array<{ provider: string; model: string; api_base?: string }>;
  }) =>
    request<Experiment>("/api/experiments", { method: "POST", body: JSON.stringify(payload) }),
  getExperiment: (id: string) => request<Experiment>(`/api/experiments/${id}`),
  // CI regression gate: minimal verdict contract for pipelines + in-app status.
  getExperimentGate: (id: string) =>
    request<ExperimentGate>(`/api/experiments/${id}/gate`),
  // Feedback
  submitFeedback: (payload: { run_id: string; rating: 1 | -1; comment?: string; dataset_id?: string }) =>
    request<FeedbackResult>("/api/feedback", { method: "POST", body: JSON.stringify(payload) }),
  listRunFeedback: (runId: string) =>
    request<RunFeedback[]>(`/api/feedback/run/${runId}`),
  // Annotation queue — runs staged for human labels before joining a dataset.
  listAnnotationQueue: (filters: AnnotationFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return request<AnnotationQueueResult>(`/api/annotation/queue${qs ? `?${qs}` : ""}`);
  },
  enqueueAnnotation: (
    payload: { run_id: string; priority?: number; assignee?: string } | AnnotationEnqueueBulkPayload
  ) =>
    request<AnnotationEnqueueResult | AnnotationEnqueueBulkResult>("/api/annotation/enqueue", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  labelAnnotation: (
    taskId: string,
    payload: {
      expected_output?: string;
      notes?: string;
      rating?: number;
      category?: string;
      dataset_id?: string;
    }
  ) =>
    request<AnnotationLabelResult>(`/api/annotation/${taskId}/label`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  skipAnnotation: (taskId: string) =>
    request<{ task: AnnotationTask }>(`/api/annotation/${taskId}/skip`, { method: "POST" }),
  // Operations
  getObservabilityCosts: () => request<ObservabilityCosts>("/api/observability/costs"),
  getObservabilityTrust: () => request<TrustSummary>("/api/observability/trust"),
  getGuardrailViolations: () =>
    request<GuardrailViolations>("/api/observability/violations"),
  searchObservabilityRuns: (search: string, limit = 50) =>
    request<{ recent_runs: Array<Record<string, unknown>> }>(
      `/api/observability/runs?search=${encodeURIComponent(search)}&limit=${limit}`
    ),
  listObservabilityRuns: (limit = 100) =>
    request<{ recent_runs: Array<Record<string, unknown>> }>(
      `/api/observability/runs?limit=${limit}`
    ),
  getObservabilityErrors: () => request<ObservabilityErrors>("/api/observability/errors"),
  /** Cross-run span/LLM-call search — filters serialize to query params. */
  searchObservabilitySpans: (filters: TraceSearchFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return request<TraceSearchResult>(
      `/api/observability/spans${qs ? `?${qs}` : ""}`
    );
  },
  listAlertRules: () => request<AlertRule[]>("/api/alerts"),
  createAlertRule: (payload: Omit<AlertRule, "id" | "last_fired_at">) =>
    request<AlertRule>("/api/alerts", { method: "POST", body: JSON.stringify(payload) }),
  updateAlertRule: (
    ruleId: string,
    payload: Partial<Omit<AlertRule, "id" | "last_fired_at">>
  ) =>
    request<AlertRule>(`/api/alerts/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAlertRule: (id: string) => request<void>(`/api/alerts/${id}`, { method: "DELETE" }),
  listAlertEvents: (limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined && offset > 0) params.set("offset", String(offset));
    const qs = params.toString();
    return request<AlertEvent[]>(`/api/alerts/events${qs ? `?${qs}` : ""}`);
  },
  // Guardrail policies (reusable rule bundles)
  listGuardrailPolicies: () =>
    request<GuardrailPolicy[]>("/api/guardrail-policies"),
  getGuardrailPolicyTemplates: () =>
    request<GuardrailPolicyTemplate[]>("/api/guardrail-policies/templates"),
  createGuardrailPolicy: (payload: GuardrailPolicyCreate) =>
    request<GuardrailPolicy>("/api/guardrail-policies", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateGuardrailPolicy: (policyId: string, payload: GuardrailPolicyUpdate) =>
    request<GuardrailPolicy>(`/api/guardrail-policies/${policyId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteGuardrailPolicy: (policyId: string) =>
    request<void>(`/api/guardrail-policies/${policyId}`, { method: "DELETE" }),
  // AI assist
  generateWorkflow: (payload: { description: string }) =>
    request<{ graph: WorkflowGraph; notes: string[] }>("/api/assist/generate-workflow", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  suggestNodes: (payload: {
    workflow_id?: string;
    graph: { nodes: unknown[]; edges: unknown[] };
    selected_node_id?: string;
    history?: AssistHistoryTurn[];
  }) =>
    request<{ suggestions: NodeSuggestion[] }>("/api/assist/suggest-nodes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  explainRun: (runId: string) =>
    request<{
      explanation_md: string;
      suggested_fixes: { title: string; detail: string }[];
    }>("/api/assist/explain-run", {
      method: "POST",
      body: JSON.stringify({ run_id: runId }),
    }),
  editGraph: (payload: {
    workflow_id?: string;
    graph: WorkflowGraph;
    instruction: string;
    history?: AssistHistoryTurn[];
  }) =>
    request<EditGraphResponse>("/api/assist/edit-graph", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  compareVariants: (payload: {
    node_type: string;
    base_config: Record<string, unknown>;
    variants: { label: string; config_overrides: Record<string, unknown> }[];
    input_text: string;
  }) =>
    request<{ results: CompareVariantResult[] }>("/api/assist/compare", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  generateSchema: (payload: { description: string; kind?: "json_schema" | "regex" }) =>
    request<GenerateSchemaResponse>("/api/assist/generate-schema", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  draftEvalSuite: (payload: { workflow_id: string; graph?: { nodes: unknown[]; edges: unknown[] } }) =>
    request<DraftEvalSuiteResponse>("/api/assist/draft-eval-suite", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  publishVersion: (workflowId: string, versionId: string) =>
    request<{ published_version_id: string; published_version_number: number }>(
      `/api/workflows/${workflowId}/publish`,
      { method: "POST", body: JSON.stringify({ version_id: versionId }) }
    ),
  getOpsConfig: () => request<OpsConfig>("/api/meta/ops-config"),
  updateOnlineEvalSampleRate: (rate: number) =>
    request<OpsConfig>("/api/meta/ops-config", {
      method: "PATCH",
      body: JSON.stringify({ online_eval_sample_rate: rate }),
    }),
  getPublished: (workflowId: string) =>
    request<{ published_version_id: string | null; published_version_number: number | null }>(
      `/api/workflows/${workflowId}/published`
    ),
  cancelRun: (id: string) =>
    request<{ status: string; run_id: string }>(`/api/runs/${id}`, { method: "DELETE" }),
  approveRun: (id: string, payload: { approval_id: string; approved: boolean; comment?: string }) =>
    request<{ status: string; run_id: string; approved: boolean }>(`/api/runs/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  streamRun: (
    runId: string,
    onEvent: (event: Record<string, unknown>) => void,
    onError?: (error: Event) => void,
    options?: { initialAfterSeq?: string | null }
  ): RunStreamHandle => {
    let manuallyClosed = false;
    let terminalReceived = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    // #27: expose the durable seq so an outer streamEpoch remount can resume
    // where this connection left off instead of replaying from seq 0.
    let lastEventId: string | null = options?.initialAfterSeq ?? null;
    const abortController = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const parseChunk = (chunk: string) => {
      // SSE frames may carry id:/event:/retry: lines before data:. Track the
      // last event id so a reconnect can replay from the durable run_events
      // log instead of jumping to the live edge and losing in-flight events.
      for (const line of chunk.split("\n")) {
        if (line.startsWith("id: ")) {
          lastEventId = line.slice(4).trim() || null;
          continue;
        }
        if (!line.startsWith("data: ")) continue;
        reconnectAttempts = 0;
        try {
          const event = JSON.parse(line.slice(6));
          if (event && STREAM_TERMINAL_EVENTS[String(event.type)]) {
            terminalReceived = true;
          }
          onEvent(event);
        } catch {
          // ignore malformed events
        }
      }
    };

    const connect = async () => {
      if (manuallyClosed) return;
      try {
        const response = await fetch(
          `/api/runs/${runId}/stream${lastEventId ? `?after_seq=${encodeURIComponent(lastEventId)}` : ""}`,
          {
            headers: authHeaders(),
            signal: abortController.signal,
            cache: "no-store",
          }
        );
        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!manuallyClosed) {
          const { done, value } = await reader.read();
          if (done) {
            // Clean upstream close without a terminal run event means the
            // run is stranded — surface it instead of silently succeeding.
            if (!manuallyClosed && !terminalReceived) {
              onError?.(new Event("error"));
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            parseChunk(part);
          }
        }
      } catch (error) {
        if (manuallyClosed) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        reconnectAttempts += 1;
        if (reconnectAttempts >= maxReconnectAttempts) {
          onError?.(new Event("error"));
          return;
        }
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 1000 * reconnectAttempts);
      }
    };

    void connect();

    return {
      close: () => {
        manuallyClosed = true;
        clearTimeout(reconnectTimer ?? undefined);
        abortController.abort();
      },
      getLastEventId: () => lastEventId,
    };
  },
  streamObservability: (
    onEvent: (event: Record<string, unknown>) => void,
    onError?: (error: Event) => void,
    onOpen?: () => void
  ): { close: () => void } => {
    let manuallyClosed = false;
    const abortController = new AbortController();

    const parseChunk = (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {
          // ignore malformed events
        }
      }
    };

    const connect = async () => {
      if (manuallyClosed) return;
      try {
        const response = await fetch("/api/observability/stream", {
          headers: authHeaders(),
          signal: abortController.signal,
          cache: "no-store",
        });
        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }
        if (!manuallyClosed) onOpen?.();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!manuallyClosed) {
          const { done, value } = await reader.read();
          if (done) {
            if (!manuallyClosed) {
              onError?.(new Event("error"));
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            parseChunk(part);
          }
        }
      } catch (error) {
        if (manuallyClosed) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError?.(new Event("error"));
      }
    };

    void connect();

    return {
      close: () => {
        manuallyClosed = true;
        abortController.abort();
      },
    };
  },
  // MVP 2 read endpoints: span waterfall / canvas run-replay, deploy sheet,
  // and the observability command-center dashboards.
  getRunTimeline: (runId: string) => request<RunTimeline>(`/api/runs/${runId}/timeline`),
  // Trust layer: nested execution trace tree (node → llm_call / tool_call).
  getRunTrace: (runId: string) => request<RunTrace>(`/api/runs/${runId}/trace`),
  getDeployDescriptor: (workflowId: string) =>
    request<DeployDescriptor>(`/api/workflows/${workflowId}/deploy`),
  issueDeploymentCredential: (workflowId: string, kind: DeploymentCredentialKind) =>
    request<DeploymentCredential>(`/api/workflows/${workflowId}/deploy/credentials/${kind}`, {
      method: "POST",
    }),
  revokeDeploymentCredential: (workflowId: string, kind: DeploymentCredentialKind) =>
    request<DeploymentCredentialStatus>(`/api/workflows/${workflowId}/deploy/credentials/${kind}`, {
      method: "DELETE",
    }),
  issueChatToken: (workflowId: string) =>
    api.issueDeploymentCredential(workflowId, "chat_token"),
  revokeChatToken: (workflowId: string) =>
    api.revokeDeploymentCredential(workflowId, "chat_token"),
  getObservabilityDashboards: (filters?: ObservabilityDashboardFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.workflow_id) params.set("workflow_id", filters.workflow_id);
    if (filters?.start_date) params.set("start_date", filters.start_date);
    if (filters?.end_date) params.set("end_date", filters.end_date);
    const query = params.toString();
    return request<ObservabilityDashboards>(
      `/api/observability/dashboards${query ? `?${query}` : ""}`
    );
  },
  // ---- Prompt registry + playground (Phase 5) ----
  listPrompts: () => request<PromptSummary[]>("/api/prompts"),
  createPrompt: (payload: {
    name: string;
    description?: string;
    template: string;
    notes?: string;
  }) =>
    request<PromptDetail>("/api/prompts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPrompt: (id: string) => request<PromptDetail>(`/api/prompts/${id}`),
  updatePrompt: (id: string, payload: { name?: string; description?: string | null }) =>
    request<PromptDetail>(`/api/prompts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePrompt: (id: string) => request<void>(`/api/prompts/${id}`, { method: "DELETE" }),
  listPromptVersions: (id: string) =>
    request<PromptVersion[]>(`/api/prompts/${id}/versions`),
  createPromptVersion: (id: string, payload: { template: string; notes?: string }) =>
    request<PromptVersion>(`/api/prompts/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  rollbackPromptVersion: (id: string, version: number) =>
    request<PromptDetail>(`/api/prompts/${id}/versions/${version}/rollback`, {
      method: "POST",
    }),
  runPlayground: (payload: PlaygroundRunRequest) =>
    request<PlaygroundRunResponse>("/api/playground/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listPlaygroundRuns: (limit = 20) =>
    request<PlaygroundRunSummary[]>(`/api/playground/runs?limit=${limit}`),
  getTraceInsights: () => request<TraceInsights>("/api/observability/insights"),
  queueInsight: (signature: string) =>
    request<{ queued: number; already: number }>("/api/observability/insights/queue", {
      method: "POST",
      body: JSON.stringify({ signature }),
    }),
};
// ---- Prompt registry + playground contracts (Phase 5) ----

export interface PromptVersion {
  version: number;
  template: string;
  variables: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface PromptSummary {
  id: string;
  name: string;
  description: string | null;
  current_version: number;
  version_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface PromptDetail extends PromptSummary {
  versions: PromptVersion[];
}

export interface PlaygroundModelTarget {
  provider: string;
  model: string;
  api_base?: string | null;
  credential_id?: string | null;
  credential_name?: string | null;
}

export interface PlaygroundRunRequest {
  prompt_id?: string;
  version?: number;
  template?: string;
  variables?: Record<string, string>;
  models: PlaygroundModelTarget[];
}

export interface PlaygroundVariantResult {
  provider: string;
  model: string;
  output: string | null;
  error: string | null;
  latency_ms: number | null;
}

export interface PlaygroundRunResponse {
  id?: string | null;
  rendered_template: string;
  prompt_id: string | null;
  prompt_version: number | null;
  results: PlaygroundVariantResult[];
  created_at?: string | null;
}

export interface PlaygroundRunSummary {
  id: string;
  prompt_id: string | null;
  prompt_version: number | null;
  rendered_template: string;
  created_at: string | null;
  results: PlaygroundVariantResult[];
}

export interface KnowledgeSettings {
  chunk_strategy: "sentence" | "paragraph" | "fixed";
  chunk_size: number;
  chunk_overlap: number;
  retrieval_method: "keyword" | "bm25" | "tfidf" | "embedding" | "hybrid";
  rrf_k: number;
  reranker: "none" | "llm";
  rerank_candidates: number;
  top_k: number;
  min_score: number | null;
  query_rewrite: "none" | "llm";
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  settings: KnowledgeSettings;
  chunk_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface KnowledgeSource {
  source_document_id: string;
  title: string | null;
  source_name: string | null;
  source_mime: string | null;
  source_url: string | null;
  tags: string[];
  chunk_count: number;
  created_at: string | null;
}

export interface KnowledgeIngestResult {
  source_document_id: string;
  chunks_created: number;
  title?: string | null;
  tags?: string[];
  source_url?: string | null;
}

export interface KnowledgeQueryHit {
  id?: string;
  title?: string | null;
  text?: string;
  score?: number | null;
  source_name?: string | null;
  source_url?: string | null;
  chunk_index?: number | null;
  char_start?: number | null;
  char_end?: number | null;
  tags?: string[];
}

export interface KnowledgeQueryResult {
  query: string;
  method: string;
  settings: KnowledgeSettings;
  rewrite: { requested: string; applied: boolean; reason?: string };
  rerank: { requested: string; applied: boolean; reason?: string };
  results: KnowledgeQueryHit[];
  citations: KnowledgeQueryHit[];
}

export interface TraceInsightPattern {
  signature: string;
  preview: string;
  count: number;
  reason: string;
  sample_run_id: string;
  members: Array<{ run_id: string; workflow_id: string; workflow_name: string }>;
}

export interface TraceInsights {
  patterns: TraceInsightPattern[];
  matched_runs: number;
}
