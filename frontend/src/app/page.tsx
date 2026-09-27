"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Plus, Workflow } from "lucide-react";
import { ContinueTiles } from "@/components/home/ContinueTiles";
import { FirstRunHero } from "@/components/home/FirstRunHero";
import { HomePulseBar } from "@/components/home/HomePulseBar";
import { NextActionsPanel } from "@/components/home/NextActionsPanel";
import { PinnedPanel } from "@/components/home/PinnedPanel";
import { RecentActivityRail } from "@/components/home/RecentActivityRail";
import { WorkflowLibraryList } from "@/components/home/WorkflowLibraryList";
import { PageEnter } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
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

const CONTINUE_MAX = 6;

function buildContinueItems(
  workflows: WorkflowListItem[],
  recentVisits: RecentWorkflow[],
  now: number
): Array<{ workflow: WorkflowListItem; meta: string }> {
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const out: Array<{ workflow: WorkflowListItem; meta: string }> = [];

  // Visits from canvas / command palette (local).
  for (const recent of recentVisits) {
    if (out.length >= CONTINUE_MAX) break;
    const w = byId.get(recent.id);
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({
      workflow: w,
      meta: formatRelativeTime(new Date(recent.at).toISOString(), now),
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
      meta: w.updated_at ? formatRelativeTime(w.updated_at, now) : "—",
    });
  }

  return out;
}

export default function HomePage() {
  const [search, setSearch] = useState("");
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

  const statusLine = useMemo(
    () => buildDeskStatusLine(nextActions, summaryQuery.data?.active_runs ?? 0),
    [nextActions, summaryQuery.data?.active_runs]
  );

  const pinnedWorkflows = useMemo(() => {
    const byId = new Map(workflows.map((w) => [w.id, w]));
    return pinnedIds
      .map((id) => byId.get(id))
      .filter((w): w is WorkflowListItem => Boolean(w));
  }, [workflows, pinnedIds]);

  const continueItems = useMemo(
    () => buildContinueItems(workflows, recentVisits, now),
    [workflows, recentVisits, now]
  );

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

  return (
    <PageEnter>
      <div className="page-container space-y-6">
        <PageHeader
          title="Workflows"
          description={
            isEmptyLibrary
              ? "Version and publish agent graphs — drafts, review, then live."
              : statusLine
          }
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

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              {/* Per-breakpoint copies keep keyboard focus order equal to painted
                  order at every width: on small screens the triage cards lead the
                  stack and the feed trails the working column; at lg the working
                  column leads and the rail (triage + feed) follows left-to-right.
                  Inactive copies are display:none, so they leave the tab order
                  and a11y tree; feed and summary queries dedupe across copies. */}
              <div className="space-y-5 lg:hidden">
                <NextActionsPanel actions={nextActions} />
                <PinnedPanel pinned={pinnedWorkflows} onTogglePin={toggle} />
              </div>

              <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
                <ContinueTiles
                  items={continueItems}
                  onTogglePin={toggle}
                  isPinned={isPinned}
                />
                <WorkflowLibraryList
                  workflows={workflows}
                  search={search}
                  onSearchChange={setSearch}
                  onTogglePin={toggle}
                  isPinned={isPinned}
                />
              </div>

              <aside
                aria-label="Attention and activity"
                className="min-w-0 lg:col-start-2 lg:row-start-1 lg:space-y-5"
              >
                <div className="hidden space-y-5 lg:block">
                  <NextActionsPanel actions={nextActions} />
                  <PinnedPanel pinned={pinnedWorkflows} onTogglePin={toggle} />
                </div>
                <RecentActivityRail />
              </aside>
            </div>
          </>
        )}
      </div>
    </PageEnter>
  );
}
