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

export type IntegrationType = "slack" | "discord" | "email" | "postgres";

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
export type GuardrailFailBehavior = "block" | "warn" | "mask" | "fallback" | "route";
export type EvalExecutionMode = "parallel" | "inline";
export type EvalType =
  | "llm"
  | "exact"
  | "substring"
  | "regex"
  | "embedding"
  | "json_schema"
  | "numeric";
export type GuardrailMode = "input" | "output";
export type EvalPresetId = "rag_quality" | "support_tone" | "code_safety";

export type GuardrailType =
  | "rules"
  | "llm"
  | "presidio"
  | "prompt_injection"
  | "moderation";
export type EvalFailBehavior = "none" | "warn" | "block";

export interface GuardrailRules {
  guardrail_type?: GuardrailType;
  llm_instruction?: string;
  blocked_keywords?: string[];
  required_keywords?: string[];
  blocked_patterns?: string[];
  pattern?: string;
  min_length?: number;
  max_length?: number;
  detect_pii?: boolean;
  pii_engine?: "regex" | "presidio";
  presidio_entities?: string[];
  presidio_language?: string;
  moderation_instruction?: string;
  moderation_threshold?: number;
  moderation_thresholds?: Partial<
    Record<"toxicity" | "hate" | "violence" | "self_harm" | "sexual", number>
  >;
  fail_behavior?: GuardrailFailBehavior;
  fallback_value?: string;
  pass_route?: string;
  failure_route?: string;
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
  evalThreshold?: number;
  evalFailBehavior?: EvalFailBehavior;
  evalExecutionMode?: EvalExecutionMode;
  evalType?: EvalType;
  evalExpected?: string;
  evalPattern?: string;
  evalBaseline?: string;
  evalSimilarityThreshold?: number;
  evalTolerance?: number;
  evalCustomPresetId?: string;
  scoreWeights?: Record<string, number>;
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
  kbMethod?: "embedding" | "bm25" | "tfidf" | "keyword";
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
  // Reliability policy (function-style nodes: tool, http, code, integrations, data)
  retries?: number;
  retryDelaySec?: number;
  timeoutSec?: number;
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
  published?: boolean;
  is_external?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  graph_json: WorkflowGraph;
  /** Provenance (MVP 2): built-ins report null author / 0 usage. */
  author?: string | null;
  usage_count?: number;
  created_at?: string | null;
  builtin?: boolean;
}

export interface EvalPreset {
  id: string;
  label: string;
  criteria: string;
  instruction?: string;
  score_weights?: Record<string, number>;
  source?: "builtin" | "custom";
  eval_type?: EvalType;
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
  eval_passed?: boolean | null;
  eval_aggregate?: number | null;
  guardrail_blocked?: boolean;
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
  eval_aggregate?: number | null;
  eval_passed?: boolean | null;
  guardrail_blocked?: boolean;
}
export interface LlmCall {
  id: string;
  node_id: string | null;
  model: string | null;
  prompt_text: string | null;
  completion_text: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  thinking_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
}

export interface DatasetSummary {
  id: string;
  workflow_id: string;
  name: string;
  item_count: number;
  created_at: string | null;
}

export interface DatasetDetail extends DatasetSummary {
  items: Array<{
    id: string;
    input_text: string;
    expected_output: string | null;
    tags: Record<string, unknown> | null;
  }>;
}

export interface ExperimentAggregate {
  version_id: string;
  items: number;
  failures: number;
  failure_rate: number;
  avg_eval: number | null;
  avg_latency_ms: number | null;
  total_cost_usd: number | null;
}

export interface Experiment {
  id: string;
  workflow_id: string;
  dataset_id: string;
  kind: "batch" | "regression";
  version_id: string;
  baseline_version_id: string | null;
  status: string;
  summary: {
    candidate?: ExperimentAggregate;
    baseline?: ExperimentAggregate;
    verdict?: {
      passed: boolean;
      eval_delta: number | null;
      failure_delta: number;
      reasons: string[];
    };
    rows?: Array<Record<string, unknown>>;
    error?: string;
  } | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RunFeedback {
  id: string;
  node_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string | null;
}

export interface ObservabilityCosts {
  runs_scanned: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  total_cost_usd: number;
  total_tokens: number;
  top_workflows_by_cost: Array<{
    workflow: string;
    runs: number;
    cost_usd: number;
    failures: number;
  }>;
  version_eval_trend: Array<{
    workflow: string;
    versions: Array<{ version: number; avg_eval: number; runs: number }>;
  }>;
}

export interface ObservabilityErrors {
  clusters: Array<{
    signature: string;
    count: number;
    workflows: string[];
    last_seen: string | null;
    sample_run_id: string;
  }>;
  failed_runs_scanned: number;
}

export interface AlertRule {
  id: string;
  workflow_id: string | null;
  metric: string;
  operator: string;
  threshold: number;
  window_minutes: number;
  channel_url: string | null;
  enabled: boolean;
  last_fired_at: string | null;
}

export interface AlertEvent {
  id: string;
  rule_id: string;
  metric: string;
  value: number;
  message: string;
  fired_at: string | null;
}
