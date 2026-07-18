"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, type GuardrailPolicy } from "@/lib/api";
import type { GuardrailMode, GuardrailType } from "@/types/workflow";

/** The playground config a policy captures — kept flat inside rules_json. */
export interface PlaygroundConfig {
  guardrail_type: GuardrailType;
  mode: GuardrailMode;
  blocked_keywords: string[];
  sample: string;
}

interface SavedPoliciesProps {
  /** Snapshot of the current playground config, saved on "Save as policy". */
  currentConfig: PlaygroundConfig;
  /** Load a policy's config back into the playground. */
  onLoad: (config: PlaygroundConfig) => void;
}

const GUARDRAIL_TYPES: GuardrailType[] = ["rules", "presidio", "prompt_injection", "llm"];

/** Coerce a policy's stored rules_json into a valid playground config. */
function configFromRules(rules: Record<string, unknown>): PlaygroundConfig {
  const type = rules.guardrail_type;
  const mode = rules.mode;
  const keywords = rules.blocked_keywords;
  return {
    guardrail_type: GUARDRAIL_TYPES.includes(type as GuardrailType)
      ? (type as GuardrailType)
      : "rules",
    mode: mode === "input" ? "input" : "output",
    blocked_keywords: Array.isArray(keywords)
      ? keywords.filter((k): k is string => typeof k === "string")
      : [],
    sample: typeof rules.sample === "string" ? rules.sample : "",
  };
}

export function SavedPolicies({ currentConfig, onLoad }: SavedPoliciesProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GuardrailPolicy | null>(null);

  const {
    data: policies = [],
    isLoading,
  } = useQuery({
    queryKey: ["guardrail-policies"],
    queryFn: api.listGuardrailPolicies,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["guardrail-policies"] });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name the policy before saving");
      return;
    }
    setSaving(true);
    try {
      await api.createGuardrailPolicy({
        name: name.trim(),
        rules_json: {
          guardrail_type: currentConfig.guardrail_type,
          mode: currentConfig.mode,
          blocked_keywords: currentConfig.blocked_keywords,
          sample: currentConfig.sample,
        },
      });
      await invalidate();
      setName("");
      toast.success(`Saved policy "${name.trim()}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface shadow-elev-1">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Saved policies
        </h2>
        <p className="mt-0.5 text-2xs text-subtle">
          Save the current playground configuration and reload it later.
        </p>
      </header>

      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="policy-name">Policy name</Label>
            <Input
              id="policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="pii_output_block"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save current config"}
          </Button>
        </div>

        {isLoading ? (
          <LoadingState variant="list" label="Loading policies…" />
        ) : policies.length === 0 ? (
          <EmptyState
            compact
            icon={Bookmark}
            title="No saved policies yet"
            description="Configure a guardrail above, then save it to reuse the setup."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {policies.map((policy) => {
              const config = configFromRules(policy.rules_json);
              return (
                <li
                  key={policy.id}
                  className="group flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {policy.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-2xs lowercase text-muted">
                      {config.guardrail_type} · {config.mode}
                      {config.blocked_keywords.length > 0
                        ? ` · ${config.blocked_keywords.length} keywords`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2"
                      onClick={() => {
                        onLoad(config);
                        toast.success(`Loaded "${policy.name}"`);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Load
                    </Button>
                    <button
                      type="button"
                      aria-label={`Delete policy ${policy.name}`}
                      onClick={() => setDeleteTarget(policy)}
                      className="focus-ring rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete policy?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed. Workflows referencing it fall back to node-level rules.`
            : ""
        }
        confirmLabel={deleteTarget ? `Delete '${deleteTarget.name}'` : "Delete"}
        loadingLabel="Deleting policy…"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await api.deleteGuardrailPolicy(deleteTarget.id);
            await invalidate();
            toast.success("Policy deleted");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Failed to delete policy"
            );
          }
        }}
      />
    </section>
  );
}
