"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, GitBranch, PlayCircle } from "lucide-react";
import { HoverLift } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { pluralize } from "@/lib/format";
import { formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";

type Workflow = {
  id: string;
  name: string;
  description?: string | null;
  last_run_at?: string | null;
  last_run_status?: "completed" | "failed" | "running" | "cancelled" | "pending" | null;
  runs_this_week?: number;
  version_count?: number;
  latest_version_number?: number | null;
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
  const status = workflow.last_run_status;

  return (
    <Link href={`/workflows/${workflow.id}/edit`} className="group block rounded-xl focus-ring">
      <HoverLift>
        <GlassCard className="relative overflow-hidden p-0 transition-colors duration-fast group-hover:border-border-strong group-hover:bg-surface-hover">
          <span
            className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary-400 via-accent-400 to-success"
            aria-hidden
          />
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 pl-5">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">{workflow.name}</h3>
              {workflow.description && (
                <p className="text-caption mt-1 line-clamp-1">{workflow.description}</p>
              )}
            </div>
            <span className="rounded-lg border border-border bg-surface-input p-2 text-subtle transition-colors group-hover:text-primary">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="space-y-3 px-4 py-3 pl-5">
            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <Badge variant={runStatusVariant(status)}>
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {runStatusLabel(status)}
                </Badge>
              ) : (
                <Badge variant="outline">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  No runs
                </Badge>
              )}
              {workflow.latest_version_number != null && (
                <Badge variant="outline">v{workflow.latest_version_number}</Badge>
              )}
            </div>
            <div className="grid gap-2 text-caption min-[420px]:grid-cols-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-input px-2 py-1">
                <Clock3 className="h-3.5 w-3.5 text-accent" />
                {workflow.last_run_at ? formatRelativeTime(workflow.last_run_at) : "Awaiting first run"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-input px-2 py-1">
                <PlayCircle className="h-3.5 w-3.5 text-primary" />
                {workflow.runs_this_week !== undefined
                  ? `${pluralize(workflow.runs_this_week, "run")} this week`
                  : "Run history pending"}
              </span>
              {workflow.version_count !== undefined && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-input px-2 py-1 min-[420px]:col-span-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted" />
                  {pluralize(workflow.version_count, "version")}
                </span>
              )}
            </div>
          </div>
        </GlassCard>
      </HoverLift>
    </Link>
  );
}
