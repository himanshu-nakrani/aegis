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
};