"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Plus, Search, Workflow } from "lucide-react";
import { ContinueTiles } from "@/components/home/ContinueTiles";
import { FirstRunHero } from "@/components/home/FirstRunHero";
import { HomePulseBar } from "@/components/home/HomePulseBar";
import { NextActionsPanel } from "@/components/home/NextActionsPanel";
import { PinnedPanel } from "@/components/home/PinnedPanel";
import { RecentActivityRail } from "@/components/home/RecentActivityRail";
import { WorkflowLibraryList } from "@/components/home/WorkflowLibraryList";
import { PageEnter } from "@/components/motion";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useNow } from "@/hooks/use-now";
import { usePinnedWorkflows } from "@/hooks/use-pinned-workflows";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-date";
import {
  buildDeskStatusLine,
  buildNextActions,
  type RecentRunRow,
} from "@/lib/home-desk";
import { getRecentWorkflows, type RecentWorkflow } from "@/lib/recent-workflows";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowListItem } from "@/types/workflow";

const CONTINUE_MAX = 3;

function buildContinueItems(
  workflows: WorkflowListItem[],
  recentVisits: RecentWorkflow[]
): Array<{ workflow: WorkflowListItem; timestamp: string }> {
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const out: Array<{ workflow: WorkflowListItem; timestamp: string }> = [];

  // Visits from canvas / command palette (local).
  for (const recent of recentVisits) {
    if (out.length >= CONTINUE_MAX) break;
    const w = byId.get(recent.id);
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({
      workflow: w,
      timestamp: new Date(recent.at).toISOString(),
    });
  }

  // Fill from server updated_at so a fresh browser still has a Continue list.
  const byUpdated = [...workflows].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
  );
  for (const w of byUpdated) {
    if (out.length >= CONTINUE_MAX) break;
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({
      workflow: w,
      timestamp: w.updated_at ?? "",
    });
  }

  return out;
}

/**
 * Loading shell shaped like the desk itself — pulse cards, continue tiles,
 * then the library/rail split — so the first paint doesn't jump.
 */
function HomeDeskSkeleton() {
  return (
    <div
      className="page-container space-y-6"
      aria-busy="true"
      role="status"
      aria-label="Loading workspace overview…"
    >
      <span className="sr-only">Loading workspace overview…</span>
      <div className="space-y-2">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-3.5 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-border bg-surface p-3 sm:p-4"
          >
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-14" />
            <div className="skeleton h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="skeleton h-4 w-40" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-lg border border-border bg-surface p-3 sm:p-4"
            >
              <div className="skeleton h-2.5 w-16" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface">
        <div className="space-y-2 border-b border-border px-4 py-3">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-2.5 w-56 max-w-full" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-4 py-3">
            <span className="skeleton h-1.5 w-1.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3" style={{ width: `${50 + ((i * 9) % 30)}%` }} />
              <div className="skeleton h-2.5" style={{ width: `${25 + ((i * 5) % 20)}%` }} />
            </div>
            <span className="skeleton h-2.5 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { pinnedIds, toggle, isPinned } = usePinnedWorkflows();
  const now = useNow();
  const [recentVisits, setRecentVisits] = useState<RecentWorkflow[]>([]);

  useEffect(() => {
    setRecentVisits(getRecentWorkflows());
  }, []);

  const {
    data: workflows = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workflows,
    queryFn: api.listWorkflows,
    retry: 1,
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.observabilitySummary,
    queryFn: api.getObservabilitySummary,
    retry: 1,
    staleTime: 30_000,
  });

  const alertsQuery = useQuery({
    queryKey: queryKeys.alertEvents,
    queryFn: api.listAlertEvents,
    retry: 1,
    staleTime: 30_000,
  });

  const nextActions = useMemo(() => {
    const runs = (summaryQuery.data?.recent_runs ?? []) as RecentRunRow[];
    return buildNextActions({
      runs,
      alerts: alertsQuery.data ?? [],
      workflows,
      now,
      formatRelative: formatRelativeTime,
    });
  }, [summaryQuery.data?.recent_runs, alertsQuery.data, workflows, now]);

  const statusLine = useMemo(() => {
    if (summaryQuery.isSuccess && alertsQuery.isSuccess) {
      return buildDeskStatusLine(nextActions, summaryQuery.data?.active_runs ?? 0);
    }
    if (summaryQuery.isError || alertsQuery.isError) {
      return "Some activity is unavailable. Your workflows are ready to open.";
    }
    return "Checking workspace activity…";
  }, [
    nextActions,
    summaryQuery.data?.active_runs,
    summaryQuery.isSuccess,
    summaryQuery.isError,
    alertsQuery.isSuccess,
    alertsQuery.isError,
  ]);

  const pinnedWorkflows = useMemo(() => {
    const byId = new Map(workflows.map((w) => [w.id, w]));
    return pinnedIds
      .map((id) => byId.get(id))
      .filter((w): w is WorkflowListItem => Boolean(w));
  }, [workflows, pinnedIds]);

  const continueItems = useMemo(
    () => buildContinueItems(workflows, recentVisits),
    [workflows, recentVisits]
  );

  if (isLoading) {
    return <HomeDeskSkeleton />;
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

  return (
    <Page>
        <PageHeader
          title="Workspace overview"
          breadcrumb={<p className="text-micro uppercase text-subtle">Agent workspace</p>}
          description={
            isEmptyLibrary
              ? "Version and publish agent graphs — drafts, review, then live."
              : statusLine
          }
          actions={
            <>
              {!isEmptyLibrary && (
                <Button asChild variant="ghost" size="sm">
                  <a href="#workflow-search">
                    <Search className="h-4 w-4" />
                    Find workflow
                  </a>
                </Button>
              )}
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
        ) : (
          <>
            <HomePulseBar workflows={workflows} />

            <ContinueTiles
              items={continueItems.map(({ workflow, timestamp }) => ({
                workflow,
                meta: timestamp ? formatRelativeTime(timestamp, now) : "—",
              }))}
              onTogglePin={toggle}
              isPinned={isPinned}
            />
            <NextActionsPanel
              actions={nextActions}
              loading={summaryQuery.isPending || alertsQuery.isPending}
              unavailable={summaryQuery.isError || alertsQuery.isError}
              onRetry={() => {
                void summaryQuery.refetch();
                void alertsQuery.refetch();
              }}
            />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="min-w-0">
                <WorkflowLibraryList
                  workflows={workflows}
                  onTogglePin={toggle}
                  isPinned={isPinned}
                />
              </div>
              <aside aria-label="Pinned and activity" className="min-w-0 space-y-5">
                <PinnedPanel pinned={pinnedWorkflows} onTogglePin={toggle} />
                <RecentActivityRail />
              </aside>
            </div>
          </>
        )}
    </Page>
  );
}
