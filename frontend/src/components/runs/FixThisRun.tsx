"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowGraph } from "@/types/workflow";
import type { WorkflowRun } from "@/types/workflow";

interface FixThisRunProps {
  run: WorkflowRun;
}

/**
 * Records consent, stores the current draft as a repair candidate, and adopts
 * that candidate as the new draft. Adoption never publishes the workflow.
 */
export function FixThisRun({ run }: FixThisRunProps) {
  const queryClient = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const mutation = useMutation({
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
      const fresh = await api.getWorkflow(run.workflow_id);
      const mode = validation.validation.status === "passed" ? "validated" : "unvalidated";
      const adopted = await api.adoptRepair(repair.id, fresh.draft_revision ?? 0, mode);
      return { adopted, mode, status: validation.validation.status };
    },
    onSuccess: (result) => {
      const summary = `Draft updated (${result.mode}, validation ${result.status}). This did not publish.`;
      setNote(summary);
      toast.success(summary);
      if (run.workflow_id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflow(run.workflow_id) });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.runRepair(result.adopted.id) });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not update the draft");
    },
  });

  return (
    <SectionCard
      title="Fix this run"
      description="Updates the draft from this run. It does not publish."
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
        <Button
          type="button"
          size="sm"
          disabled={!consent || mutation.isPending || !run.workflow_id}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Updating draft…" : "Update draft"}
        </Button>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
    </SectionCard>
  );
}
