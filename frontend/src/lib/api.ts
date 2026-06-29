import type {
  RunListItem,
  Workflow,
  WorkflowGraph,
  WorkflowListItem,
  WorkflowRun,
  WorkflowVersion,
} from "@/types/workflow";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
  saveVersion: (
    workflowId: string,
    payload: { graph_json: WorkflowGraph; save_as_new_version?: boolean }
  ) =>
    request<WorkflowVersion>(`/api/workflows/${workflowId}/versions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listRuns: () => request<RunListItem[]>("/api/runs"),
  createRun: (payload: { workflow_id: string; version_id?: string; input_text: string }) =>
    request<WorkflowRun>("/api/runs", { method: "POST", body: JSON.stringify(payload) }),
  getRun: (id: string) => request<WorkflowRun>(`/api/runs/${id}`),
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