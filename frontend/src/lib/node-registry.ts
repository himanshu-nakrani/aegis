import {
  Bot,
  BookOpen,
  Braces,
  Calculator,
  CircleStop,
  Clock,
  Code2,
  Database,
  FileJson,
  Filter,
  FormInput,
  GitBranch,
  GitMerge,
  Globe,
  Languages,
  ListTree,
  Search,
  Shield,
  Sparkles,
  Split,
  StickyNote,
  TableProperties,
  UserCheck,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { NodeData, NodeType } from "@/types/workflow";

export type NodeCategory = "flow" | "llm" | "tools" | "data" | "quality" | "annotate";

export interface NodeDefinition {
  type: NodeType;
  label: string;
  category: NodeCategory;
  description: string;
  icon: LucideIcon;
  defaultData: NodeData;
  accent: { ring: string; label: string; icon: string };
  supportsExpressions?: boolean;
}

export const NODE_CATEGORIES: Array<{ id: NodeCategory; label: string }> = [
  { id: "flow", label: "Flow" },
  { id: "llm", label: "Agents" },
  { id: "tools", label: "Tools" },
  { id: "data", label: "Data" },
  { id: "quality", label: "Eval & Safety" },
  { id: "annotate", label: "Annotate" },
];

const accent = {
  flow: { ring: "border-primary/40", label: "text-primary", icon: "bg-primary-muted text-primary" },
  llm: { ring: "border-primary/40", label: "text-primary", icon: "bg-primary-muted text-primary" },
  tools: { ring: "border-accent/40", label: "text-accent", icon: "bg-accent-muted text-accent" },
  data: { ring: "border-warning/40", label: "text-warning", icon: "bg-warning/10 text-warning" },
  quality: { ring: "border-success/40", label: "text-success", icon: "bg-success/10 text-success" },
  annotate: { ring: "border-border-strong", label: "text-muted", icon: "bg-surface-hover text-muted" },
} as const;

export const NODE_REGISTRY: NodeDefinition[] = [
  {
    type: "trigger",
    label: "Trigger",
    category: "flow",
    description: "Workflow entry point",
    icon: Zap,
    defaultData: { label: "Trigger", nodeType: "trigger", triggerType: "manual" },
    accent: { ring: "border-success/50", label: "text-success", icon: "bg-success/10 text-success" },
  },
  {
    type: "end",
    label: "End",
    category: "flow",
    description: "Workflow exit & output",
    icon: CircleStop,
    defaultData: { label: "End", nodeType: "end" },
    accent: { ring: "border-destructive/40", label: "text-destructive", icon: "bg-destructive/10 text-destructive" },
  },
  {
    type: "input_schema",
    label: "Input Schema",
    category: "flow",
    description: "Define structured workflow inputs",
    icon: FormInput,
    defaultData: {
      label: "Input Schema",
      nodeType: "input_schema",
      inputFields: [
        { key: "message", type: "string", required: true },
        { key: "priority", type: "string", default: "normal" },
      ],
    },
    accent: accent.flow,
  },
  {
    type: "if",
    label: "IF",
    category: "flow",
    description: "Branch on expression (true / false)",
    icon: Split,
    defaultData: {
      label: "IF",
      nodeType: "if",
      ifCondition: { left: "{{input.priority}}", operator: "eq", right: "high" },
    },
    accent: accent.flow,
  },
  {
    type: "switch",
    label: "Switch",
    category: "flow",
    description: "Route by matched value",
    icon: GitBranch,
    defaultData: {
      label: "Switch",
      nodeType: "switch",
      switchValue: "{{input.priority}}",
      switchCases: ["high", "normal", "low"],
      switchDefault: "default",
    },
    accent: accent.flow,
  },
  {
    type: "filter",
    label: "Filter",
    category: "flow",
    description: "Pass data only when condition matches",
    icon: Filter,
    defaultData: {
      label: "Filter",
      nodeType: "filter",
      filterCondition: { left: "{{last_output}}", operator: "not_empty" },
    },
    accent: accent.flow,
  },
  {
    type: "router",
    label: "Router",
    category: "flow",
    description: "AI conditional branching",
    icon: GitBranch,
    defaultData: { label: "Router", nodeType: "router", routes: ["route_a", "route_b"] },
    accent: accent.flow,
  },
  {
    type: "classifier",
    label: "Classifier",
    category: "flow",
    description: "Categorize & branch",
    icon: ListTree,
    defaultData: { label: "Classifier", nodeType: "classifier", categories: ["support", "sales", "other"] },
    accent: accent.flow,
  },
  {
    type: "join",
    label: "Join",
    category: "flow",
    description: "Merge parallel paths",
    icon: GitMerge,
    defaultData: { label: "Join", nodeType: "join" },
    accent: accent.flow,
  },
  {
    type: "human_approval",
    label: "Human Approval",
    category: "flow",
    description: "Pause for human review before continuing",
    icon: UserCheck,
    defaultData: {
      label: "Human Approval",
      nodeType: "human_approval",
      approvalReview: "{{last_output}}",
    },
    accent: accent.flow,
    supportsExpressions: true,
  },
  {
    type: "agent",
    label: "LLM Agent",
    category: "llm",
    description: "Gemini-powered reasoning",
    icon: Bot,
    defaultData: {
      label: "LLM Agent",
      nodeType: "agent",
      instruction: "You are a helpful AI assistant. Respond clearly and concisely.",
    },
    accent: accent.llm,
    supportsExpressions: true,
  },
  {
    type: "summarizer",
    label: "Summarizer",
    category: "llm",
    description: "Condense long text",
    icon: FileJson,
    defaultData: { label: "Summarizer", nodeType: "summarizer", summaryStyle: "concise" },
    accent: accent.llm,
  },
  {
    type: "translator",
    label: "Translator",
    category: "llm",
    description: "Translate to any language",
    icon: Languages,
    defaultData: { label: "Translator", nodeType: "translator", targetLanguage: "Spanish" },
    accent: accent.llm,
  },
  {
    type: "extractor",
    label: "Extractor",
    category: "llm",
    description: "Structured JSON extraction",
    icon: Braces,
    defaultData: {
      label: "Extractor",
      nodeType: "extractor",
      extractFields: ["summary", "entities", "action_items"],
    },
    accent: accent.llm,
  },
  {
    type: "tool",
    label: "Calculator",
    category: "tools",
    description: "Safe math evaluation",
    icon: Calculator,
    defaultData: { label: "Calculator", nodeType: "tool", toolType: "calculator" },
    accent: accent.tools,
  },
  {
    type: "tool",
    label: "Web Search",
    category: "tools",
    description: "Google, EXA, DuckDuckGo",
    icon: Search,
    defaultData: { label: "Web Search", nodeType: "tool", toolType: "search", searchProvider: "google" },
    accent: accent.tools,
  },
  {
    type: "tool",
    label: "HTTP Request",
    category: "tools",
    description: "Call external APIs",
    icon: Globe,
    defaultData: {
      label: "HTTP Request",
      nodeType: "tool",
      toolType: "http",
      httpMethod: "GET",
      httpUrl: "https://httpbin.org/get",
    },
    accent: accent.tools,
    supportsExpressions: true,
  },
  {
    type: "transform",
    label: "Transform",
    category: "data",
    description: "Map data with {{expressions}}",
    icon: Wand2,
    defaultData: { label: "Transform", nodeType: "transform", template: "{{input}}" },
    accent: accent.data,
    supportsExpressions: true,
  },
  {
    type: "set_fields",
    label: "Set Fields",
    category: "data",
    description: "Write fields into workflow context",
    icon: TableProperties,
    defaultData: {
      label: "Set Fields",
      nodeType: "set_fields",
      setFields: { summary: "{{steps.node_1.output}}" },
    },
    accent: accent.data,
    supportsExpressions: true,
  },
  {
    type: "json_parse",
    label: "JSON Parse",
    category: "data",
    description: "Parse & extract JSON fields",
    icon: Braces,
    defaultData: { label: "JSON Parse", nodeType: "json_parse", jsonPath: "" },
    accent: accent.data,
  },
  {
    type: "delay",
    label: "Delay",
    category: "data",
    description: "Pause before next step",
    icon: Clock,
    defaultData: { label: "Delay", nodeType: "delay", delaySeconds: 1 },
    accent: accent.data,
  },
  {
    type: "code",
    label: "Code",
    category: "data",
    description: "Sandboxed Python transform",
    icon: Code2,
    defaultData: {
      label: "Code",
      nodeType: "code",
      code: "result = last_output",
    },
    accent: accent.data,
  },
  {
    type: "memory_store",
    label: "Memory Store",
    category: "data",
    description: "Save a value to run memory",
    icon: Database,
    defaultData: {
      label: "Memory Store",
      nodeType: "memory_store",
      memoryNamespace: "default",
      memoryKey: "{{input.text}}",
      memoryValue: "{{last_output}}",
    },
    accent: accent.data,
    supportsExpressions: true,
  },
  {
    type: "memory_retrieve",
    label: "Memory Retrieve",
    category: "data",
    description: "Read a value from run memory",
    icon: Database,
    defaultData: {
      label: "Memory Retrieve",
      nodeType: "memory_retrieve",
      memoryNamespace: "default",
      memoryKey: "{{input.text}}",
    },
    accent: accent.data,
    supportsExpressions: true,
  },
  {
    type: "kb_retrieve",
    label: "KB Retrieve",
    category: "data",
    description: "Retrieve knowledge-base chunks for RAG",
    icon: BookOpen,
    defaultData: {
      label: "KB Retrieve",
      nodeType: "kb_retrieve",
      kbQuery: "{{input.query}}",
      kbTopK: 3,
      kbDocuments: [
        { id: "doc1", title: "Getting started", text: "Aegis is an agentic workflow builder." },
      ],
    },
    accent: accent.data,
    supportsExpressions: true,
  },
  {
    type: "evaluation",
    label: "Evaluation",
    category: "quality",
    description: "Score output quality",
    icon: Sparkles,
    defaultData: { label: "Evaluation", nodeType: "evaluation", criteria: "faithfulness and helpfulness" },
    accent: accent.quality,
  },
  {
    type: "guardrail",
    label: "Guardrail",
    category: "quality",
    description: "Validate input/output",
    icon: Shield,
    defaultData: { label: "Guardrail", nodeType: "guardrail", rules: { blocked_keywords: [], pattern: "" } },
    accent: accent.quality,
  },
  {
    type: "note",
    label: "Sticky Note",
    category: "annotate",
    description: "Canvas annotation only",
    icon: StickyNote,
    defaultData: { label: "Sticky Note", nodeType: "note", noteText: "Document your workflow here" },
    accent: accent.annotate,
  },
];

const registryByKey = new Map(
  NODE_REGISTRY.map((def) => [`${def.type}:${def.label}`, def])
);

export function getNodeDefinition(nodeType: string, label?: string): NodeDefinition | undefined {
  if (label) {
    const match = registryByKey.get(`${nodeType}:${label}`);
    if (match) return match;
  }
  return NODE_REGISTRY.find((def) => def.type === nodeType);
}

export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return NODE_REGISTRY.filter((def) => def.category === category);
}

export const EXPRESSION_HINT =
  "Use {{input}}, {{input.field}}, {{last_output}}, or {{steps.node_id.output}}";