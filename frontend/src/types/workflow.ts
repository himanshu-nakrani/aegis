export type NodeType = "agent" | "tool" | "evaluation" | "guardrail";
export type ToolType = "calculator" | "search";
export type SearchProvider = "google" | "exa" | "duckduckgo";

export interface NodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  instruction?: string;
  toolType?: ToolType;
  searchProvider?: SearchProvider;
  criteria?: string;
  rules?: {
    blocked_keywords?: string[];
    pattern?: string;
  };
}

export interface WorkflowGraph {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: NodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  latest_version?: WorkflowVersion | null;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  graph_json: WorkflowGraph;
  created_at: string;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version_number?: number | null;
}

export interface NodeResult {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string;
  status: string;
  output?: string | null;
  evaluation_scores?: Record<string, unknown> | null;
  guardrail_status?: string | null;
  latency_ms?: number | null;
  token_usage?: Record<string, unknown> | null;
}

export interface WorkflowRun {
  id: string;
  workflow_version_id: string;
  status: string;
  input_text: string;
  final_output?: string | null;
  metrics_json?: Record<string, unknown> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  node_results?: NodeResult[];
}

export interface RunListItem {
  id: string;
  workflow_version_id: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
  status: string;
  input_text: string;
  final_output?: string | null;
  created_at: string;
  completed_at?: string | null;
}