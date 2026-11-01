"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { NumberTween } from "@/components/motion";
import { InlineQueryError } from "@/components/ui/inline-error";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { rateTone, toneTextClass } from "@/lib/run-status";
import { partitionByLifecycle } from "@/lib/workflow-lifecycle";
import { cn } from "@/lib/utils";
import type { WorkflowListItem } from "@/types/workflow";

function Metric({ href, label, value, detail, className }: {
  href: string;
  label: string;
  value: React.ReactNode;
  detail: string;
  className?: string;
}) {
  return (
    <Link href={href} className="focus-ring group min-w-0 rounded-md px-1 py-4 transition-colors hover:bg-surface-hover sm:px-5 sm:py-5 sm:first:pl-0">
      <span className="block text-xs text-muted">{label}</span>
      <span className={cn("mt-2 block font-mono text-title tabular-nums text-foreground", className)}>{value}</span>
      <span className="mt-1 block truncate text-2xs text-subtle">{detail}</span>
    </Link>
  );
}

export function HomePulseBar({ workflows }: { workflows: WorkflowListItem[] }) {
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.observabilitySummary,
    queryFn: api.getObservabilitySummary,
    retry: 1,
    staleTime: 30_000,
  });
  const summary = isError ? undefined : data;
  const stages = partitionByLifecycle(workflows);
  const passRate = summary?.quality.eval_pass_rate ?? null;
  const evalCount = summary?.quality.eval_run_count ?? 0;
  const passTone = passRate == null ? null : rateTone(passRate, "high-good", [0.8, 0.5]);
  const pending = isError ? "Unavailable" : "Loading…";

  return (
    <div role="group" aria-label="Workspace health" className="space-y-3">
      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 [&>a:nth-child(even)]:border-l [&>a:nth-child(even)]:border-border sm:[&>a+a]:border-l sm:[&>a+a]:border-border">
        <Metric href="#library" label="Workflows" value={<NumberTween value={workflows.length} />} detail={`${stages.published.length} live · ${stages.in_review.length} in review · ${stages.draft.length} draft`} />
        <Metric href="/observability" label="Total runs" value={summary ? <NumberTween value={summary.run_count} /> : "—"} detail={summary ? "Across all workflows" : pending} />
        <Metric href="/observability" label="Active runs" value={summary ? <NumberTween value={summary.active_runs} /> : "—"} detail={summary ? (summary.active_runs > 0 ? "Running now" : "No runs in progress") : pending} className={summary && summary.active_runs > 0 ? "text-active" : undefined} />
        <Metric href="/observability" label="Eval pass rate" value={summary && passRate != null ? <NumberTween value={passRate * 100} suffix="%" /> : "—"} detail={summary ? (passRate == null && evalCount > 0 ? `${evalCount} scored · no thresholds set` : evalCount > 0 ? `${evalCount} evaluated runs` : "No evaluated runs yet") : pending} className={passTone ? toneTextClass(passTone) : undefined} />
      </div>
      {isError && <InlineQueryError message="Workspace metrics are unavailable." onRetry={() => void refetch()} />}
    </div>
  );
}
