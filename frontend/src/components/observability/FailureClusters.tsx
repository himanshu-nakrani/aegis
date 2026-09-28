"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import { formatRelativeTime } from "@/lib/format-date";
import { humanizeSignature } from "@/lib/format";
import type { ObservabilityErrors } from "@/types/workflow";

interface FailureClustersProps {
  clusters: ObservabilityErrors["clusters"];
  failedRunsScanned: number;
  loading: boolean;
  /** The clusters query failed — never claim the system is clean. */
  error?: boolean;
  onRetry?: () => void;
}

/**
 * Single-column ranked list of failure clusters. One column so the horizontal
 * weight bars share a scale — each bar is count/maxCount of the row width.
 */
export function FailureClusters({
  clusters,
  failedRunsScanned,
  loading,
  error = false,
  onRetry,
}: FailureClustersProps) {
  const ranked = [...clusters].sort((a, b) => b.count - a.count).slice(0, 8);
  const maxCount = ranked.reduce((m, c) => Math.max(m, c.count), 0) || 1;

  return (
    <SectionCard
      title="Failure clusters"
      flush
      actions={
        <span className="font-mono text-2xs text-muted tabular-nums">
          {loading ? "…" : error ? "—" : `${failedRunsScanned} failed scanned`}
        </span>
      }
    >
      {loading ? (
        <div className="px-4 py-6">
          <LoadingState variant="inline" label="Loading clusters…" />
        </div>
      ) : error ? (
        // A failed health check must never render the green all-clear below.
        <div className="p-3">
          {onRetry ? (
            <InlineQueryError message="Couldn't load failure clusters." onRetry={onRetry} />
          ) : (
            <p className="text-sm text-destructive">Couldn&apos;t load failure clusters.</p>
          )}
        </div>
      ) : ranked.length === 0 ? (
        <div className="p-3">
          <EmptyState
            compact
            variant="info"
            icon={CheckCircle2}
            title="No failure clusters"
            description="Nothing failed in the recent window."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {ranked.map((cluster) => {
            const pct = Math.max(4, Math.round((cluster.count / maxCount) * 100));
            return (
              <li key={cluster.signature}>
                <Link
                  href={`/runs/${cluster.sample_run_id}`}
                  className="focus-ring flex gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <span className="shrink-0 pt-0.5 font-mono text-xs font-semibold text-destructive tabular-nums">
                    {cluster.count}×
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {humanizeSignature(cluster.signature)}
                    </span>
                    <span
                      className="mt-0.5 block truncate font-mono text-2xs text-subtle"
                      title={cluster.signature}
                    >
                      {cluster.signature}
                    </span>
                    <span
                      className="mt-1.5 block h-1 rounded-full bg-destructive/50"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                    <span className="mt-1 block truncate text-2xs text-subtle">
                      {(cluster.workflows || []).slice(0, 3).join(", ")}
                      {cluster.last_seen
                        ? ` · ${formatRelativeTime(cluster.last_seen)}`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
