"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { HoverLift } from "@/components/motion";
import { pluralize } from "@/lib/format";
import { formatRelativeTime } from "@/lib/format-date";

type Workflow = {
  id: string;
  name: string;
  description?: string | null;
  last_run_at?: string | null;
  last_run_status?: "completed" | "failed" | "running" | "cancelled" | "pending" | null;
  runs_this_week?: number;
};

type Props = {
  workflow: Workflow;
};

const DOT_BY_STATUS: Record<string, string> = {
  completed: "bg-success",
  failed: "bg-destructive",
  running: "bg-warning",
  cancelled: "bg-muted",
  pending: "bg-muted",
};

export function WorkflowCard({ workflow }: Props) {
  const dot = workflow.last_run_status
    ? (DOT_BY_STATUS[workflow.last_run_status] ?? "bg-muted")
    : "bg-muted";
  return (
    <Link href={`/workflows/${workflow.id}/edit`} className="group block">
      <HoverLift>
        <GlassCard className="relative overflow-hidden p-4">
          <span
            className="absolute left-0 top-0 h-0.5 w-0 bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-fast group-hover:w-full"
            aria-hidden
          />
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-body-lg truncate font-semibold">{workflow.name}</h3>
          </div>
          {workflow.description && (
            <p className="text-caption mt-1 line-clamp-1">{workflow.description}</p>
          )}
          <div className="text-caption mt-3 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              {workflow.last_run_at
                ? `Last run: ${formatRelativeTime(workflow.last_run_at)}`
                : "No runs yet"}
            </span>
            {workflow.runs_this_week !== undefined && (
              <>
                <span className="text-subtle">•</span>
                <span>{pluralize(workflow.runs_this_week, "run")} this week</span>
              </>
            )}
          </div>
        </GlassCard>
      </HoverLift>
    </Link>
  );
}