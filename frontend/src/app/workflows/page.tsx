"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { PageEnter, StaggerList } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";

export default function WorkflowsPage() {
  const [search, setSearch] = useState("");
  const { data: workflows = [], isLoading } = useQuery({
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

  return (
    <PageEnter>
      <div className="page-container">
        <PageHeader
          title="Workflows"
          description="Build and manage agent pipelines on the visual canvas."
          actions={
            <Link href="/workflows/new">
              <Button>
                <Plus className="h-4 w-4" />
                New workflow
              </Button>
            </Link>
          }
        />

        <div className="relative mt-6 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows…"
            className="pl-9"
            aria-label="Search workflows"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-8"
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