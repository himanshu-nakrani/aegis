"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  Calculator,
  GitBranch,
  GitMerge,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { cn } from "@/lib/utils";

const icons = {
  agent: Bot,
  tool: Calculator,
  evaluation: Sparkles,
  guardrail: Shield,
  router: GitBranch,
  join: GitMerge,
};

const accents = {
  agent: {
    border: "border-sky-500/60",
    bg: "bg-gradient-to-br from-sky-500/15 to-sky-900/10",
    icon: "bg-sky-500/20 text-sky-300",
    badge: "bg-sky-500/20 text-sky-200",
  },
  tool: {
    border: "border-violet-500/60",
    bg: "bg-gradient-to-br from-violet-500/15 to-violet-900/10",
    icon: "bg-violet-500/20 text-violet-300",
    badge: "bg-violet-500/20 text-violet-200",
  },
  evaluation: {
    border: "border-amber-500/60",
    bg: "bg-gradient-to-br from-amber-500/15 to-amber-900/10",
    icon: "bg-amber-500/20 text-amber-300",
    badge: "bg-amber-500/20 text-amber-200",
  },
  guardrail: {
    border: "border-emerald-500/60",
    bg: "bg-gradient-to-br from-emerald-500/15 to-emerald-900/10",
    icon: "bg-emerald-500/20 text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-200",
  },
  router: {
    border: "border-orange-500/60",
    bg: "bg-gradient-to-br from-orange-500/15 to-orange-900/10",
    icon: "bg-orange-500/20 text-orange-300",
    badge: "bg-orange-500/20 text-orange-200",
  },
  join: {
    border: "border-cyan-500/60",
    bg: "bg-gradient-to-br from-cyan-500/15 to-cyan-900/10",
    icon: "bg-cyan-500/20 text-cyan-300",
    badge: "bg-cyan-500/20 text-cyan-200",
  },
};

function nodePreview(data: NodeData): string | null {
  if (data.nodeType === "agent" && data.instruction) {
    return data.instruction.slice(0, 72) + (data.instruction.length > 72 ? "…" : "");
  }
  if (data.nodeType === "router" && data.routes?.length) {
    return `Routes: ${data.routes.join(", ")}`;
  }
  if (data.nodeType === "tool" && data.toolType === "search") {
    return `Search · ${data.searchProvider ?? "google"}`;
  }
  if (data.nodeType === "evaluation" && data.evalPreset) {
    return `Preset: ${data.evalPreset}`;
  }
  if (data.nodeType === "guardrail" && data.rules?.mode) {
    return `${data.rules.mode} · ${data.rules.fail_behavior ?? "block"}`;
  }
  return null;
}

export function BaseNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData & { isActive?: boolean; hasError?: boolean };
  const accent = accents[nodeData.nodeType];
  const Icon =
    nodeData.nodeType === "tool" && nodeData.toolType === "search"
      ? Search
      : icons[nodeData.nodeType];
  const preview = nodePreview(nodeData);

  return (
    <div
      className={cn(
        "group min-w-[200px] max-w-[240px] rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-200",
        accent.border,
        accent.bg,
        selected && "ring-2 ring-sky-400/80 ring-offset-2 ring-offset-slate-950",
        nodeData.isActive && "ring-2 ring-amber-400 shadow-amber-500/20 animate-pulse",
        nodeData.hasError && "ring-2 ring-rose-500/80"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-slate-600 !bg-slate-900 transition group-hover:!border-sky-400"
      />

      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className={cn("rounded-lg p-2", accent.icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">{nodeData.label}</p>
            <span
              className={cn(
                "mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                accent.badge
              )}
            >
              {nodeData.nodeType}
            </span>
          </div>
        </div>

        {preview && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{preview}</p>
        )}

        {nodeData.isActive && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-amber-300">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-400" />
            Running
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-slate-600 !bg-slate-900 transition group-hover:!border-sky-400"
      />
    </div>
  );
}