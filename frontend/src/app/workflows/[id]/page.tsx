"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowGraph } from "@/types/workflow";

const WorkflowCanvas = dynamic(
  () => import("@/components/canvas/WorkflowCanvas").then((mod) => mod.WorkflowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background text-muted">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Loading canvas…
        </div>
      </div>
    ),
  }
);

export default function WorkflowPage({ params }: { params: { id: string } }) {
  const {
    data: workflow,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: queryKeys.workflow(params.id),
    queryFn: () => api.getWorkflow(params.id),
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingState variant="inline" label="Loading workflow…" />
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : "Failed to load workflow";
    const isNotFound = /not found|404/i.test(message);
    const isAuth = /unauthorized|401|sign in|forbidden|403/i.test(message);
    const isNetwork = /fetch|network|failed to fetch|connection/i.test(message);

    const title = isNotFound
      ? "Workflow not found"
      : isAuth
        ? "Sign in required"
        : isNetwork
          ? "Couldn't reach the server"
          : "Couldn't load workflow";

    const description = isNotFound
      ? "Workflow not found — it may have been deleted."
      : isAuth
        ? "Sign in to view this workflow."
        : isNetwork
          ? "Couldn't reach the server — check your connection."
          : message;

    return (
      <div className="flex h-screen items-center justify-center p-6">
        <EmptyState
          icon={Workflow}
          variant={isNotFound || isNetwork ? "error" : "default"}
          title={title}
          description={description}
          action={
            <Link href="/">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (!workflow?.latest_version) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <EmptyState
          icon={Workflow}
          title="Workflow not found"
          description="It may have been deleted or you may not have access."
          action={
            <Link href="/">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <ErrorBoundary title="Workflow editor failed to load">
      <WorkflowCanvas
        workflowId={workflow.id}
        workflowName={workflow.name}
        initialGraph={workflow.latest_version.graph_json as WorkflowGraph}
        versionId={workflow.latest_version.id}
      />
    </ErrorBoundary>
  );
}