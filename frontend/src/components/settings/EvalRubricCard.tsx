"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, type EvalPreview } from "@/lib/api";
import type { EvalPreset } from "@/types/workflow";

const DIMS = ["faithfulness", "helpfulness", "relevance", "toxicity"] as const;
type Dim = (typeof DIMS)[number];
const DEFAULT_WEIGHTS: Record<Dim, number> = {
  faithfulness: 0.3,
  helpfulness: 0.3,
  relevance: 0.25,
  toxicity: 0.15,
};

/**
 * Custom rubric editor: create, edit (per-dimension weights + criteria), and
 * test an LLM-judge rubric on a sample before wiring it into an evaluation node.
 */
export function EvalRubricCard() {
  const queryClient = useQueryClient();
  const { data: presets = [], isLoading } = useQuery({
    queryKey: ["eval-presets"],
    queryFn: api.listEvalPresets,
  });
  const custom = presets.filter((p) => p.source === "custom");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [criteria, setCriteria] = useState("");
  const [instruction, setInstruction] = useState("");
  const [weights, setWeights] = useState<Record<Dim, number>>(DEFAULT_WEIGHTS);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvalPreset | null>(null);

  const [sampleInput, setSampleInput] = useState("");
  const [sampleOutput, setSampleOutput] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<EvalPreview | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setLabel("");
    setCriteria("");
    setInstruction("");
    setWeights(DEFAULT_WEIGHTS);
  };

  const startEdit = (preset: EvalPreset) => {
    setEditingId(preset.id);
    setLabel(preset.label);
    setCriteria(preset.criteria);
    setInstruction(preset.instruction ?? "");
    setWeights({ ...DEFAULT_WEIGHTS, ...(preset.score_weights as Record<Dim, number> | undefined) });
  };

  const save = async () => {
    if (!label.trim() || !criteria.trim()) {
      toast.error("Label and criteria are required");
      return;
    }
    if (!editingId && !name.trim()) {
      toast.error("Internal name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateEvalPreset(editingId, {
          label: label.trim(),
          criteria: criteria.trim(),
          instruction: instruction.trim() || null,
          score_weights: weights,
        });
        toast.success("Rubric updated");
      } else {
        await api.createEvalPreset({
          name: name.trim(),
          label: label.trim(),
          criteria: criteria.trim(),
          instruction: instruction.trim() || undefined,
          score_weights: weights,
        });
        toast.success("Rubric saved");
      }
      await queryClient.invalidateQueries({ queryKey: ["eval-presets"] });
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rubric");
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!sampleOutput.trim()) {
      toast.error("Add a sample output to score");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await api.previewEvalPreset({
        input_text: sampleInput,
        output_text: sampleOutput,
        criteria: criteria.trim() || undefined,
        instruction: instruction.trim() || undefined,
        score_weights: weights,
      });
      setPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <SettingsSection
      id="settings-presets"
      title="Eval rubrics"
      description="Reusable LLM-judge rubrics — tune the criteria and per-dimension weights, then test on a sample."
    >
      {isLoading ? (
        <LoadingState variant="list" />
      ) : custom.length === 0 ? (
        <p className="text-sm text-muted">No custom rubrics yet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {custom.map((preset) => (
            <li
              key={preset.id}
              className="group flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{preset.label}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{preset.criteria}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  onClick={() => startEdit(preset)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <button
                  type="button"
                  aria-label={`Delete rubric ${preset.label}`}
                  onClick={() => setDeleteTarget(preset)}
                  className="focus-ring rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor form */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted">
            {editingId ? "Edit rubric" : "New rubric"}
          </p>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="focus-ring flex items-center gap-1 text-2xs text-muted hover:text-foreground"
            >
              <X className="h-3 w-3" /> cancel edit
            </button>
          )}
        </div>
        {!editingId && (
          <div className="space-y-1.5">
            <Label>Internal name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="support_quality_v2"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Display label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Support Quality v2"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Criteria</Label>
          <Textarea
            rows={2}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Tone, accuracy, and resolution quality"
          />
        </div>
        <div className="space-y-1.5">
          <Label>LLM instruction (optional)</Label>
          <Textarea
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Override the default grading instruction"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Dimension weights</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIMS.map((dim) => (
              <div key={dim} className="space-y-1">
                <span className="block font-mono text-2xs lowercase text-muted">{dim}</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weights[dim]}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, [dim]: Number(e.target.value) }))
                  }
                  aria-label={`${dim} weight`}
                />
              </div>
            ))}
          </div>
          <p className="form-hint">
            Weighted mean (toxicity inverted). Weights are normalized at scoring time.
          </p>
        </div>
        <Button type="button" size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {editingId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : editingId ? "Update rubric" : "Add rubric"}
        </Button>
      </div>

      {/* Test on a sample */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-2xs font-medium uppercase tracking-wider text-muted">Test on a sample</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Textarea
            rows={2}
            value={sampleInput}
            onChange={(e) => setSampleInput(e.target.value)}
            placeholder="Sample input (optional)"
          />
          <Textarea
            rows={2}
            value={sampleOutput}
            onChange={(e) => setSampleOutput(e.target.value)}
            placeholder="Sample output to grade"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runPreview}
          disabled={previewing}
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" />
          {previewing ? "Scoring…" : "Score sample"}
        </Button>
        {preview && (
          <div className="rounded-lg border border-border bg-surface-input p-3">
            {preview.skipped ? (
              <p className="text-xs text-warning">{preview.message}</p>
            ) : preview.error ? (
              <p className="text-xs text-destructive">{preview.error}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 font-mono text-2xs tabular-nums">
                  {DIMS.map((dim) => (
                    <span key={dim} className="text-muted">
                      {dim} <span className="text-foreground">{preview[dim] ?? "—"}</span>
                    </span>
                  ))}
                  <span className="text-muted">
                    aggregate{" "}
                    <span className="text-foreground">{preview.aggregate_score ?? "—"}</span>
                  </span>
                </div>
                {preview.reasoning && <p className="text-xs text-subtle">{preview.reasoning}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete rubric?"
        description={
          deleteTarget
            ? `"${deleteTarget.label}" will be removed. Evaluation nodes using it fall back to custom criteria.`
            : ""
        }
        confirmLabel={deleteTarget ? `Delete '${deleteTarget.label}'` : "Delete"}
        loadingLabel="Deleting rubric…"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await api.deleteEvalPreset(deleteTarget.id);
            await queryClient.invalidateQueries({ queryKey: ["eval-presets"] });
            if (editingId === deleteTarget.id) resetForm();
            toast.success("Rubric deleted");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete");
          }
        }}
      />
    </SettingsSection>
  );
}
