"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { PageEnter, StaggerList } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";

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
          description={`${pluralize(workflows.length, "workflow")} in the workspace.`}
          actions={
            <Link href="/workflows/new">
              <Button>
                <Plus className="h-4 w-4" />
                New workflow
              </Button>
            </Link>
          }
        />

        <div className="dashboard-panel flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
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
              <Link href="/workflows/new">
                <Button>Create workflow</Button>
              </Link>
            }
          />
        ) : (
          <StaggerList className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </StaggerList>
        )}
      </div>
    </PageEnter>
  );
}
