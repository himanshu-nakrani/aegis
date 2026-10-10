"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatasetExamples } from "@/components/runs/DatasetExamples";
import type { ObservabilityErrors } from "@/types/workflow";

export function PromoteCluster({ cluster }: { cluster: ObservabilityErrors["clusters"][number] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [workflow, setWorkflow] = useState("");
  const [target, setTarget] = useState("");
  const [copied, setCopied] = useState("");
  const [pending, setPending] = useState(false);
  const members = cluster.members;
  const workflows = Array.from(new Map(members.map((member) => [member.workflow_id, member.workflow_name])).entries());
  const workflowId = workflow || workflows[0]?.[0] || "";
  const selectedMembers = members.filter((member) => member.workflow_id === workflowId);
  const datasets = useQuery({
    queryKey: queryKeys.datasets(workflowId),
    queryFn: () => api.listDatasets(workflowId),
    enabled: open && Boolean(workflowId),
  });
  const promote = async () => {
    if (pending || !selectedMembers.length) return;
    setPending(true);
    try {
      const datasetId = target || (datasets.data || []).find((dataset) => dataset.name === "Failure examples")?.id || (await api.createDataset(workflowId, "Failure examples")).id;
      const result = await api.captureRunsToDataset(datasetId, {
        filter: "cluster", run_ids: selectedMembers.map((member) => member.run_id),
        cluster_signature: cluster.signature, limit: selectedMembers.length,
      });
      setTarget(datasetId);
      setCopied(datasetId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workflowId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataset(datasetId) });
      toast.success(`Promoted ${result.added} cluster examples · ${result.skipped} already saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to promote cluster");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="px-4 pb-3">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>Promote cluster</Button>
      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted">Promotes only this displayed cluster&apos;s {selectedMembers.length} members in the selected workflow. Other workflows are not copied. Failed outputs remain unlabelled with run provenance.</p>
          <div className="flex flex-wrap gap-2">
            <Select value={workflowId} onValueChange={(id) => { setWorkflow(id); setTarget(""); setCopied(""); }}>
              <SelectTrigger size="sm" className="w-52" aria-label="Cluster workflow"><SelectValue /></SelectTrigger>
              <SelectContent>{workflows.map(([id, name]) => <SelectItem key={id} value={id}>{name} ({members.filter((member) => member.workflow_id === id).length})</SelectItem>)}</SelectContent>
            </Select>
            <Select value={target || "default"} onValueChange={(id) => { setTarget(id === "default" ? "" : id); setCopied(""); }}>
              <SelectTrigger size="sm" className="w-52" aria-label="Cluster dataset target"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Failure examples (create if needed)</SelectItem>
                {(datasets.data || []).map((dataset) => <SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={pending || datasets.isPending || datasets.isError} onClick={() => void promote()}>{pending ? "Promoting…" : `Promote ${selectedMembers.length} runs`}</Button>
          </div>
          {datasets.isError && <Button variant="outline" size="sm" onClick={() => void datasets.refetch()}>Retry datasets</Button>}
          {copied && <DatasetExamples datasetId={copied} />}
        </div>
      )}
    </div>
  );
}
