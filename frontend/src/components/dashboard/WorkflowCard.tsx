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
    <Link href={`/workflows/${workflow.id}/edit`} className="group block h-full rounded-lg focus-ring">
      <HoverLift>
        <GlassCard className="relative h-full overflow-hidden p-0 transition-colors duration-fast group-hover:border-border-strong group-hover:bg-surface-hover">
          <span
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary-400 via-accent-400 to-transparent"
            aria-hidden
          />
          <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-input/40 px-4 py-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                <h3 className="truncate text-sm font-semibold leading-5 text-foreground">
                  {workflow.name}
                </h3>
              </div>
              {workflow.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                  {workflow.description}
                </p>
              )}
            </div>
            <span className="rounded-lg border border-border bg-surface-input p-2 text-subtle shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors group-hover:border-primary/30 group-hover:text-primary">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="space-y-4 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {status ? (
                <Badge variant={runStatusVariant(status)}>
                  {runStatusLabel(status)}
                </Badge>
              ) : (
                <Badge variant="outline">No runs</Badge>
              )}
              {workflow.latest_version_number != null && (
                <Badge variant="outline">v{workflow.latest_version_number}</Badge>
              )}
            </div>
            <div className="grid gap-3 border-t border-border pt-4 text-caption min-[420px]:grid-cols-2">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Clock3 className="h-3.5 w-3.5 text-accent" />
                <span className="truncate">
                  {workflow.last_run_at ? formatRelativeTime(workflow.last_run_at) : "Awaiting first run"}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-2">
                <PlayCircle className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">
                  {workflow.runs_this_week !== undefined
                    ? `${pluralize(workflow.runs_this_week, "run")} this week`
                    : "Run history pending"}
                </span>
              </span>
              {workflow.version_count !== undefined && (
                <span className="inline-flex min-w-0 items-center gap-2 min-[420px]:col-span-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted" />
                  <span className="truncate">{pluralize(workflow.version_count, "version")}</span>
                </span>
              )}
            </div>
          </div>
        </GlassCard>
      </HoverLift>
    </Link>
  );
}
