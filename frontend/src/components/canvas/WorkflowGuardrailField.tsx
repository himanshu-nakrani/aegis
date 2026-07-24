"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { WorkflowGuardrailMode } from "@/types/workflow";

const NONE = "__none__";

interface WorkflowGuardrailFieldProps {
  policyId?: string;
  mode?: WorkflowGuardrailMode;
  onChange: (patch: {
    workflowGuardrailPolicyId?: string;
    workflowGuardrailMode?: WorkflowGuardrailMode;
  }) => void;
}

/**
 * Trigger-node control for a workflow-level guardrail policy. The chosen policy
 * is enforced on every agent's model input/output at run time via an ADK plugin
 * — no per-node guardrails required. Lists the user's saved policies (adopt one
 * from the guardrail playground's templates first).
 */
export function WorkflowGuardrailField({ policyId, mode, onChange }: WorkflowGuardrailFieldProps) {
  const { data: policies = [] } = useQuery({
    queryKey: ["guardrail-policies"],
    queryFn: api.listGuardrailPolicies,
  });

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2.5">
      <Label className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-muted" aria-hidden />
        Workflow guardrail policy
      </Label>
      <Select
        value={policyId || NONE}
        onValueChange={(value) =>
          onChange({
            workflowGuardrailPolicyId: value === NONE ? undefined : value,
            // Default to guarding both sides when a policy is first attached.
            workflowGuardrailMode: value === NONE ? undefined : mode || "both",
          })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {policies.map((policy) => (
            <SelectItem key={policy.id} value={policy.id}>
              {policy.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {policyId && (
        <Select
          value={mode || "both"}
          onValueChange={(value) =>
            onChange({ workflowGuardrailMode: value as WorkflowGuardrailMode })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Guard input &amp; output</SelectItem>
            <SelectItem value="input">Guard input only</SelectItem>
            <SelectItem value="output">Guard output only</SelectItem>
          </SelectContent>
        </Select>
      )}

      <p className="form-hint">
        {policyId
          ? "Applied to every agent's model call across this workflow."
          : "Attach a saved policy to guard every agent, workflow-wide."}
      </p>
    </div>
  );
}
