export const queryKeys = {
  workflows: ["workflows"] as const,
  workflow: (id: string) => ["workflow", id] as const,
  workflowVersions: (id: string) => ["workflow-versions", id] as const,
  workflowQuality: (id: string) => ["workflow-quality", id] as const,
  workflowKnowledge: (id: string) => ["workflow-knowledge", id] as const,
  workflowMemory: (id: string) => ["workflow-memory", id] as const,
  templates: ["templates"] as const,
  job: (id: string) => ["job", id] as const,
  observabilitySummary: ["observability-summary"] as const,
  credentials: ["credentials"] as const,
  evalPresets: ["eval-presets"] as const,
  alertRules: ["alert-rules"] as const,
  assistSuggestions: (workflowId: string, nodeId: string, graphHash: string) =>
    ["assist-suggestions", workflowId, nodeId, graphHash] as const,
  // MVP 2 read endpoints
  runTimeline: (runId: string) => ["run-timeline", runId] as const,
  deployDescriptor: (workflowId: string) => ["deploy-descriptor", workflowId] as const,
  observabilityDashboards: (filtersHash: string) =>
    ["observability-dashboards", filtersHash] as const,
  // Trust layer (observability/eval/guardrails)
  runTrace: (runId: string) => ["run-trace", runId] as const,
  runSession: (sessionId: string) => ["run-session", sessionId] as const,
  traceSearch: (queryHash: string) => ["trace-search", queryHash] as const,
  guardrailViolations: (filtersHash: string) =>
    ["guardrail-violations", filtersHash] as const,
  trustDashboard: (filtersHash: string) => ["trust-dashboard", filtersHash] as const,
};