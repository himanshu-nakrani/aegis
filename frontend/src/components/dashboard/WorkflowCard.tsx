"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
    <Link href={`/workflows/${workflow.id}/edit`} className="group block rounded-lg focus-ring">
      <HoverLift>
        <div className="relative overflow-hidden rounded-lg border border-border bg-surface-input p-4 transition-colors duration-fast group-hover:border-border-strong group-hover:bg-surface-hover">
          <span
            className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary-400 to-accent-400"
            aria-hidden
          />
          <div className="flex items-start justify-between gap-3 pl-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">{workflow.name}</h3>
              {workflow.description && (
                <p className="text-caption mt-1 line-clamp-1">{workflow.description}</p>
              )}
            </div>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-primary" />
          </div>
          <div className="text-caption mt-3 flex flex-wrap items-center gap-3 pl-2">
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
        </div>
      </HoverLift>
    </Link>
  );
}
