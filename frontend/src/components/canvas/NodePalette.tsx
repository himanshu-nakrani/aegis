"use client";

import { Bot, Calculator, GitBranch, GitMerge, Search, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NodeData } from "@/types/workflow";

const paletteItems: Array<{ data: NodeData; icon: React.ElementType }> = [
  {
    data: {
      label: "LLM Agent",
      nodeType: "agent",
      instruction: "You are a helpful AI assistant. Respond clearly and concisely.",
    },
    icon: Bot,
  },
  {
    data: {
      label: "Calculator",
      nodeType: "tool",
      toolType: "calculator",
    },
    icon: Calculator,
  },
  {
    data: {
      label: "Web Search",
      nodeType: "tool",
      toolType: "search",
      searchProvider: "google",
    },
    icon: Search,
  },
  {
    data: {
      label: "Evaluation",
      nodeType: "evaluation",
      criteria: "faithfulness and helpfulness",
    },
    icon: Sparkles,
  },
  {
    data: {
      label: "Guardrail",
      nodeType: "guardrail",
      rules: { blocked_keywords: [], pattern: "" },
    },
    icon: Shield,
  },
  {
    data: {
      label: "Router",
      nodeType: "router",
      routes: ["route_a", "route_b"],
    },
    icon: GitBranch,
  },
  {
    data: {
      label: "Join",
      nodeType: "join",
    },
    icon: GitMerge,
  },
];

interface NodePaletteProps {
  onAddNode: (data: NodeData) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="flex w-56 flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nodes</p>
      {paletteItems.map((item) => (
        <Button
          key={item.data.label}
          variant="secondary"
          className="justify-start"
          onClick={() => onAddNode(item.data)}
        >
          <item.icon className="h-4 w-4" />
          {item.data.label}
        </Button>
      ))}
    </div>
  );
}