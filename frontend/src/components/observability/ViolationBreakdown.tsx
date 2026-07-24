"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingState } from "@/components/ui/loading-state";
import { queryKeys } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

/** Human label for a guardrail rail type. */
function typeLabel(type: string): string {
  switch (type) {
    case "rules":
      return "keyword rules";
    case "presidio":
      return "PII (presidio)";
    case "prompt_injection":
      return "prompt injection";
    case "moderation":
      return "moderation";
    case "llm":
      return "LLM classifier";
    default:
      return type;
  }
}

function statusTone(status: string): string {
  if (status === "failed") return "text-destructive";
  if (status === "warned") return "text-warning";
  return "text-muted";
}

/**
 * Guardrail violation drill-down: events grouped by rail type (not just
 * severity totals) plus a recent violation log. Extends the Trust dashboard's
 * Safety story from "how many" to "which rail, and where". Chroma is data-only
 * (severity); chrome stays monochrome.
 */
export function ViolationBreakdown() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.guardrailViolations(""),
    queryFn: api.getGuardrailViolations,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <SectionCard title="Guardrail violations" description="By rail type across recent runs">
        <LoadingState variant="list" label="Loading violations…" />
      </SectionCard>
    );
  }

  const windowLabel = `last ${data.runs_scanned.toLocaleString()} runs`;

  return (
    <SectionCard
      title="Guardrail violations"
      description={`By rail type · ${windowLabel}`}
      actions={
        <span className="font-mono text-2xs tabular-nums text-subtle">
          {data.total_violations.toLocaleString()} of {data.total_events.toLocaleString()} events
        </span>
      }
    >
      {data.total_events === 0 ? (
        <p className="text-sm text-subtle">No guardrail events in this window.</p>
      ) : (
        <div className="space-y-5">
          {/* By-type breakdown */}
          <ul className="space-y-2">
            {data.by_type.map((row) => {
              const total = Math.max(row.total, 1);
              return (
                <li key={row.type} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-2xs lowercase text-foreground">
                      {typeLabel(row.type)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5 font-mono text-2xs tabular-nums">
                      {row.warned > 0 && <span className="text-warning">{row.warned} warned</span>}
                      {row.failed > 0 && (
                        <span className="text-destructive">{row.failed} failed</span>
                      )}
                      <span className="text-subtle">{row.total} total</span>
                    </span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-input">
                    <span className="bg-success/60" style={{ width: `${(row.passed / total) * 100}%` }} />
                    <span className="bg-warning/70" style={{ width: `${(row.warned / total) * 100}%` }} />
                    <span
                      className="bg-destructive/70"
                      style={{ width: `${(row.failed / total) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Recent violation log */}
          {data.recent.length > 0 && (
            <div>
              <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-muted">
                Recent violations
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {data.recent.map((v, i) => (
                  <li
                    key={`${v.run_id}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-mono text-2xs uppercase", statusTone(v.status))}>
                          {v.status}
                        </span>
                        <span className="font-mono text-2xs lowercase text-muted">
                          {typeLabel(v.type)}
                        </span>
                        <span className="truncate text-sm text-foreground">
                          {v.workflow || "Workflow"}
                          {v.node_label ? ` · ${v.node_label}` : ""}
                        </span>
                      </div>
                      {v.message && (
                        <p className="mt-0.5 truncate text-xs text-subtle">{v.message}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {v.created_at && (
                        <span className="font-mono text-2xs tabular-nums text-subtle">
                          {formatRelativeTime(v.created_at)}
                        </span>
                      )}
                      <Link
                        href={`/runs/${v.run_id}`}
                        className="focus-ring text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        View run
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
