"use client";

import Link from "next/link";
import { type ComponentType, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Layers3, Plus, Search, Workflow } from "lucide-react";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { PageEnter, StaggerList } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";

function WorkflowSignal({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-micro">{label}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-caption">{detail}</p>
        </div>
        <span className="rounded-lg border border-border bg-surface-input p-2 text-accent">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </GlassCard>
  );
}

export default function WorkflowsPage() {
  const [search, setSearch] = useState("");
  const {
    data: workflows = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description || "").toLowerCase().includes(q)
    );
  }, [workflows, search]);

  const totalVersions = useMemo(
    () => workflows.reduce((sum, workflow) => sum + (workflow.version_count || 0), 0),
    [workflows]
  );

  if (isLoading) {
    return <LoadingState label="Loading workflows…" />;
  }

  if (isError) {
    return (
      <PageEnter>
        <div className="page-container">
          <ApiConnectionState
            description="The workflow index could not load. Check the API target, then retry."
            error={error}
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      </PageEnter>
    );
  }

  return (
    <PageEnter>
      <div className="page-container space-y-6">
        <PageHeader
          title="Workflows"
          description="Build, version, and operate production agent workflows from one workspace."
          actions={
            <Button asChild>
              <Link href="/workflows/new">
                <Plus className="h-4 w-4" />
                New workflow
              </Link>
            </Button>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <WorkflowSignal
            icon={Workflow}
            label="Workspace"
            value={String(workflows.length)}
            detail="Total workflows"
          />
          <WorkflowSignal
            icon={GitBranch}
            label="Versions"
            value={String(totalVersions)}
            detail="Saved graph revisions"
          />
          <WorkflowSignal
            icon={Layers3}
            label="Filtered view"
            value={String(filtered.length)}
            detail={search.trim() ? "Matching workflows" : "Ready to scan"}
          />
        </div>

        <div className="dashboard-panel flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="pl-9"
              aria-label="Search workflows"
            />
          </div>
          <p className="text-caption">
            Showing {filtered.length} of {workflows.length}
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={workflows.length === 0 ? "No workflows yet" : "No matching workflows"}
            description={
              workflows.length === 0
                ? "Create your first workflow on the visual canvas."
                : "Try a different search term."
            }
            action={
              <Button asChild>
                <Link href="/workflows/new">Create workflow</Link>
              </Button>
            }
          />
        ) : (
          <StaggerList className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" itemClassName="h-full">
            {filtered.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </StaggerList>
        )}
      </div>
    </PageEnter>
  );
}
