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
    request(`/api/workflows/${workflowId}/knowledge/bulk`, {
      method: "POST",
      body: JSON.stringify({ documents }),
    }),
  reindexKnowledge: (workflowId: string) =>
    request<{ status: string; count: number }>(`/api/workflows/${workflowId}/knowledge/reindex`, {
      method: "POST",
    }),
  deleteKnowledge: (workflowId: string, documentId: string) =>
    request(`/api/workflows/${workflowId}/knowledge/${documentId}`, { method: "DELETE" }),
  duplicateWorkflow: (id: string) =>
    request<Workflow>(`/api/workflows/${id}/duplicate`, { method: "POST" }),
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
      recent_runs: Array<{
        run_id: string;
        status: string;
        created_at: string;
        eval_aggregate?: number;
        latency_ms?: number;
      }>;
    }>("/api/observability/summary"),
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
  listEvalPresets: async () => {
    if (evalPresetsCache) return evalPresetsCache;
    evalPresetsCache = await request<EvalPreset[]>("/api/templates/eval-presets");
    return evalPresetsCache;
  },
  listRuns: () => request<RunListItem[]>("/api/runs"),
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
};