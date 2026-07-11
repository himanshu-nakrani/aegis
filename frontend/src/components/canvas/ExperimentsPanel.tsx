"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatCostUsd } from "@/lib/format";
import type { Experiment } from "@/types/workflow";

interface ExperimentsPanelProps {
  workflowId: string;
  currentVersionId?: string;
}

function verdictBadge(exp: Experiment) {
  if (exp.status !== "completed") {
    return <Badge variant={exp.status === "failed" ? "destructive" : "outline"}>{exp.status}</Badge>;
  }
  const verdict = exp.summary?.verdict;
  if (!verdict) {
    return <Badge variant="outline">batch</Badge>;
  }
  return (
    <Badge variant={verdict.passed ? "success" : "destructive"}>
      {verdict.passed ? "no regression" : "regression"}
    </Badge>
  );
}

/** Golden datasets + batch/regression experiments for one workflow. */
export function ExperimentsPanel({ workflowId, currentVersionId }: ExperimentsPanelProps) {
  const queryClient = useQueryClient();
  const [newDatasetName, setNewDatasetName] = useState("");
  const [newItemInput, setNewItemInput] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [baselineVersion, setBaselineVersion] = useState<string>("");
  /** One pending action at a time keeps every mutation double-click-safe. */
  const [pending, setPending] = useState<"dataset" | "item" | "batch" | "regression" | null>(null);

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", workflowId],
    queryFn: () => api.listDatasets(workflowId),
  });
  const { data: experiments = [], isLoading: experimentsLoading } = useQuery({
    queryKey: ["experiments", workflowId],
    queryFn: () => api.listExperiments(workflowId),
    refetchInterval: (query) =>
      (query.state.data || []).some((e) => ["pending", "running"].includes(e.status))
        ? 4000
        : false,
  });
  const { data: versions = [] } = useQuery({
    queryKey: ["versions", workflowId],
    queryFn: () => api.listVersions(workflowId),
  });

  const activeDataset = selectedDataset || datasets[0]?.id || "";

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["datasets", workflowId] });
    void queryClient.invalidateQueries({ queryKey: ["experiments", workflowId] });
  };

  const createDataset = async () => {
    if (!newDatasetName.trim() || pending) return;
    setPending("dataset");
    try {
      await api.createDataset(workflowId, newDatasetName.trim());
      setNewDatasetName("");
      refresh();
      toast.success("Dataset created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create dataset");
    } finally {
      setPending(null);
    }
  };

  const addItem = async () => {
    if (!activeDataset || !newItemInput.trim() || pending) return;
    setPending("item");
    try {
      await api.addDatasetItem(activeDataset, { input_text: newItemInput.trim() });
      setNewItemInput("");
      refresh();
      toast.success("Item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add item");
    } finally {
      setPending(null);
    }
  };

  const launch = async (kind: "batch" | "regression") => {
    if (pending) return;
    if (!activeDataset || !currentVersionId) {
      toast.error("Save the workflow and pick a dataset first");
      return;
    }
    if (kind === "regression" && !baselineVersion) {
      toast.error("Pick a baseline version");
      return;
    }
    setPending(kind);
    try {
      await api.createExperiment({
        workflow_id: workflowId,
        dataset_id: activeDataset,
        version_id: currentVersionId,
        kind,
        baseline_version_id: kind === "regression" ? baselineVersion : undefined,
      });
      refresh();
      toast.success(kind === "regression" ? "Regression check started" : "Batch run started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start experiment");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border border-border bg-surface-input p-3">
        <p className="text-sm font-medium text-foreground">Datasets</p>
        {datasets.length > 0 && (
          <Select value={activeDataset} onValueChange={setSelectedDataset}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} ({d.item_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-2">
          <Input
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
            placeholder="New dataset name…"
            className="h-8 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={createDataset}
            disabled={pending === "dataset" || !newDatasetName.trim()}
            aria-label="Create dataset"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {activeDataset && (
          <div className="flex gap-2">
            <Input
              value={newItemInput}
              onChange={(e) => setNewItemInput(e.target.value)}
              placeholder="Add test input…"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") void addItem();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={pending === "item" || !newItemInput.trim()}
            >
              {pending === "item" ? "Adding…" : "Add"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-border bg-surface-input p-3">
        <p className="text-sm font-medium text-foreground">Run experiment</p>
        <p className="text-caption">
          Batch scores the current version on the dataset. Regression compares it against a
          baseline version and renders a pass/fail verdict.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void launch("batch")}
            disabled={pending !== null}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {pending === "batch" ? "Starting…" : "Batch"}
          </Button>
          <Select value={baselineVersion} onValueChange={setBaselineVersion}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Baseline version…" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void launch("regression")}
            disabled={pending !== null}
          >
            {pending === "regression" ? "Starting…" : "Regression"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">History</p>
        {experimentsLoading ? (
          <LoadingState variant="list" label="Loading experiments…" />
        ) : experiments.length === 0 ? (
          <EmptyState
            compact
            icon={FlaskConical}
            title="No experiments yet"
            description="Create a dataset, then run a batch or regression check."
          />
        ) : null}
        {experiments.map((exp) => {
          const candidate = exp.summary?.candidate;
          const verdict = exp.summary?.verdict;
          return (
            <div key={exp.id} className="rounded-md border border-border bg-surface-input p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted">
                  {exp.kind}
                  {exp.created_at && (
                    <>
                      {" · "}
                      <time dateTime={exp.created_at} title={formatFullTimestamp(exp.created_at)}>
                        {formatRelativeTime(exp.created_at)}
                      </time>
                    </>
                  )}
                </span>
                {verdictBadge(exp)}
              </div>
              {candidate && (
                <p className="mt-2 font-mono text-xs text-muted">
                  eval {candidate.avg_eval ?? "—"} · {candidate.failures}/{candidate.items} failed
                  {typeof candidate.total_cost_usd === "number"
                    ? ` · ${formatCostUsd(candidate.total_cost_usd)}`
                    : ""}
                </p>
              )}
              {verdict && !verdict.passed && (
                <p className="mt-1 text-xs text-destructive">{verdict.reasons.join("; ")}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
