"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Plus, Search, Workflow } from "lucide-react";
import { PageEnter } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HomePage() {
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
    retry: 1,
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

  if (isLoading) {
    return <LoadingState label="Loading workflows…" />;
  }

  if (isError) {
    return (
      <PageEnter>
        <div className="page-container">
          <ApiConnectionState
            description="The workflow list could not load. Check the API target, then retry."
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
          description="Build, run, and observe agent workflows — with guardrails and evals built in."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/templates">
                  <LayoutTemplate className="h-4 w-4" />
                  Templates
                </Link>
              </Button>
              <Button asChild>
                <Link href="/workflows/new">
                  <Plus className="h-4 w-4" />
                  New workflow
                </Link>
              </Button>
            </div>
          }
        />

        <div className="flex items-center justify-between gap-3">
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
          <p className="shrink-0 font-mono text-xs text-muted">
            {filtered.length} of {workflows.length}
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title={workflows.length === 0 ? "No workflows yet" : "No matching workflows"}
            description={
              workflows.length === 0
                ? "Create your first workflow on the visual canvas, or start from a template."
                : "Try a different search term."
            }
            action={
              <div className="flex items-center gap-2">
                <Button asChild>
                  <Link href="/workflows/new">Create workflow</Link>
                </Button>
                {workflows.length === 0 && (
                  <Button asChild variant="outline">
                    <Link href="/templates">Browse templates</Link>
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <div className="panel divide-y divide-border overflow-hidden">
            {filtered.map((workflow) => (
              <ListRow key={workflow.id} href={`/workflows/${workflow.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{workflow.name}</p>
                    {workflow.published && (
                      <span className="shrink-0 rounded border border-success/30 bg-success/10 px-1.5 py-px font-mono text-[10px] text-success">
                        published
                      </span>
                    )}
                    {workflow.is_external && (
                      <span className="shrink-0 rounded border border-border bg-surface-input px-1.5 py-px font-mono text-[10px] text-muted">
                        external
                      </span>
                    )}
                  </div>
                  {workflow.description && !workflow.is_external && (
                    <p className="mt-0.5 truncate text-xs text-muted">{workflow.description}</p>
                  )}
                </div>
                <div className="hidden shrink-0 items-center gap-4 font-mono text-xs text-muted sm:flex">
                  <span>
                    {workflow.latest_version_number != null
                      ? `v${workflow.latest_version_number}`
                      : "unsaved"}
                  </span>
                  <span className="w-24 text-right">{formatDate(workflow.updated_at)}</span>
                </div>
              </ListRow>
            ))}
          </div>
        )}
      </div>
    </PageEnter>
  );
}
