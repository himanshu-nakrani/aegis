import { authHeaders, getApiKey } from "@/lib/auth";
import type {
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

let evalPresetsCache: EvalPreset[] | null = null;
let credentialsCache: Credential[] | null = null;
let workflowsCache: WorkflowListItem[] | null = null;

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
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  listWorkflows: async () => {
    if (workflowsCache) return workflowsCache;
    workflowsCache = await request<WorkflowListItem[]>("/api/workflows");
    return workflowsCache;
  },
  invalidateWorkflowsCache: () => {
    workflowsCache = null;
  },
  createWorkflow: (payload: { name: string; description?: string; graph_json: WorkflowGraph }) => {
    workflowsCache = null;
    return request<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(payload) });
  },
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
    request<{ status: string; document_count: number; workflow_id: string }>(
      `/api/workflows/${workflowId}/knowledge/bulk`,
      {
        method: "POST",
        body: JSON.stringify({ documents }),
      }
    ),
  reindexKnowledge: (workflowId: string) =>
    request<{ status: string; count: number; workflow_id: string }>(
      `/api/workflows/${workflowId}/knowledge/reindex`,
      {
        method: "POST",
      }
    ),
  deleteKnowledge: (workflowId: string, documentId: string) =>
    request(`/api/workflows/${workflowId}/knowledge/${documentId}`, { method: "DELETE" }),
  duplicateWorkflow: (id: string) => {
    workflowsCache = null;
    return request<Workflow>(`/api/workflows/${id}/duplicate`, { method: "POST" });
  },
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
  listCredentials: async () => {
    if (credentialsCache) return credentialsCache;
    credentialsCache = await request<Credential[]>("/api/credentials");
    return credentialsCache;
  },
  createCredential: (payload: { name: string; type: string; config: Record<string, string> }) => {
    credentialsCache = null;
    return request<Credential>("/api/credentials", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteCredential: (id: string) => {
    credentialsCache = null;
    return request<{ status: string }>(`/api/credentials/${id}`, { method: "DELETE" });
  },
  listEvalPresets: async () => {
    if (evalPresetsCache) return evalPresetsCache;
    evalPresetsCache = await request<EvalPreset[]>("/api/eval-presets");
    return evalPresetsCache;
  },
  createEvalPreset: (payload: {
    name: string;
    label: string;
    criteria: string;
    instruction?: string;
    score_weights?: Record<string, number>;
    eval_type?: string;
  }) => {
    evalPresetsCache = null;
    return request<EvalPreset>("/api/eval-presets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteEvalPreset: (id: string) => {
    evalPresetsCache = null;
    return request<{ status: string }>(`/api/eval-presets/${id}`, { method: "DELETE" });
  },
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
  getRun: (id: string) => request<WorkflowRun>(`/api/runs/${id}`),
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
  ) => {
    const apiKey = getApiKey();
    const query = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
    const source = new EventSource(`${API_BASE}/api/runs/${runId}/stream${query}`);
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

    source.onmessage = (message) => {
      reconnectAttempts = 0;
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        // ignore malformed events
      }
    };

    source.onerror = (error) => {
      reconnectAttempts += 1;
      if (reconnectAttempts >= maxReconnectAttempts) {
        source.close();
        onError?.(error);
      }
    };

    return source;
  },
  streamObservability: (
    onEvent: (event: Record<string, unknown>) => void,
    onError?: (error: Event) => void
  ) => {
    const apiKey = getApiKey();
    const query = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
    const source = new EventSource(`${API_BASE}/api/observability/stream${query}`);

    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        // ignore malformed events
      }
    };

    source.onerror = (error) => {
      onError?.(error);
    };

    return source;
  },
};