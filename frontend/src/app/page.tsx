"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { LayoutTemplate, Plus, Workflow } from "lucide-react";
import { FirstRunHero } from "@/components/home/FirstRunHero";
import { HomePulseBar } from "@/components/home/HomePulseBar";
import { NextActionsPanel } from "@/components/home/NextActionsPanel";
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
import { queryKeys } from "@/lib/query-keys";

function HomeDeskSkeleton() {
  return (
    <div className="page-container space-y-8" aria-busy="true" role="status" aria-label="Loading workspace overview…">
      <span className="sr-only">Loading workspace overview…</span>
      <div className="space-y-3"><div className="skeleton h-8 w-40" /><div className="skeleton h-4 w-72 max-w-full" /></div>
      <div className="grid grid-cols-2 gap-6 rounded-xl border border-border p-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="space-y-3"><div className="skeleton h-3 w-20" /><div className="skeleton h-7 w-12" /><div className="skeleton h-3 w-24" /></div>)}
      </div>
      <div className="space-y-6 rounded-xl border border-border p-6">
        <div className="skeleton h-5 w-36" />
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex gap-3"><div className="skeleton h-9 w-9 rounded-lg" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-40" /><div className="skeleton h-3 w-64 max-w-full" /></div></div>)}
      </div>
    </div>
  );
}

export default function HomePage() {
  useDocumentTitle("Workflows");
  const { toggle, isPinned } = usePinnedWorkflows();
  const now = useNow();
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
    queryFn: () => api.listAlertEvents(200),
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
      // Partial outage: keep whatever counts we still have, then flag the gap
      // instead of replacing the whole line with an error sentence.
      const available = buildDeskStatusLine(
        nextActions,
        summaryQuery.data?.active_runs ?? 0
      );
      return available === "All clear — nothing needs you right now."
        ? "Some activity is unavailable. Your workflows are ready to open."
        : `${available} · some activity unavailable`;
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
        title="Workflows"
        description={
          nextActions.length > 0 || summaryQuery.isError || alertsQuery.isError
            ? statusLine
            : "Create, test, and manage your agent workflows."
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2 md:gap-3">
            <Button asChild variant="ghost" className="w-full text-muted sm:w-auto">
              <Link href="/templates">
                <LayoutTemplate className="h-4 w-4" />
                Browse templates
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/workflows/new">
                <Plus className="h-4 w-4" />
                New workflow
              </Link>
            </Button>
          </div>
        }
      />

      {isEmptyLibrary ? (
        <FirstRunHero
          fallback={
            <EmptyState
              icon={Workflow}
              title="No workflows yet"
              description="Start with a template or create a workflow from scratch."
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
          {((summaryQuery.data?.run_count ?? 0) > 0 || summaryQuery.isError) && <HomePulseBar workflows={workflows} />}

          {(nextActions.length > 0 || summaryQuery.isError || alertsQuery.isError) && (
            <NextActionsPanel
              actions={nextActions}
              loading={summaryQuery.isPending || alertsQuery.isPending}
              unavailable={summaryQuery.isError || alertsQuery.isError}
              onRetry={() => {
                void summaryQuery.refetch();
                void alertsQuery.refetch();
              }}
            />
          )}
          <WorkflowLibraryList workflows={workflows} onTogglePin={toggle} isPinned={isPinned} />
          {(summaryQuery.data?.recent_runs.length ?? 0) > 0 && <RecentActivityRail />}
        </>
      )}
    </Page>
  );
}
