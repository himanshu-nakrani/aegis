"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        {error instanceof Error ? error.message : "Failed to load workflow"}
      </div>
    );
  }

  if (!workflow?.latest_version) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">Workflow not found.</div>
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