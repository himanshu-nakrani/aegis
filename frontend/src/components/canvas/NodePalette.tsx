"use client";

import {
  Bot,
  Braces,
  Calculator,
  Clock,
  FileJson,
  GitBranch,
  GitMerge,
  Globe,
  Languages,
  ListTree,
  Search,
  Shield,
  Sparkles,
  StickyNote,
  Wand2,
} from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { cn } from "@/lib/utils";

export const DRAG_TYPE = "application/aegis-node";

const paletteItems: Array<{
  data: NodeData;
  icon: React.ElementType;
  description: string;
  group: "core" | "tools" | "data" | "quality" | "flow" | "annotate";
}> = [
  {
    data: {
      label: "LLM Agent",
      nodeType: "agent",
      instruction: "You are a helpful AI assistant. Respond clearly and concisely.",
    },
    icon: Bot,
    description: "Gemini-powered reasoning",
    group: "core",
  },
  {
    data: {
      label: "Summarizer",
      nodeType: "summarizer",
      summaryStyle: "concise",
    },
    icon: FileJson,
    description: "Condense long text",
    group: "core",
  },
  {
    data: {
      label: "Translator",
      nodeType: "translator",
      targetLanguage: "Spanish",
    },
    icon: Languages,
    description: "Translate to any language",
    group: "core",
  },
  {
    data: {
      label: "Extractor",
      nodeType: "extractor",
      extractFields: ["summary", "entities", "action_items"],
    },
    icon: Braces,
    description: "Structured JSON extraction",
    group: "core",
  },
  {
    data: {
      label: "Calculator",
      nodeType: "tool",
      toolType: "calculator",
    },
    icon: Calculator,
    description: "Safe math evaluation",
    group: "tools",
  },
  {
    data: {
      label: "Web Search",
      nodeType: "tool",
      toolType: "search",
      searchProvider: "google",
    },
    icon: Search,
    description: "Google, EXA, DuckDuckGo",
    group: "tools",
  },
  {
    data: {
      label: "HTTP Request",
      nodeType: "tool",
      toolType: "http",
      httpMethod: "GET",
      httpUrl: "https://httpbin.org/get",
    },
    icon: Globe,
    description: "Call external APIs",
    group: "tools",
  },
  {
    data: {
      label: "Transform",
      nodeType: "transform",
      template: "Input: {{input}}",
    },
    icon: Wand2,
    description: "Template with {{input}}",
    group: "data",
  },
  {
    data: {
      label: "JSON Parse",
      nodeType: "json_parse",
      jsonPath: "",
    },
    icon: Braces,
    description: "Parse & extract JSON fields",
    group: "data",
  },
  {
    data: {
      label: "Delay",
      nodeType: "delay",
      delaySeconds: 1,
    },
    icon: Clock,
    description: "Pause before next step",
    group: "data",
  },
  {
    data: {
      label: "Evaluation",
      nodeType: "evaluation",
      criteria: "faithfulness and helpfulness",
    },
    icon: Sparkles,
    description: "Score output quality",
    group: "quality",
  },
  {
    data: {
      label: "Guardrail",
      nodeType: "guardrail",
      rules: { blocked_keywords: [], pattern: "" },
    },
    icon: Shield,
    description: "Validate input/output",
    group: "quality",
  },
  {
    data: {
      label: "Router",
      nodeType: "router",
      routes: ["route_a", "route_b"],
    },
    icon: GitBranch,
    description: "LLM conditional branching",
    group: "flow",
  },
  {
    data: {
      label: "Classifier",
      nodeType: "classifier",
      categories: ["support", "sales", "other"],
    },
    icon: ListTree,
    description: "Categorize & branch",
    group: "flow",
  },
  {
    data: {
      label: "Join",
      nodeType: "join",
    },
    icon: GitMerge,
    description: "Merge parallel paths",
    group: "flow",
  },
  {
    data: {
      label: "Sticky Note",
      nodeType: "note",
      noteText: "Document your workflow here",
    },
    icon: StickyNote,
    description: "Canvas annotation only",
    group: "annotate",
  },
];

const groups = [
  { id: "core", label: "LLM" },
  { id: "tools", label: "Tools" },
  { id: "data", label: "Data" },
  { id: "quality", label: "Eval & Safety" },
  { id: "flow", label: "Flow Control" },
  { id: "annotate", label: "Annotate" },
] as const;

interface NodePaletteProps {
  onAddNode: (data: NodeData) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const onDragStart = (event: React.DragEvent, data: NodeData) => {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Drag onto canvas or click to add. Connect left → right.
      </p>

      {groups.map((group) => {
        const items = paletteItems.filter((item) => item.group === group.id);
        return (
          <div key={group.id} className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </p>
            <div className="space-y-1.5">
              {items.map((item) => (
                <button
                  key={item.data.label}
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStart(e, item.data)}
                  onClick={() => onAddNode(item.data)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2.5",
                    "text-left transition hover:border-slate-600 hover:bg-slate-800/80 active:scale-[0.98]"
                  )}
                >
                  <div className="rounded-lg bg-slate-800 p-1.5 text-slate-300">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200">{item.data.label}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}