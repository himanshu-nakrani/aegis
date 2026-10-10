"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, FlaskConical, Plus, Sparkles, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import { InspectorSection } from "@/components/canvas/inspector/InspectorSection";
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
import { api, ApiRequestError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatCostUsd } from "@/lib/format";
import type { DraftEvalSuiteResponse, Experiment } from "@/types/workflow";
import { DatasetExamples } from "@/components/runs/DatasetExamples";

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
  const [captureFilter, setCaptureFilter] = useState<"recent" | "failed" | "low_eval">("failed");
  const [importError, setImportError] = useState("");
  /** One pending action at a time keeps every mutation double-click-safe. */
  const [pending, setPending] = useState<
    "dataset" | "item" | "batch" | "regression" | "matrix" | "capture" | "import" | "draft" | "apply" | null
  >(null);
  const [evalDraft, setEvalDraft] = useState<DraftEvalSuiteResponse | null>(null);
  /** Selected {provider, model} pairs for a multi-model matrix experiment. */
  const [matrixModels, setMatrixModels] = useState<
    Array<{ provider: string; model: string }>
  >([]);

  const {
    data: datasets = [],
    isError: datasetsError,
    refetch: refetchDatasets,
  } = useQuery({
    queryKey: queryKeys.datasets(workflowId),
    queryFn: () => api.listDatasets(workflowId),
  });
  const {
    data: experiments = [],
    isLoading: experimentsLoading,
    isError: experimentsError,
    refetch: refetchExperiments,
  } = useQuery({
    queryKey: queryKeys.experiments(workflowId),
    queryFn: () => api.listExperiments(workflowId),
    refetchInterval: (query) =>
      (query.state.data || []).some((e) => ["pending", "running"].includes(e.status))
        ? 4000
        : false,
  });
  const {
    data: versions = [],
    isError: versionsError,
    refetch: refetchVersions,
  } = useQuery({
    queryKey: queryKeys.workflowVersions(workflowId),
    queryFn: () => api.listVersions(workflowId),
  });
  const { data: modelCatalog } = useQuery({
    queryKey: queryKeys.modelCatalog,
    queryFn: () => api.listModels(),
  });

  /** Flattened catalog into selectable matrix pairs (provider default + each
   *  listed model); deduped by provider/model. */
  const matrixOptions = (modelCatalog?.providers ?? []).flatMap((p) =>
    Array.from(new Set(p.models.length ? p.models : [p.default])).map((model) => ({
      provider: p.provider,
      providerLabel: p.label,
      model,
    }))
  );

  const toggleMatrixModel = (provider: string, model: string) => {
    setMatrixModels((current) =>
      current.some((m) => m.provider === provider && m.model === model)
        ? current.filter((m) => !(m.provider === provider && m.model === model))
        : [...current, { provider, model }]
    );
  };

  const activeDataset = selectedDataset || datasets[0]?.id || "";

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workflowId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.experiments(workflowId) });
    if (activeDataset) void queryClient.invalidateQueries({ queryKey: queryKeys.dataset(activeDataset) });
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

  const captureRuns = async () => {
    if (!activeDataset || pending) return;
    setPending("capture");
    try {
      const result = await api.captureRunsToDataset(activeDataset, {
        filter: captureFilter,
        limit: 20,
      });
      refresh();
      toast.success(
        result.added > 0
          ? `Captured ${result.added} run${result.added === 1 ? "" : "s"}` +
              (result.skipped ? ` (${result.skipped} already in set)` : "")
          : "No new runs to capture"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to capture runs");
    } finally {
      setPending(null);
    }
  };

  const importCsv = async (file: File) => {
    if (!activeDataset || pending) return;
    setPending("import");
    setImportError("");
    try {
      if (file.size > 2_000_000) throw new Error("CSV must be at most 2 MB");
      const result = await api.importDatasetCsv(activeDataset, await file.text());
      refresh();
      toast.success(`Imported ${result.imported} examples`);
    } catch (error) {
      let message = error instanceof Error ? error.message : "CSV import failed";
      try {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed.detail?.errors)) {
          message = parsed.detail.errors.map((row: { row: number; message: string }) => `Row ${row.row}: ${row.message}`).join("\n");
        }
      } catch { /* A plain server error is already readable. */ }
      setImportError(`Nothing imported. ${message}`);
    } finally {
      setPending(null);
    }
  };

  const requestEvalDraft = async () => {
    if (pending) return;
    setPending("draft");
    try {
      const result = await api.draftEvalSuite({ workflow_id: workflowId });
      setEvalDraft(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to draft eval suite");
    } finally {
      setPending(null);
    }
  };

  /** Applies the reviewed draft through the normal create endpoints. */
  const applyEvalDraft = async () => {
    if (!evalDraft || pending) return;
    setPending("apply");
    try {
      const suggestion = evalDraft.dataset_suggestion;
      const dataset = await api.createDataset(workflowId, suggestion.name);
      if (suggestion.items.length > 0) {
        await api.importDatasetItems(
          dataset.id,
          suggestion.items.map((item) => ({
            input_text: item.input_text,
            expected_output: item.expected_output,
          }))
        );
      }
      setSelectedDataset(dataset.id);

      const preset = evalDraft.preset_suggestion;
      let presetNote = "";
      if (preset.builtin_preset_id) {
        presetNote = ` · rubric: ${preset.builtin_label ?? preset.builtin_preset_id} (built-in)`;
      } else if (preset.name && preset.criteria) {
        try {
          await api.createEvalPreset({
            name: preset.name,
            label: preset.label ?? preset.name,
            criteria: preset.criteria,
            instruction: preset.instruction ?? undefined,
            score_weights: preset.score_weights ?? undefined,
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.evalPresets });
          presetNote = ` · rubric "${preset.label ?? preset.name}" created`;
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 400) {
            presetNote = ` · rubric "${preset.name}" already exists`;
          } else {
            throw error;
          }
        }
      }

      setEvalDraft(null);
      refresh();
      toast.success(`Dataset "${dataset.name}" created with ${suggestion.items.length} items${presetNote}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply eval suite draft");
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

  /** Run the dataset once per selected model and compare per-model metrics. */
  const launchMatrix = async () => {
    if (pending) return;
    if (!activeDataset || !currentVersionId) {
      toast.error("Save the workflow and pick a dataset first");
      return;
    }
    if (matrixModels.length < 2) {
      toast.error("Pick at least two models to compare");
      return;
    }
    setPending("matrix");
    try {
      await api.createExperiment({
        workflow_id: workflowId,
        dataset_id: activeDataset,
        version_id: currentVersionId,
        kind: "batch",
        models: matrixModels,
      });
      refresh();
      toast.success(`Matrix started across ${matrixModels.length} models`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start matrix");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <InspectorSection title="Datasets">
        <div className="space-y-2 rounded-md border border-border bg-surface-input p-3">
        {datasetsError && (
          <InlineQueryError
            message="Couldn't load datasets"
            onRetry={() => void refetchDatasets()}
          />
        )}
        {datasets.length > 0 && (
          <Select value={activeDataset} onValueChange={setSelectedDataset}>
            <SelectTrigger className="w-full" aria-label="Dataset">
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
            aria-label="New dataset name"
            size="sm"
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
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center"
          onClick={() => void requestEvalDraft()}
          disabled={pending !== null}
          aria-label="Draft eval suite"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {pending === "draft" ? "Drafting…" : "Draft eval suite"}
        </Button>
        {evalDraft && (
          <div className="space-y-2 rounded-md border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted">Eval suite draft</p>
              <button
                type="button"
                aria-label="Dismiss eval suite draft"
                className="text-subtle transition-colors hover:text-muted"
                onClick={() => setEvalDraft(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted">
              Dataset: <span className="font-medium">{evalDraft.dataset_suggestion.name}</span>
              {" "}({evalDraft.dataset_suggestion.items.length} items)
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {evalDraft.dataset_suggestion.items.map((item, index) => (
                <li key={index} className="text-2xs">
                  <span className="font-mono">{item.input_text}</span>
                  {item.rationale && (
                    <span className="text-subtle"> — {item.rationale}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              {evalDraft.preset_suggestion.builtin_preset_id ? (
                <>
                  Rubric: <span className="font-medium">
                    {evalDraft.preset_suggestion.builtin_label ?? evalDraft.preset_suggestion.builtin_preset_id}
                  </span>{" "}(built-in)
                </>
              ) : evalDraft.preset_suggestion.criteria ? (
                <>
                  Rubric: <span className="font-medium">
                    {evalDraft.preset_suggestion.label ?? evalDraft.preset_suggestion.name}
                  </span>{" "}(custom) — {evalDraft.preset_suggestion.criteria}
                </>
              ) : (
                "No rubric suggestion."
              )}
            </p>
            {evalDraft.preset_suggestion.reason && (
              <p className="text-2xs text-subtle">{evalDraft.preset_suggestion.reason}</p>
            )}
            {evalDraft.notes.length > 0 && (
              <ul className="space-y-0.5">
                {evalDraft.notes.map((note, index) => (
                  <li key={index} className="text-2xs text-subtle">· {note}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 border-t border-border pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-center"
                onClick={() => void applyEvalDraft()}
                disabled={pending !== null}
              >
                <Check className="h-3.5 w-3.5" />
                {pending === "apply" ? "Applying…" : "Accept"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEvalDraft(null)}
                disabled={pending !== null}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
        {activeDataset && (
          <div className="flex gap-2">
            <Input
              value={newItemInput}
              onChange={(e) => setNewItemInput(e.target.value)}
              placeholder="Add test input…"
              aria-label="Add test input"
              size="sm"
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
        {activeDataset && (
          <div className="flex gap-2 border-t border-border pt-2">
            <Select
              value={captureFilter}
              onValueChange={(v) => setCaptureFilter(v as "recent" | "failed" | "low_eval")}
            >
              <SelectTrigger size="sm" className="flex-1" aria-label="Capture filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="failed">Failed runs</SelectItem>
                <SelectItem value="low_eval">Low-eval runs</SelectItem>
                <SelectItem value="recent">Recent runs</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={captureRuns}
              disabled={pending === "capture"}
              aria-label="Capture runs into dataset"
            >
              {pending === "capture" ? "Capturing…" : "Capture"}
            </Button>
          </div>
        )}
        {activeDataset && (
          <div className="space-y-2 border-t border-border pt-2">
            <label className="block text-xs text-muted">
              Import CSV (up to 500 rows): input, expected_output, metadata.
              Metadata is a JSON object; blank expected output is unlabelled.
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Import dataset CSV"
                disabled={pending !== null}
                className="mt-2 block w-full text-xs"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void importCsv(file);
                }}
              />
            </label>
            {importError && <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">{importError}</p>}
            <p className="text-2xs text-subtle">Copied completed runs use their output as expected. Failures and negative feedback are unlabelled; observed output is kept in metadata.</p>
            <DatasetExamples datasetId={activeDataset} />
          </div>
        )}
        </div>
      </InspectorSection>

      <InspectorSection title="Run experiment">
        <div className="space-y-2 rounded-md border border-border bg-surface-input p-3">
        <p className="text-caption">
          Batch scores the current version on the dataset. Regression compares it against a
          baseline version and renders a pass/fail verdict.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center"
            onClick={() => void launch("batch")}
            disabled={pending !== null}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {pending === "batch" ? "Starting…" : "Batch"}
          </Button>
          {versionsError && (
            <InlineQueryError
              message="Couldn't load versions"
              onRetry={() => void refetchVersions()}
            />
          )}
          <Select value={baselineVersion} onValueChange={setBaselineVersion}>
            <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Baseline version">
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
            className="w-full justify-center"
            onClick={() => void launch("regression")}
            disabled={pending !== null}
          >
            {pending === "regression" ? "Starting…" : "Regression"}
          </Button>
          {matrixOptions.length > 0 && (
            <div className="space-y-2 border-t border-border pt-2">
              <p className="text-2xs text-subtle">
                Matrix: run the same dataset once per model and compare eval,
                failures, cost, and latency side by side.
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Matrix models">
                {matrixOptions.map((option) => {
                  const selected = matrixModels.some(
                    (m) => m.provider === option.provider && m.model === option.model
                  );
                  return (
                    <button
                      key={`${option.provider}/${option.model}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleMatrixModel(option.provider, option.model)}
                      className={`focus-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-2xs transition-colors ${
                        selected
                          ? "border-primary bg-primary-muted text-foreground"
                          : "border-border text-muted hover:bg-surface-hover"
                      }`}
                      title={`${option.providerLabel} · ${option.model}`}
                    >
                      {selected && <Check className="h-3 w-3" aria-hidden />}
                      {option.provider}/{option.model}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => void launchMatrix()}
                disabled={pending !== null || matrixModels.length < 2}
              >
                {pending === "matrix"
                  ? "Starting…"
                  : `Matrix${matrixModels.length > 0 ? ` (${matrixModels.length} model${matrixModels.length === 1 ? "" : "s"})` : ""}`}
              </Button>
            </div>
          )}
        </div>
        </div>
      </InspectorSection>

      <InspectorSection title="History" count={experiments.length}>
        {experimentsLoading ? (
          <LoadingState variant="list" label="Loading experiments…" />
        ) : experimentsError ? (
          <EmptyState
            compact
            icon={FlaskConical}
            title="Couldn't load experiments"
            description="The experiments request failed. Check the API and try again."
            action={
              <Button variant="outline" size="sm" onClick={() => void refetchExperiments()}>
                Retry
              </Button>
            }
          />
        ) : experiments.length === 0 ? (
          <EmptyState
            compact
            icon={FlaskConical}
            title="No experiments yet"
            description="Create a dataset, then run a batch or regression check."
          />
        ) : null}
        <div className="space-y-2">
        {experiments.map((exp) => {
          const candidate = exp.summary?.candidate;
          const verdict = exp.summary?.verdict;
          const isRegression =
            exp.status === "failed" || (verdict != null && !verdict.passed);
          return (
            <details
              key={exp.id}
              className="group rounded-md border border-border bg-surface-input"
              open={isRegression}
            >
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  <span className="truncate font-mono text-xs text-muted">
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
                </span>
                {verdictBadge(exp)}
              </summary>
              <div className="space-y-1 border-t border-border px-3 py-2">
                {candidate ? (
                  <p className="font-mono text-xs text-muted">
                    eval {candidate.avg_eval ?? "—"} · {candidate.failures}/{candidate.items} failed
                    {typeof candidate.total_cost_usd === "number"
                      ? ` · ${formatCostUsd(candidate.total_cost_usd)}`
                      : ""}
                  </p>
                ) : (
                  <p className="font-mono text-xs text-subtle">No candidate metrics yet.</p>
                )}
                {(exp.summary?.matrix ?? []).length > 0 && (
                  <div className="space-y-1 pt-1">
                    {(exp.summary?.matrix ?? []).map((entry) => (
                      <div
                        key={`${entry.provider}/${entry.model}`}
                        className="flex items-center justify-between gap-2 font-mono text-xs"
                      >
                        <span className="min-w-0 truncate text-muted">
                          {entry.provider}/{entry.model}
                        </span>
                        <span className="shrink-0 text-muted">
                          eval {entry.avg_eval ?? "—"} · {entry.failures}/{entry.items} failed
                          {typeof entry.total_cost_usd === "number"
                            ? ` · ${formatCostUsd(entry.total_cost_usd)}`
                            : ""}
                          {entry.avg_latency_ms != null ? ` · ${entry.avg_latency_ms}ms` : ""}
                        </span>
                        {entry.verdict && (
                          <Badge variant={entry.verdict.passed ? "success" : "destructive"}>
                            {entry.verdict.passed ? "ok" : "regression"}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {verdict && !verdict.passed && (
                  <p className="text-xs text-destructive">{verdict.reasons.join("; ")}</p>
                )}
              </div>
            </details>
          );
        })}
        </div>
      </InspectorSection>
    </div>
  );
}
