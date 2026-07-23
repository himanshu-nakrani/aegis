"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RunNodeResultCardProps {
  position: { x: number; y: number };
  nodeLabel: string;
  status: string;
  output?: string | null;
  latencyMs?: number | null;
}

const CARD_WIDTH = 252;
const CARD_HEIGHT = 190;

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_") || "pending";
}

function fieldsFrom(output?: string | null): Array<[string, string]> {
  if (!output?.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .slice(0, 3)
        .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]);
    }
  } catch {
    // Plain-text outputs are still useful; fall through to a concise preview.
  }

  return [["result", output.replace(/\s+/g, " ").trim().slice(0, 112)]];
}

function statusTone(status: string): string {
  if (status === "failed" || status === "error" || status === "cancelled") {
    return "border-destructive/55 shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_22%,transparent)]";
  }
  if (status === "running" || status === "awaiting_approval") {
    return "border-active/60 shadow-[0_0_0_1px_color-mix(in_srgb,var(--active)_22%,transparent)]";
  }
  return "border-border-strong shadow-elev-2";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin text-active" aria-hidden />;
  if (status === "failed" || status === "error" || status === "cancelled") {
    return <AlertCircle className="h-3 w-3 text-destructive" aria-hidden />;
  }
  if (status === "completed" || status === "success" || status === "passed") {
    return <Check className="h-3 w-3 text-success" aria-hidden />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-subtle" aria-hidden />;
}

/**
 * Read-only result tethered to the selected runtime stage. It intentionally
 * avoids the authoring actions in NodeOutputPeek so Run Lens keeps one focused
 * graph-to-telemetry cue without turning the graph back into an editor.
 */
export function RunNodeResultCard({
  position,
  nodeLabel,
  status: rawStatus,
  output,
  latencyMs,
}: RunNodeResultCardProps) {
  const status = normalizeStatus(rawStatus);
  const fields = fieldsFrom(output);
  const viewportWidth = typeof window === "undefined" ? CARD_WIDTH + 24 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? CARD_HEIGHT + 24 : window.innerHeight;
  const left = Math.max(12, Math.min(position.x, viewportWidth - CARD_WIDTH - 12));
  const top = Math.max(12, Math.min(position.y, viewportHeight - CARD_HEIGHT - 12));

  return (
    <section
      aria-label={`${nodeLabel} runtime result`}
      className={cn(
        "pointer-events-none fixed z-20 w-[252px] rounded-lg border bg-surface-elevated/95 px-3 py-3 backdrop-blur-sm",
        statusTone(status)
      )}
      style={{ left, top }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="truncate text-xs font-medium text-foreground">{nodeLabel} result</span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-2xs capitalize text-muted">
          <StatusIcon status={status} />
          {status.replace(/_/g, " ")}
        </span>
      </div>

      {fields.length > 0 ? (
        <dl className="space-y-1.5 font-mono text-2xs leading-4">
          {fields.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2">
              <dt className="truncate text-subtle">{key}</dt>
              <dd className="truncate text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="font-mono text-2xs leading-5 text-subtle">
          {status === "running" ? "Evaluating stage…" : "No output captured."}
        </p>
      )}

      {latencyMs != null && (
        <div className="mt-2 border-t border-border pt-2 font-mono text-2xs tabular-nums text-muted">
          {latencyMs < 1000 ? `${Math.round(latencyMs)}ms` : `${(latencyMs / 1000).toFixed(2)}s`}
        </div>
      )}
    </section>
  );
}
