"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Calculator, Search, Shield, Sparkles } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { cn } from "@/lib/utils";

const icons = {
  agent: Bot,
  tool: Calculator,
  evaluation: Sparkles,
  guardrail: Shield,
};

const colors = {
  agent: "border-sky-500/50 bg-sky-500/10",
  tool: "border-violet-500/50 bg-violet-500/10",
  evaluation: "border-amber-500/50 bg-amber-500/10",
  guardrail: "border-emerald-500/50 bg-emerald-500/10",
};

export function BaseNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;
  const Icon = nodeData.nodeType === "tool" && nodeData.toolType === "search" ? Search : icons[nodeData.nodeType];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border-2 px-4 py-3 shadow-lg backdrop-blur",
        colors[nodeData.nodeType],
        selected && "ring-2 ring-sky-400"
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-300" />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div>
          <p className="text-sm font-semibold text-slate-100">{nodeData.label}</p>
          <p className="text-xs capitalize text-slate-400">{nodeData.nodeType}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-slate-300" />
    </div>
  );
}