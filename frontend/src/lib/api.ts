import { authHeaders } from "@/lib/auth";
import type {
  EvalHistoryEntry,
  EvalPreset,
  RunCompareResponse,
  RunListItem,
  Workflow,
  WorkflowGraph,
  WorkflowListItem,
  WorkflowRun,
  WorkflowTemplate,
  WorkflowVersion,
} from "@/types/workflow";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    request<WorkflowVersion[]>(`/api/workflows/${workflowId}/versions`),
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
  listEvalPresets: () => request<EvalPreset[]>("/api/templates/eval-presets"),
  listRuns: () => request<RunListItem[]>("/api/runs"),
  createRun: (payload: { workflow_id: string; version_id?: string; input_text: string }) =>
    request<WorkflowRun>("/api/runs", { method: "POST", body: JSON.stringify(payload) }),
  getRun: (id: string) => request<WorkflowRun>(`/api/runs/${id}`),
  cancelRun: (id: string) =>
    request<{ status: string; run_id: string }>(`/api/runs/${id}`, { method: "DELETE" }),
  streamRun: (runId: string, onEvent: (event: Record<string, unknown>) => void) => {
    const source = new EventSource(`${API_BASE}/api/runs/${runId}/stream`);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        // ignore malformed events
      }
    };
    return source;
  },
};