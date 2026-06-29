"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
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

const icons: Record<string, React.ElementType> = {
  agent: Bot,
  tool: Calculator,
  evaluation: Sparkles,
  guardrail: Shield,
  router: GitBranch,
  classifier: ListTree,
  join: GitMerge,
  summarizer: FileJson,
  translator: Languages,
  extractor: Braces,
  transform: Wand2,
  json_parse: Braces,
  delay: Clock,
  note: StickyNote,
};

const accents: Record<string, { border: string; bg: string; icon: string; badge: string }> = {
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
  classifier: {
    border: "border-pink-500/60",
    bg: "bg-gradient-to-br from-pink-500/15 to-pink-900/10",
    icon: "bg-pink-500/20 text-pink-300",
    badge: "bg-pink-500/20 text-pink-200",
  },
  join: {
    border: "border-cyan-500/60",
    bg: "bg-gradient-to-br from-cyan-500/15 to-cyan-900/10",
    icon: "bg-cyan-500/20 text-cyan-300",
    badge: "bg-cyan-500/20 text-cyan-200",
  },
  summarizer: {
    border: "border-indigo-500/60",
    bg: "bg-gradient-to-br from-indigo-500/15 to-indigo-900/10",
    icon: "bg-indigo-500/20 text-indigo-300",
    badge: "bg-indigo-500/20 text-indigo-200",
  },
  translator: {
    border: "border-blue-500/60",
    bg: "bg-gradient-to-br from-blue-500/15 to-blue-900/10",
    icon: "bg-blue-500/20 text-blue-300",
    badge: "bg-blue-500/20 text-blue-200",
  },
  extractor: {
    border: "border-teal-500/60",
    bg: "bg-gradient-to-br from-teal-500/15 to-teal-900/10",
    icon: "bg-teal-500/20 text-teal-300",
    badge: "bg-teal-500/20 text-teal-200",
  },
  transform: {
    border: "border-fuchsia-500/60",
    bg: "bg-gradient-to-br from-fuchsia-500/15 to-fuchsia-900/10",
    icon: "bg-fuchsia-500/20 text-fuchsia-300",
    badge: "bg-fuchsia-500/20 text-fuchsia-200",
  },
  json_parse: {
    border: "border-lime-500/60",
    bg: "bg-gradient-to-br from-lime-500/15 to-lime-900/10",
    icon: "bg-lime-500/20 text-lime-300",
    badge: "bg-lime-500/20 text-lime-200",
  },
  delay: {
    border: "border-slate-500/60",
    bg: "bg-gradient-to-br from-slate-500/15 to-slate-900/10",
    icon: "bg-slate-500/20 text-slate-300",
    badge: "bg-slate-500/20 text-slate-200",
  },
  note: {
    border: "border-yellow-500/40",
    bg: "bg-gradient-to-br from-yellow-500/20 to-amber-900/10",
    icon: "bg-yellow-500/20 text-yellow-200",
    badge: "bg-yellow-500/20 text-yellow-100",
  },
};

function nodePreview(data: NodeData): string | null {
  if (data.nodeType === "note") return data.noteText || "Annotation";
  if (data.nodeType === "agent" && data.instruction)
    return data.instruction.slice(0, 72) + (data.instruction.length > 72 ? "…" : "");
  if (data.nodeType === "router" && data.routes?.length) return `Routes: ${data.routes.join(", ")}`;
  if (data.nodeType === "classifier" && data.categories?.length)
    return `Categories: ${data.categories.join(", ")}`;
  if (data.nodeType === "tool" && data.toolType === "search")
    return `Search · ${data.searchProvider ?? "google"}`;
  if (data.nodeType === "tool" && data.toolType === "http")
    return `${data.httpMethod ?? "GET"} · ${data.httpUrl || "no URL"}`;
  if (data.nodeType === "evaluation" && data.evalPreset) return `Preset: ${data.evalPreset}`;
  if (data.nodeType === "guardrail" && data.rules?.mode)
    return `${data.rules.mode} · ${data.rules.fail_behavior ?? "block"}`;
  if (data.nodeType === "summarizer") return `Style: ${data.summaryStyle ?? "concise"}`;
  if (data.nodeType === "translator") return `→ ${data.targetLanguage ?? "English"}`;
  if (data.nodeType === "extractor" && data.extractFields?.length)
    return `Fields: ${data.extractFields.join(", ")}`;
  if (data.nodeType === "transform" && data.template) return data.template.slice(0, 60);
  if (data.nodeType === "json_parse" && data.jsonPath) return `Path: ${data.jsonPath}`;
  if (data.nodeType === "delay") return `${data.delaySeconds ?? 1}s delay`;
  return null;
}

function resolveIcon(data: NodeData) {
  if (data.nodeType === "tool" && data.toolType === "search") return Search;
  if (data.nodeType === "tool" && data.toolType === "http") return Globe;
  return icons[data.nodeType] ?? Bot;
}

export function BaseNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData & { isActive?: boolean; hasError?: boolean };
  const isNote = nodeData.nodeType === "note";
  const accent = accents[nodeData.nodeType] ?? accents.agent;
  const Icon = resolveIcon(nodeData);
  const preview = nodePreview(nodeData);

  if (isNote) {
    return (
      <div
        className={cn(
          "max-w-[220px] rounded-lg border-2 border-dashed px-4 py-3 shadow-md",
          accent.border,
          accent.bg,
          selected && "ring-2 ring-yellow-400/60"
        )}
      >
        <div className="flex items-start gap-2">
          <StickyNote className="h-4 w-4 shrink-0 text-yellow-300" />
          <div>
            <p className="text-sm font-medium text-yellow-100">{nodeData.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-yellow-200/80">
              {nodeData.noteText || "Add a note…"}
            </p>
          </div>
        </div>
      </div>
    );
  }

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