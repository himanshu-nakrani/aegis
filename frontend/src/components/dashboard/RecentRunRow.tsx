"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useGlowPulse, useReducedMotionStrict } from "@/components/motion";
import { formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";

type Run = {
  id: string;
  workflow_name: string | null;
  status: "completed" | "failed" | "running" | "cancelled" | "pending" | "awaiting_approval";
  duration_ms?: number | null;
  created_at: string;
};

const COLOR_BY_STATUS: Record<Run["status"], string> = {
  completed: "bg-success",
  failed: "bg-destructive",
  running: "bg-warning",
  cancelled: "bg-muted",
  pending: "bg-muted",
  awaiting_approval: "bg-warning",
};

function formatDuration(ms?: number | null): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RecentRunRow({ run }: { run: Run }) {
  const reduce = useReducedMotionStrict();
  const pulse = useGlowPulse("primary");
  const dotClass =
    run.status === "running"
      ? `${COLOR_BY_STATUS.running} ${pulse}`
      : COLOR_BY_STATUS[run.status];
  const row = (
    <Link
      href={`/runs/${run.id}`}
      className="focus-ring group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-transparent bg-transparent px-3 py-3 transition-[border-color,background-color] duration-instant hover:border-border-strong hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_100px_104px]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors group-hover:border-border-strong"
          aria-hidden
        >
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {run.workflow_name ?? "Unnamed"}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <Badge variant={runStatusVariant(run.status)} className="min-h-5 px-2 py-0.5 text-[11px] capitalize">
              {runStatusLabel(run.status)}
            </Badge>
            <span className="text-caption sm:hidden">{formatRelativeTime(run.created_at)}</span>
          </span>
        </span>
      </span>
      <span className="rounded-md border border-border bg-surface-input px-2 py-1 text-right font-mono text-xs font-medium text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:text-left">
        {formatDuration(run.duration_ms)}
      </span>
      <span className="hidden text-right text-xs font-medium text-muted sm:block">
        {formatRelativeTime(run.created_at)}
      </span>
    </Link>
  );
  if (reduce) return row;
  return <motion.div layout="position">{row}</motion.div>;
}
