import { authHeaders } from "@/lib/auth";
import type {
  AlertEvent,
  AlertRule,
  DatasetDetail,
  DatasetSummary,
  Experiment,
  LlmCall,
  ObservabilityCosts,
  ObservabilityErrors,
  RunFeedback,
  EvalHistoryEntry,
  EvalPreset,
  RunCompareResponse,
  RunListItem,
  Workflow,
  WorkflowGraph,
  WorkflowListItem,
  WorkflowRun,
  Credential,
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

export interface GuardrailPolicyUpdate {
  name?: string | null;
  description?: string | null;
  rules_json?: Record<string, unknown> | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
        }
      } catch {
        // not JSON — keep the raw text
      }
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }

  // 204 No Content (and other empty bodies) have nothing to parse.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

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
    request<
      Array<{
        id: string;
        workflow_id: string;
        title?: string;
        text: string;
        has_embedding?: boolean;
        created_at: string;
        updated_at: string;
      }>
    >(`/api/workflows/${workflowId}/knowledge`),
  createKnowledge: (workflowId: string, payload: { title?: string; text: string }) =>
    request(`/api/workflows/${workflowId}/knowledge`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
      created_at: string;
      completed_at: string | null;
    }>(`/api/jobs/${jobId}`),
  deleteKnowledge: (workflowId: string, documentId: string) =>
    request(`/api/workflows/${workflowId}/knowledge/${documentId}`, { method: "DELETE" }),
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
  getEvalSnippets: (limit = 3) =>
    request<{ snippets: Record<string, EvalHistoryEntry[]> }>(
      `/api/workflows/eval-snippets?limit=${limit}&per_workflow=3`
    ),
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
    request<{
      workflow_id: string;
      workflow_name: string;
      cron: string;
      cron_valid: boolean;
      next_run_at: string | null;
      next_runs: string[];
      last_fired_at: string | null;
    }>(`/api/workflows/${workflowId}/schedule`),
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
  listCredentials: () => request<Credential[]>("/api/credentials"),
  createCredential: (payload: { name: string; type: string; config: Record<string, string> }) =>
    request<Credential>("/api/credentials", { method: "POST", body: JSON.stringify(payload) }),
  deleteCredential: (id: string) =>
    request<{ status: string }>(`/api/credentials/${id}`, { method: "DELETE" }),
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
  deleteEvalPreset: (id: string) =>
    request<{ status: string }>(`/api/eval-presets/${id}`, { method: "DELETE" }),
  listRuns: (filters?: {
    status?: string;
    eval_passed?: boolean;
    guardrail_blocked?: boolean;
    has_eval?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.eval_passed !== undefined) params.set("eval_passed", String(filters.eval_passed));
    if (filters?.guardrail_blocked !== undefined) {
      params.set("guardrail_blocked", String(filters.guardrail_blocked));
    }
    if (filters?.has_eval !== undefined) params.set("has_eval", String(filters.has_eval));
    const query = params.toString();
    return request<RunListItem[]>(`/api/runs${query ? `?${query}` : ""}`);
  },
  createRun: (payload: { workflow_id: string; version_id?: string; input_text: string }) =>
    request<WorkflowRun>("/api/runs", { method: "POST", body: JSON.stringify(payload) }),
  triggerWorkflow: (
    workflowId: string,
    payload?: { input?: Record<string, unknown> | string }
  ) =>
    request<WorkflowRun>(`/api/workflows/${workflowId}/trigger`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),
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
  addDatasetItem: (id: string, item: { input_text: string; expected_output?: string }) =>
    request<{ id: string }>(`/api/datasets/${id}/items`, {
      method: "POST",
      body: JSON.stringify(item),
    }),
  addRunToDataset: (datasetId: string, runId: string) =>
    request<{ id: string }>(`/api/datasets/${datasetId}/add-run/${runId}`, { method: "POST" }),
  listExperiments: (workflowId: string) =>
    request<Experiment[]>(`/api/experiments?workflow_id=${workflowId}`),
  createExperiment: (payload: {
    workflow_id: string;
    dataset_id: string;
    version_id: string;
    kind: "batch" | "regression";
    baseline_version_id?: string;
  }) =>
    request<Experiment>("/api/experiments", { method: "POST", body: JSON.stringify(payload) }),
  getExperiment: (id: string) => request<Experiment>(`/api/experiments/${id}`),
  // Feedback
  submitFeedback: (payload: { run_id: string; rating: 1 | -1; comment?: string }) =>
    request<{ id: string }>("/api/feedback", { method: "POST", body: JSON.stringify(payload) }),
  listRunFeedback: (runId: string) =>
    request<RunFeedback[]>(`/api/feedback/run/${runId}`),
  // Operations
  getObservabilityCosts: () => request<ObservabilityCosts>("/api/observability/costs"),
  searchObservabilityRuns: (search: string, limit = 50) =>
    request<{ recent_runs: Array<Record<string, unknown>> }>(
      `/api/observability/runs?search=${encodeURIComponent(search)}&limit=${limit}`
    ),
  listObservabilityRuns: (limit = 100) =>
    request<{ recent_runs: Array<Record<string, unknown>> }>(
      `/api/observability/runs?limit=${limit}`
    ),
  getObservabilityErrors: () => request<ObservabilityErrors>("/api/observability/errors"),
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
  listAlertEvents: () => request<AlertEvent[]>("/api/alerts/events"),
  // Guardrail policies (reusable rule bundles)
  listGuardrailPolicies: () =>
    request<GuardrailPolicy[]>("/api/guardrail-policies"),
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
  publishVersion: (workflowId: string, versionId: string) =>
    request<{ published_version_id: string; published_version_number: number }>(
      `/api/workflows/${workflowId}/publish`,
      { method: "POST", body: JSON.stringify({ version_id: versionId }) }
    ),
  getOpsConfig: () =>
    request<Record<string, number | boolean>>("/api/meta/ops-config"),
  getPublished: (workflowId: string) =>
    request<{ published_version_id: string | null; published_version_number: number | null }>(
      `/api/workflows/${workflowId}/published`
    ),
  cancelRun: (id: string) =>
    request<{ status: string; run_id: string }>(`/api/runs/${id}`, { method: "DELETE" }),
  approveRun: (id: string, payload: { approved: boolean; comment?: string }) =>
    request<{ status: string; run_id: string; approved: boolean }>(`/api/runs/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  streamRun: (
    runId: string,
    onEvent: (event: Record<string, unknown>) => void,
    onError?: (error: Event) => void
  ): { close: () => void } => {
    let manuallyClosed = false;
    let terminalReceived = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    const abortController = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const terminalEvents = new Set(["run_completed", "run_failed", "run_cancelled"]);

    const parseChunk = (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        reconnectAttempts = 0;
        try {
          const event = JSON.parse(line.slice(6));
          if (event && terminalEvents.has(String(event.type))) {
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
        const response = await fetch(`/api/runs/${runId}/stream`, {
          headers: authHeaders(),
          signal: abortController.signal,
          cache: "no-store",
        });
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
        if (reconnectTimer) clearTimeout(reconnectTimer);
        abortController.abort();
      },
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
};