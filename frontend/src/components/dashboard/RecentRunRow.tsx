"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useGlowPulse } from "@/components/motion";
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

function formatDuration(ms?: number | null): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RecentRunRow({ run }: { run: Run }) {
  const pulse = useGlowPulse("primary");
  const dotClass =
    run.status === "running"
      ? `${COLOR_BY_STATUS.running} ${pulse}`
      : COLOR_BY_STATUS[run.status];
  return (
    <motion.div layout="position">
      <Link
        href={`/runs/${run.id}`}
        className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-instant hover:bg-surface-hover"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-body flex-1 truncate">{run.workflow_name ?? "Unnamed"}</span>
        <span className="text-caption font-mono">{formatDuration(run.duration_ms)}</span>
        <span className="text-caption">{formatRelativeTime(run.created_at)}</span>
      </Link>
    </motion.div>
  );
}