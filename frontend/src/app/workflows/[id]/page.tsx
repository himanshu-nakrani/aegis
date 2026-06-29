"use client";

import { useEffect, useState } from "react";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { api } from "@/lib/api";
import type { Workflow, WorkflowGraph } from "@/types/workflow";

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