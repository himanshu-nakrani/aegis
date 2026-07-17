"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import { formatCostUsd } from "@/lib/format";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import { cn } from "@/lib/utils";
import type { EvalScores, LlmCall, NodeResult } from "@/types/workflow";

interface TraceNodeRowProps {
  node: NodeResult;
  llmCalls: LlmCall[];
  /** node.latency_ms / Σ(latency_ms) — 0..1. */
  durationShare: number;
  /** Whether this is the last row (hides the trailing rail segment). */
  isLast: boolean;
  /** True while the run is still live (pending/running/awaiting_approval). */
  runLive: boolean;
}

/** Maps a node status onto a ring/tint token used on the glyph. */
function statusRing(status: string, runLive: boolean): string {
  const s = status.toLowerCase();
  if (s === "failed" || s === "error") return "ring-2 ring-destructive/60";
  if (s === "running" || s === "pending" || (runLive && s === "in_progress"))
    return "ring-2 ring-warning/60 animate-pulse";
  if (s === "completed" || s === "success" || s === "passed")
    return "ring-2 ring-success/40";
  return "ring-1 ring-border";
}

export function TraceNodeRow({
  node,
  llmCalls,
  durationShare,
  isLast,
  runLive,
}: TraceNodeRowProps) {
  const colorVar = CATEGORY_COLOR_VAR[categorize(node.node_type)];
  const status = node.status?.toLowerCase() ?? "";
  const isFailed = status === "failed" || status === "error";
  const defaultOpen = isFailed || Boolean(node.guardrail_status);
  const nodeCalls = llmCalls.filter((call) => call.node_id === node.node_id);
  const barPct = Math.max(0, Math.min(1, durationShare)) * 100;

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* Left rail: continuous vertical line + glyph */}
      <div className="relative flex w-7 shrink-0 flex-col items-center">
        {!isLast && (
          <span
            aria-hidden
            className="absolute left-1/2 top-7 h-[calc(100%-1rem)] w-px -translate-x-1/2 bg-border"
          />
        )}
        <span
          className={cn(
            "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface",
            statusRing(status, runLive)
          )}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: colorVar }}
          />
        </span>
      </div>

      {/* Row content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">
              {node.node_label}
            </h3>
            <p className="truncate font-mono text-2xs lowercase text-subtle">
              {node.node_type}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {node.latency_ms != null && (
              <span className="font-mono text-2xs text-muted">{node.latency_ms} ms</span>
            )}
            <Badge variant={runStatusVariant(node.status)}>
              {runStatusLabel(node.status)}
            </Badge>
          </div>
        </div>

        {/* Proportional duration bar — shared left edge, share of run time */}
        {node.latency_ms != null && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-input">
              <div
                className="h-1 rounded-full"
                style={{
                  width: `${barPct}%`,
                  minWidth: barPct > 0 ? "2px" : undefined,
                  backgroundColor: `color-mix(in srgb, ${colorVar} 35%, transparent)`,
                }}
              />
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-2xs text-subtle">
              {node.latency_ms} ms
            </span>
          </div>
        )}

        {/* Collapsible payload */}
        <details className="group mt-2" open={defaultOpen}>
          <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded font-mono text-2xs text-subtle transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span>details</span>
          </summary>
          <div className="mt-2 space-y-3 text-sm text-muted">
            {node.output && (
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 leading-6 text-foreground/90">
                {node.output}
              </p>
            )}
            {node.evaluation_scores && (
              <div className="rounded-lg border border-border bg-surface-input p-3">
                <EvalScoresChart
                  scores={node.evaluation_scores as EvalScores}
                  compact
                />
              </div>
            )}
            {node.guardrail_status && (
              <Badge variant={runStatusVariant(node.guardrail_status)}>
                Guardrail: {runStatusLabel(node.guardrail_status)}
              </Badge>
            )}
            {nodeCalls.map((call, callIndex) => (
              <details
                key={call.id}
                className="group/call rounded-lg border border-border bg-surface"
              >
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-mono text-xs text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="h-3 w-3 shrink-0 transition-transform group-open/call:rotate-90"
                    aria-hidden
                  />
                  <span>
                    llm call {callIndex + 1} · {call.model ?? "model"}
                  </span>
                  <span>
                    {call.total_tokens ?? "—"} tok
                    {typeof call.cost_usd === "number" && call.cost_usd > 0
                      ? ` · ${formatCostUsd(call.cost_usd)}`
                      : ""}
                    {call.latency_ms != null ? ` · ${call.latency_ms} ms` : ""}
                  </span>
                </summary>
                <div className="space-y-2 border-t border-border px-3 py-2">
                  {call.prompt_text && (
                    <div>
                      <p className="text-micro mb-1">Prompt</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-xs leading-5 text-foreground/85">
                        {call.prompt_text}
                      </pre>
                    </div>
                  )}
                  {call.completion_text && (
                    <div>
                      <p className="text-micro mb-1">Completion</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-xs leading-5 text-foreground/85">
                        {call.completion_text}
                      </pre>
                    </div>
                  )}
                  <p className="font-mono text-2xs text-subtle">
                    prompt {call.prompt_tokens ?? "—"} · completion{" "}
                    {call.completion_tokens ?? "—"}
                    {call.thinking_tokens
                      ? ` · thinking ${call.thinking_tokens}`
                      : ""}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </details>
      </div>
    </li>
  );
}
