"use client";

import { useState } from "react";
import { ChevronRight, Crosshair, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import { formatCostUsd, formatDurationMs, formatTokens } from "@/lib/format";
import {
  evalScoreTone,
  guardrailStatusTone,
  isFiveScale,
  runStatusLabel,
  runStatusRingClass,
  runStatusVariant,
} from "@/lib/run-status";
import { cn } from "@/lib/utils";
import type { RunSpan } from "@/lib/api";
import type { EvalScores, LlmCall, NodeResult } from "@/types/workflow";

/** Geometry for a single span on the shared time axis (0..100, %). */
export interface TraceBarGeometry {
  /** Left edge as a percentage of total run duration. */
  leftPct: number;
  /** Bar width as a percentage of total run duration (already floored). */
  widthPct: number;
  /** Real span duration in ms (from the timeline endpoint), if known. */
  durationMs: number | null;
  /** Start offset in ms from run start, if known. */
  startOffsetMs: number | null;
}

interface TraceNodeRowProps {
  node: NodeResult;
  llmCalls: LlmCall[];
  /** Span placement on the shared left-to-right time axis. */
  geometry: TraceBarGeometry;
  /** Nested child spans (llm_call / tool_call) under this node, from the trace
   *  tree — the agent-step drill-down. Undefined until the trace loads. */
  childSpans?: RunSpan[];
  /** Whether this is the last row (hides the trailing rail segment). */
  isLast: boolean;
  /** True while the run is still live (pending/running/awaiting_approval). */
  runLive: boolean;
  /** Optional: focus/select this node on the canvas. Control renders only when set. */
  onJumpToNode?: (nodeId: string) => void;
}

/** Node status → glyph ring. Hue comes from the canonical status map; this row
 *  owns the ring width and the live pulse (only while the run is still live —
 *  a node stuck at "running" on a finished run shouldn't keep breathing). */
function statusRing(status: string, runLive: boolean): string {
  const s = status.toLowerCase();
  const live = runLive && (s === "running" || s === "pending" || s === "queued");
  return cn(
    "ring-1",
    live && "ring-2 animate-pulse",
    runStatusRingClass(status)
  );
}

/** Aggregate eval score if the node carries one — no recompute, so we never
 *  invent a number the judge didn't return. Every producer in this app emits a
 *  1..5 aggregate (LLM judge: weighted mean of 1–5 dimensions; deterministic:
 *  1 + match×4), so 1.0 is a floor, not a perfect score. */
function evalAggregate(scores: NodeResult["evaluation_scores"]): number | null {
  if (!scores || typeof scores !== "object") return null;
  const agg = scores["aggregate"];
  return typeof agg === "number" && Number.isFinite(agg) ? agg : null;
}

/** Self-describing chip copy: "3.40/5" for judge scores, bare ratio otherwise. */
function evalLabel(score: number): string {
  return `${score.toFixed(2)}${isFiveScale(score) ? "/5" : ""}`;
}

export function TraceNodeRow({
  node,
  llmCalls,
  geometry,
  childSpans,
  isLast,
  runLive,
  onJumpToNode,
}: TraceNodeRowProps) {
  const colorVar = CATEGORY_COLOR_VAR[categorize(node.node_type)];
  const status = node.status?.toLowerCase() ?? "";
  const isFailed = status === "failed" || status === "error";
  const [open, setOpen] = useState(isFailed || Boolean(node.guardrail_status));
  const nodeCalls = llmCalls.filter((call) => call.node_id === node.node_id);
  const steps = childSpans ?? [];

  const leftPct = Math.max(0, Math.min(100, geometry.leftPct));
  // Keep the bar inside the axis: clamp width to the remaining track.
  const widthPct = Math.max(0, Math.min(100 - leftPct, geometry.widthPct));
  // Prefer the timeline's real span duration; fall back to the node's latency.
  const durationMs = geometry.durationMs ?? node.latency_ms ?? null;

  // Glass-box overlay: quality + safety + cost carried inline on the span.
  const evalScore = evalAggregate(node.evaluation_scores);
  const guardrail = node.guardrail_status ?? null;
  const rawCost = node.token_usage?.cost_usd;
  const nodeCost = typeof rawCost === "number" && rawCost > 0 ? rawCost : null;

  const running = runLive && status === "running";

  return (
    /* One lane per node: rail | identity | shared-axis track | meta. Column
       widths mirror the axis insets in TraceTimeline (--tl-left / --tl-meta). */
    <li className="group/lane relative grid grid-cols-[1.75rem_11rem_minmax(0,1fr)_7.5rem] gap-x-3 pb-3 last:pb-0">
      {/* Rail: status glyph + continuous connector into the next lane */}
      <div className="relative row-span-2 flex flex-col items-center">
        {!isLast && (
          <span
            aria-hidden
            className="absolute left-1/2 top-7 bottom-0 w-px -translate-x-1/2 bg-border"
          />
        )}
        <span
          className={cn(
            "relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface",
            statusRing(status, runLive)
          )}
        >
          {/* Category hue stays a <=2px rule: a hollow ring, never a fill. */}
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ boxShadow: `0 0 0 2px ${colorVar}` }}
          />
        </span>
      </div>

      {/* Identity column: label, type, status, quality/safety/cost chips */}
      <div className="min-w-0 py-0.5">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-medium text-foreground">
            {node.node_label}
          </h3>
          <Badge variant={runStatusVariant(node.status)} className="shrink-0">
            {runStatusLabel(node.status)}
          </Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-2xs lowercase text-subtle">
            {node.node_type}
          </span>
          {evalScore != null && (
            <Chip
              tone={evalScoreTone(evalScore, isFiveScale(evalScore) ? "five" : "unit")}
              title={`Evaluation aggregate ${evalLabel(evalScore)}`}
            >
              eval {evalLabel(evalScore)}
            </Chip>
          )}
          {guardrail && (
            <Chip
              tone={guardrailStatusTone(guardrail)}
              title={`Guardrail: ${runStatusLabel(guardrail)}`}
            >
              {guardrailStatusTone(guardrail) === "destructive" ? (
                <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
              )}
              {runStatusLabel(guardrail)}
            </Chip>
          )}
          {nodeCost != null && (
            <span
              title="Node cost"
              className="font-mono text-2xs tabular-nums text-subtle"
            >
              {formatCostUsd(nodeCost)}
            </span>
          )}
        </div>
      </div>

      {/* Track column: the span on the shared axis, vertically centered on the
          lane's first line so bars align across rows like a waterfall. */}
      <div
        className="relative mt-[9px] h-1.5 self-start overflow-hidden rounded-full bg-surface-input"
        title={
          geometry.startOffsetMs != null
            ? `starts +${formatDurationMs(geometry.startOffsetMs)} · runs ${formatDurationMs(durationMs)}`
            : undefined
        }
      >
        {/* Idle segment: dashed hairline from axis start to the bar's left
            edge — a late-starting node reads as waiting, not missing. */}
        {leftPct > 1 && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 opacity-60"
            style={{
              width: `${leftPct}%`,
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--muted) 0 3px, transparent 3px 8px)",
            }}
          />
        )}
        <div
          className={cn(
            "absolute inset-y-0 rounded-full",
            running && "animate-pulse",
            isFailed ? "bg-destructive/50" : "bg-foreground/30"
          )}
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            minWidth: "2px",
          }}
        >
          {/* Category hue as a <=2px left rule on the bar */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-0.5 rounded-l-full"
            style={{ backgroundColor: colorVar }}
          />
        </div>
      </div>

      {/* Meta column: duration + expand + jump, fixed width so every lane's
          track ends on the same right rule as the axis. */}
      <div className="flex items-center justify-end gap-1 py-0.5">
        <span
          className={cn(
            "shrink-0 text-right font-mono text-2xs tabular-nums",
            isFailed ? "text-destructive" : "text-subtle"
          )}
        >
          {durationMs === 0 ? "instant" : formatDurationMs(durationMs)}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${node.node_label} details`}
          className="focus-ring rounded p-1 text-subtle transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
        {onJumpToNode && (
          <button
            type="button"
            onClick={() => onJumpToNode(node.node_id)}
            title="Jump to node on canvas"
            aria-label={`Jump to ${node.node_label} on canvas`}
            className="focus-ring rounded p-1 text-subtle transition-colors hover:text-foreground"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Expanded payload spans the lane below the row. */}
      {open && (
        <div className="col-start-2 col-end-[-1] mt-2 space-y-3 pb-1 text-sm text-muted">
          {geometry.startOffsetMs != null && geometry.startOffsetMs > 0 && (
            <p className="font-mono text-2xs tabular-nums text-subtle">
              idle {formatDurationMs(geometry.startOffsetMs)} before start
            </p>
          )}
          {steps.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-input p-2.5">
              <p className="mb-2 font-mono text-2xs uppercase tracking-wide text-subtle">
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </p>
              <ol className="space-y-1.5">
                {steps.map((sp) => {
                  const nodeWindow = Math.max(
                    geometry.durationMs ?? node.latency_ms ?? 0,
                    1
                  );
                  const nodeOffset = geometry.startOffsetMs ?? 0;
                  const rel = Math.max(0, (sp.offset_ms ?? nodeOffset) - nodeOffset);
                  const spLeft = Math.min(100, (rel / nodeWindow) * 100);
                  const spWidth = Math.max(
                    2,
                    Math.min(100 - spLeft, ((sp.duration_ms ?? 0) / nodeWindow) * 100)
                  );
                  const isTool = sp.kind === "tool_call";
                  const spFailed = sp.status === "failed" || sp.status === "error" || sp.status === "blocked";
                  const cost =
                    typeof sp.cost_usd === "number" && sp.cost_usd > 0
                      ? formatCostUsd(sp.cost_usd)
                      : null;
                  const tokens = sp.tokens?.total ?? null;
                  const attrs = sp.attributes ?? {};
                  return (
                    <li key={sp.id} className="font-mono text-2xs">
                      <details className="group/step">
                        <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                          <ChevronRight
                            className="h-3 w-3 shrink-0 text-subtle transition-transform group-open/step:rotate-90"
                            aria-hidden
                          />
                          <span className="shrink-0 rounded bg-surface px-1 py-0.5 text-micro uppercase text-subtle">
                            {isTool ? "tool" : "llm"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-muted">
                            {sp.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-subtle">
                            {formatDurationMs(sp.duration_ms)}
                            {tokens != null ? ` · ${formatTokens(tokens)} tok` : ""}
                            {cost ? ` · ${cost}` : ""}
                          </span>
                        </summary>
                        <div className="ml-5 mt-1 h-1 overflow-hidden rounded-full bg-surface">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              spFailed ? "bg-destructive/45" : "bg-foreground/25"
                            )}
                            style={{ marginLeft: `${spLeft}%`, width: `${spWidth}%` }}
                          />
                        </div>
                        <div className="ml-5 mt-1.5 space-y-1">
                          {typeof attrs.args === "string" && (
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs leading-5 text-foreground/80">
                              args: {attrs.args}
                            </pre>
                          )}
                          {typeof attrs.result === "string" && (
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs leading-5 text-foreground/80">
                              result: {attrs.result}
                            </pre>
                          )}
                          {typeof attrs.error === "string" && (
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-destructive/30 bg-background p-2 text-xs leading-5 text-destructive">
                              {attrs.error}
                            </pre>
                          )}
                          {typeof attrs.completion === "string" && (
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs leading-5 text-foreground/80">
                              {attrs.completion}
                            </pre>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {isFailed && node.output && (
            <div>
              <p className="text-micro mb-1 font-mono uppercase tracking-wide text-destructive">error</p>
              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-background p-3 leading-6 text-destructive">
                {node.output}
              </p>
            </div>
          )}
          {!isFailed && node.output && (
            <div>
              <p className="text-micro mb-1 font-mono uppercase tracking-wide text-subtle">output</p>
              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 leading-6 text-foreground/90">
                {node.output}
              </p>
            </div>
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
                <span className="tabular-nums">
                  {formatTokens(call.total_tokens)} tok
                  {typeof call.cost_usd === "number" && call.cost_usd > 0
                    ? ` · ${formatCostUsd(call.cost_usd)}`
                    : ""}
                  {call.latency_ms != null
                    ? ` · ${formatDurationMs(call.latency_ms)}`
                    : ""}
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
                <p className="font-mono text-2xs tabular-nums text-subtle">
                  prompt {formatTokens(call.prompt_tokens)} · completion{" "}
                  {formatTokens(call.completion_tokens)}
                  {call.thinking_tokens
                    ? ` · thinking ${formatTokens(call.thinking_tokens)}`
                    : ""}
                </p>
              </div>
            </details>
          ))}
        </div>
      )}
    </li>
  );
}
