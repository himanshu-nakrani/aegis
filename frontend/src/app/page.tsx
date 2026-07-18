"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Plus, Search, Workflow } from "lucide-react";
import { PageEnter } from "@/components/motion";
import { FirstRunHero } from "@/components/home/FirstRunHero";
import { HomeOverviewStrip } from "@/components/home/HomeOverviewStrip";
import { PublishLifecycleBoard } from "@/components/home/PublishLifecycleBoard";
import { RecentActivityRail } from "@/components/home/RecentActivityRail";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { partitionByLifecycle } from "@/lib/workflow-lifecycle";

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

  const columns = useMemo(() => partitionByLifecycle(filtered), [filtered]);

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

  const isEmptyLibrary = workflows.length === 0;
  const isEmptySearch = !isEmptyLibrary && filtered.length === 0;

  return (
    <PageEnter>
      <div className="page-container space-y-6">
        <PageHeader
          title="Workflows"
          description="Version and publish agent graphs — drafts, review, then live."
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/templates">
                  <LayoutTemplate className="h-4 w-4" />
                  Templates
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/workflows/new">
                  <Plus className="h-4 w-4" />
                  New workflow
                </Link>
              </Button>
            </>
          }
        />

        {!isEmptyLibrary && <HomeOverviewStrip workflows={workflows} />}

        {!isEmptyLibrary && (
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workflows…"
                className="pl-9"
                aria-label="Search workflows"
              />
            </div>
            <p className="shrink-0 font-mono text-xs text-muted tabular-nums">
              {filtered.length}
              <span className="text-subtle"> / </span>
              {workflows.length}
            </p>
          </div>
        )}

        {isEmptyLibrary ? (
          <FirstRunHero
            fallback={
              <EmptyState
                icon={Workflow}
                title="No workflows yet"
                description="Create a graph on the canvas, save a version, then publish when it is ready to serve."
                action={
                  <div className="flex items-center gap-2">
                    <Button asChild>
                      <Link href="/workflows/new">New workflow</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/templates">Browse templates</Link>
                    </Button>
                  </div>
                }
              />
            }
          />
        ) : isEmptySearch ? (
          <EmptyState
            icon={Search}
            title="No matching workflows"
            description="Try a different search term."
            compact
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <PublishLifecycleBoard columns={columns} />
            <RecentActivityRail />
          </div>
        )}
      </div>
    </PageEnter>
  );
}
