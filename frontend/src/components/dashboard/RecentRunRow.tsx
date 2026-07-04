"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useGlowPulse, useReducedMotionStrict } from "@/components/motion";
import { formatRelativeTime } from "@/lib/format-date";

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

const LABEL_BY_STATUS: Record<Run["status"], string> = {
  completed: "Completed",
  failed: "Failed",
  running: "Running",
  cancelled: "Cancelled",
  pending: "Pending",
  awaiting_approval: "Approval",
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
      className="focus-ring grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors duration-instant hover:border-border hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_88px_92px]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
          aria-hidden
        >
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {run.workflow_name ?? "Unnamed"}
          </span>
          <span className="text-caption sm:hidden">{formatRelativeTime(run.created_at)}</span>
          <span className="hidden text-caption sm:block">{LABEL_BY_STATUS[run.status]}</span>
        </span>
      </span>
      <span className="text-right font-mono text-xs text-muted sm:text-left">
        {formatDuration(run.duration_ms)}
      </span>
      <span className="hidden text-right text-xs text-muted sm:block">
        {formatRelativeTime(run.created_at)}
      </span>
    </Link>
  );
  if (reduce) return row;
  return <motion.div layout="position">{row}</motion.div>;
}
