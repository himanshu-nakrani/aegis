"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import type { Workflow, WorkflowGraph } from "@/types/workflow";

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
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getWorkflow(params.id)
      .then(setWorkflow)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Loading workflow…
        </div>
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