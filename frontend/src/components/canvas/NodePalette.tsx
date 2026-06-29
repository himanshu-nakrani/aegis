"use client";

import { Bot, Calculator, GitBranch, GitMerge, Search, Shield, Sparkles } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { cn } from "@/lib/utils";

const DRAG_TYPE = "application/aegis-node";

const paletteItems: Array<{
  data: NodeData;
  icon: React.ElementType;
  description: string;
  group: "core" | "quality" | "flow";
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
      label: "Calculator",
      nodeType: "tool",
      toolType: "calculator",
    },
    icon: Calculator,
    description: "Safe math evaluation",
    group: "core",
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
    group: "core",
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
    description: "Conditional branching",
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
];

const groups = [
  { id: "core", label: "Core" },
  { id: "quality", label: "Eval & Safety" },
  { id: "flow", label: "Flow Control" },
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

export { DRAG_TYPE };