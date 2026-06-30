"use client";

import { memo, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Globe, Loader2, Search, StickyNote } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { NodeData } from "@/types/workflow";
import { getNodeDefinition } from "@/lib/node-registry";
import { cn } from "@/lib/utils";

function nodePreview(data: NodeData): string | null {
  if (data.nodeType === "input_schema" && data.inputFields?.length)
    return `Fields: ${data.inputFields.map((f) => f.key).join(", ")}`;
  if (data.nodeType === "if" && data.ifCondition)
    return `${data.ifCondition.left} ${data.ifCondition.operator} ${data.ifCondition.right ?? ""}`.trim();
  if (data.nodeType === "switch")
    return `Match: ${data.switchValue ?? "{{last_output}}"}`;
  if (data.nodeType === "filter" && data.filterCondition)
    return `Filter: ${data.filterCondition.operator}`;
  if (data.nodeType === "set_fields" && data.setFields)
    return `Set: ${Object.keys(data.setFields).join(", ")}`;
  if (data.nodeType === "trigger") {
    const t = data.triggerType ?? "manual";
    if (t === "schedule" && data.scheduleCron) return `Schedule · ${data.scheduleCron}`;
    return t === "manual" ? "Manual run" : t === "webhook" ? "Webhook trigger" : "Scheduled";
  }
  if (data.nodeType === "end") return data.endDescription || "Final workflow output";
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
  if (data.nodeType === "code" && data.code) return data.code.split("\n")[0].slice(0, 60);
  if (data.nodeType === "memory_store")
    return `Store: ${data.memoryKey ?? "{{input.text}}"}${data.memoryPersistent ? " · persistent" : ""}`;
  if (data.nodeType === "memory_retrieve") return `Get: ${data.memoryKey ?? "{{input.text}}"}`;
  if (data.nodeType === "kb_retrieve")
    return `${data.kbSource === "workflow" ? "Workflow KB" : "Inline"} · ${data.kbQuery ?? "{{last_output}}"}`;
  if (data.nodeType === "human_approval") return "Pauses for review";
  if (data.nodeType === "sub_workflow")
    return data.subWorkflowId ? `→ ${data.subWorkflowId.slice(0, 8)}…` : "Set workflow ID";
  if (data.nodeType === "integration")
    return `${data.integrationType ?? "slack"} · ${data.credentialName ?? "no credential"}`;
  return null;
}

function resolveIcon(data: NodeData) {
  const def = getNodeDefinition(data.nodeType, data.label);
  if (def) return def.icon;
  if (data.nodeType === "tool" && data.toolType === "search") return Search;
  if (data.nodeType === "tool" && data.toolType === "http") return Globe;
  return Bot;
}

function RunningIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mt-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-warning">
      <Loader2 className="h-3 w-3 animate-spin" />
      Running {elapsed}s
    </div>
  );
}

export const BaseNode = memo(function BaseNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData & {
    isActive?: boolean;
    hasError?: boolean;
    errorMessage?: string;
    diffKind?: "added" | "removed" | "changed";
  };
  const isNote = nodeData.nodeType === "note";
  const isTrigger = nodeData.nodeType === "trigger";
  const isEnd = nodeData.nodeType === "end";
  const def = getNodeDefinition(nodeData.nodeType, nodeData.label);
  const accent = def?.accent ?? {
    ring: "border-primary/40",
    label: "text-primary",
    icon: "bg-primary-muted text-primary",
  };
  const Icon = resolveIcon(nodeData);
  const preview = nodePreview(nodeData);

  const nodeShell = (content: React.ReactNode) => {
    const shell = (
      <div
        tabIndex={nodeData.hasError && nodeData.errorMessage ? 0 : undefined}
        className={cn(
          "group min-w-[200px] max-w-[240px] rounded-xl border bg-surface-elevated transition-all duration-150",
          accent.ring,
          selected && "ring-2 ring-primary/50",
          nodeData.isActive && "ring-1 ring-warning",
          nodeData.hasError && "ring-2 ring-destructive",
          nodeData.diffKind === "added" && "ring-2 ring-success/70",
          nodeData.diffKind === "removed" && "ring-2 ring-destructive/70 opacity-80",
          nodeData.diffKind === "changed" && "ring-2 ring-warning/70"
        )}
      >
        {content}
      </div>
    );

    if (nodeData.hasError && nodeData.errorMessage) {
      return (
        <Tooltip content={nodeData.errorMessage} side="top">
          {shell}
        </Tooltip>
      );
    }

    return shell;
  };

  if (isNote) {
    return (
      <div
        className={cn(
          "max-w-[220px] rounded-xl border border-dashed border-border bg-surface-elevated px-4 py-3",
          accent.ring,
        selected && "ring-1 ring-primary",
        nodeData.diffKind === "added" && "ring-2 ring-success/70",
        nodeData.diffKind === "removed" && "ring-2 ring-destructive/70 opacity-80",
        nodeData.diffKind === "changed" && "ring-2 ring-warning/70"
      )}
    >
      <div className="flex items-start gap-2">
          <StickyNote className="h-4 w-4 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-medium text-foreground">{nodeData.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {nodeData.noteText || "Add a note…"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return nodeShell(
    <>
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-border !bg-surface-elevated transition group-hover:!border-primary"
        />
      )}

      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className={cn("rounded-lg p-2", accent.icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{nodeData.label}</p>
            <span
              className={cn(
                "mt-1 inline-block text-[10px] font-medium uppercase tracking-wide",
                accent.label
              )}
            >
              {nodeData.nodeType}
            </span>
          </div>
        </div>

        {preview && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{preview}</p>
        )}

        {nodeData.diffKind && (
          <div
            className={cn(
              "mt-2 font-mono text-[9px] uppercase tracking-widest",
              nodeData.diffKind === "added" && "text-success",
              nodeData.diffKind === "removed" && "text-destructive",
              nodeData.diffKind === "changed" && "text-warning"
            )}
          >
            {nodeData.diffKind}
          </div>
        )}

        {nodeData.isActive && <RunningIndicator />}
      </div>

      {!isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-border !bg-surface-elevated transition group-hover:!border-primary"
        />
      )}
    </>
  );
});