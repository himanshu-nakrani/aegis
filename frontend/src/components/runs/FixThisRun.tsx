"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { api, type RunRepair } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowGraph, WorkflowRun } from "@/types/workflow";

interface FixThisRunProps {
  run: WorkflowRun;
}

interface CheckedRepair {
  repair: RunRepair;
  status: string;
}

/**
 * Records consent and compares the current draft with a repair candidate.
 * A passing comparison can be adopted. Adopting without a passing comparison
 * is a separate action. Neither path publishes the workflow.
 */
export function FixThisRun({ run }: FixThisRunProps) {
  const queryClient = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [expected, setExpected] = useState("");
  const [checked, setChecked] = useState<CheckedRepair | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const validate = useMutation({
    mutationFn: async () => {
      if (!run.workflow_id) throw new Error("This run is not attached to a workflow");
      const repair = await api.createRunRepair(run.id);
      await api.recordRepairContext(repair.id, ["input", "output"]);
      const workflow = await api.getWorkflow(run.workflow_id);
      const graph = (workflow.draft_version?.graph_json ||
        workflow.latest_version?.graph_json) as WorkflowGraph | undefined;
      if (!graph) throw new Error("Workflow has no draft to repair");
      await api.addRepairProposal(repair.id, graph);
      await api.createRepairCandidate(repair.id);
      const validation = await api.validateRepair(repair.id, expected.trim() || null);
      return {
        repair: validation,
        status: validation.validation.status,
      };
    },
    onSuccess: (result) => {
      setChecked(result);
      const summary = `Validation ${result.status}. The draft was not changed.`;
      setNote(summary);
      toast.message(summary);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not validate the repair");
    },
  });

  const adopt = useMutation({
    mutationFn: async (mode: "validated" | "unvalidated") => {
      if (!checked) throw new Error("Validate the repair first");
      return api.adoptRepair(checked.repair.id, checked.repair.base_draft_revision, mode);
    },
    onSuccess: (adopted, mode) => {
      const summary = `Draft updated (${mode}). This did not publish.`;
      setNote(summary);
      toast.success(summary);
      if (run.workflow_id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflow(run.workflow_id) });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.runRepair(adopted.id) });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not update the draft");
    },
  });

  const busy = validate.isPending || adopt.isPending;

  return (
    <SectionCard
      title="Fix this run"
      description="Compares a repair candidate with this run. Adoption updates the draft and does not publish."
    >
      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>I consent to include this run&apos;s input and output in the repair record.</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Expected output (optional)</span>
          <Input
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="What the run should have produced"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!consent || busy || !run.workflow_id}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? "Checking…" : "Check this run"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || checked?.status !== "passed"}
            onClick={() => adopt.mutate("validated")}
          >
            Adopt validated draft
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !checked}
            onClick={() => adopt.mutate("unvalidated")}
          >
            Adopt without validation
          </Button>
        </div>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
    </SectionCard>
  );
}
