export type NodeCategory =
  | "trigger"
  | "logic"
  | "llm"
  | "data"
  | "integration"
  | "quality"
  | "flow";

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  trigger: "Trigger",
  logic: "Logic",
  llm: "LLM",
  data: "Data",
  integration: "Integration",
  quality: "Quality",
  flow: "Flow control",
};

export const CATEGORY_COLOR_VAR: Record<NodeCategory, string> = {
  trigger: "var(--cat-trigger)",
  logic: "var(--cat-logic)",
  llm: "var(--cat-llm)",
  data: "var(--cat-data)",
  integration: "var(--cat-integration)",
  quality: "var(--cat-quality)",
  flow: "var(--cat-flow)",
};

/** Map a node-type string from the registry to a category. */
export function categorize(nodeType: string): NodeCategory {
  if (nodeType.startsWith("trigger") || nodeType === "trigger" || nodeType === "input_schema")
    return "trigger";
  if (["if", "switch", "router", "classifier_router", "filter"].includes(nodeType)) return "logic";
  if (["agent", "classifier", "summarizer", "translator", "extractor"].includes(nodeType))
    return "llm";
  if (
    [
      "kb_retrieve",
      "memory_store",
      "memory_retrieve",
      "json_parse",
      "code",
      "transform",
      "set_fields",
      "tool",
    ].includes(nodeType)
  )
    return "data";
  if (nodeType.startsWith("integration_") || nodeType === "http_request" || nodeType === "integration")
    return "integration";
  if (["evaluation", "guardrail"].includes(nodeType)) return "quality";
  if (["join", "delay", "sub_workflow", "human_approval", "end", "note"].includes(nodeType))
    return "flow";
  return "flow";
}