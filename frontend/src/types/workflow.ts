export type ConditionOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "empty"
  | "not_empty"
  | "gt"
  | "lt";

export interface StructuredCondition {
  left: string;
  operator: ConditionOperator;
  right?: string;
}

export interface InputFieldDef {
  key: string;
  type?: "string" | "number" | "boolean";
  default?: string;
  required?: boolean;
}

export type NodeType =
  | "trigger"
  | "end"
  | "input_schema"
  | "if"
  | "switch"
  | "filter"
  | "set_fields"
  | "agent"
  | "tool"
  | "evaluation"
  | "guardrail"
  | "router"
  | "classifier"
  | "join"
  | "summarizer"
  | "translator"
  | "extractor"
  | "transform"
  | "json_parse"
  | "delay"
  | "code"
  | "memory_store"
  | "memory_retrieve"
  | "kb_retrieve"
  | "human_approval"
  | "sub_workflow"
  | "integration"
  | "note";

export type IntegrationType = "slack" | "email" | "postgres";

export interface KbDocument {
  id: string;
  title?: string;
  text: string;
}
export type TriggerType = "manual" | "webhook" | "schedule";
export type ToolType = "calculator" | "search" | "http";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type SummaryStyle = "concise" | "detailed" | "bullet";
export type SearchProvider = "google" | "exa" | "duckduckgo";
export type GuardrailFailBehavior = "block" | "warn";
export type GuardrailMode = "input" | "output";
export type EvalPresetId = "rag_quality" | "support_tone" | "code_safety";

export interface GuardrailRules {
  blocked_keywords?: string[];
  pattern?: string;
  max_length?: number;
  detect_pii?: boolean;
  fail_behavior?: GuardrailFailBehavior;
  mode?: GuardrailMode;
}

export interface NodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  triggerType?: TriggerType;
  scheduleCron?: string;
  endDescription?: string;
  inputFields?: InputFieldDef[];
  ifCondition?: StructuredCondition;
  filterCondition?: StructuredCondition;
  switchValue?: string;
  switchCases?: string[];
  switchDefault?: string;
  setFields?: Record<string, string>;
  instruction?: string;
  toolType?: ToolType;
  searchProvider?: SearchProvider;
  criteria?: string;
  evalPreset?: EvalPresetId | string;
  routes?: string[];
  categories?: string[];
  rules?: GuardrailRules;
  // LLM presets
  summaryStyle?: SummaryStyle;
  targetLanguage?: string;
  extractFields?: string[];
  // Data transforms
  template?: string;
  jsonPath?: string;
  delaySeconds?: number;
  // HTTP tool
  httpMethod?: HttpMethod;
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpBody?: string;
  // Code / memory / RAG
  code?: string;
  memoryNamespace?: string;
  memoryKey?: string;
  memoryValue?: string;
  memoryPersistent?: boolean;
  kbQuery?: string;
  kbDocuments?: KbDocument[];
  kbTopK?: number;
  kbSource?: "inline" | "workflow";
  kbMethod?: "bm25" | "tfidf" | "keyword";
  approvalReview?: string;
  subWorkflowId?: string;
  subWorkflowInput?: string;
  integrationType?: IntegrationType;
  credentialId?: string;
  credentialName?: string;
  integrationMessage?: string;
  integrationSubject?: string;
  integrationBody?: string;
  integrationQuery?: string;
  // Annotation
  noteText?: string;
}

export interface Credential {
  id: string;
  name: string;
  type: IntegrationType;
  config: Record<string, string>;
  created_at: string;
  updated_at?: string;
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
    label?: string;
    data?: { route?: string };
  }>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  webhook_url?: string | null;
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

export interface WorkflowVersionListItem {
  id: string;
  workflow_id: string;
  version_number: number;
  created_at: string;
  node_count: number;
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

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  graph_json: WorkflowGraph;
}

export interface EvalPreset {
  id: string;
  label: string;
  criteria: string;
}

export interface EvalScores {
  faithfulness?: number;
  helpfulness?: number;
  relevance?: number;
  toxicity?: number;
  aggregate_score?: number;
  reasoning?: string;
}

export interface EvalHistoryEntry {
  run_id: string;
  created_at: string;
  status: string;
  input_text: string;
  scores: EvalScores & { scores?: EvalScores[] };
}

export interface RunCompareResponse {
  run_a_id: string;
  run_b_id: string;
  run_a_scores: EvalScores | null;
  run_b_scores: EvalScores | null;
  delta: Record<string, number | null>;
  run_a_output: string | null;
  run_b_output: string | null;
  run_a_version: number | null;
  run_b_version: number | null;
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