"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Workflow, WorkflowGraph } from "@/types/workflow";

const WorkflowCanvas = dynamic(
  () => import("@/components/canvas/WorkflowCanvas").then((mod) => mod.WorkflowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-slate-950 text-slate-400">
        Loading canvas...
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
    return <div className="p-8 text-slate-400">Loading workflow...</div>;
  }

  if (!workflow?.latest_version) {
    return <div className="p-8 text-slate-400">Workflow not found.</div>;
  }

  return (
    <WorkflowCanvas
      workflowId={workflow.id}
      workflowName={workflow.name}
      initialGraph={workflow.latest_version.graph_json as WorkflowGraph}
      versionId={workflow.latest_version.id}
    />
  );
}