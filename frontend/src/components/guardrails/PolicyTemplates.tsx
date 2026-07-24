"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { api, type GuardrailPolicyTemplate } from "@/lib/api";
import type { GuardrailMode, GuardrailType } from "@/types/workflow";
import type { PlaygroundConfig } from "@/components/guardrails/SavedPolicies";

interface PolicyTemplatesProps {
  /** Load a template's core config into the playground form for a quick test. */
  onLoad: (config: PlaygroundConfig) => void;
}

/** Best-effort playground config from a template's full rules. The playground
 *  form only tests type/mode/keywords; richer rules (presidio entities,
 *  moderation thresholds) survive only when the template is adopted. */
function toConfig(template: GuardrailPolicyTemplate): PlaygroundConfig {
  const r = template.rules_json;
  const keywords = Array.isArray(r.blocked_keywords)
    ? (r.blocked_keywords as unknown[]).filter((k): k is string => typeof k === "string")
    : [];
  return {
    guardrail_type: (typeof r.guardrail_type === "string"
      ? r.guardrail_type
      : "rules") as GuardrailType,
    mode: (r.mode === "input" ? "input" : "output") as GuardrailMode,
    blocked_keywords: keywords,
    sample: "",
  };
}

/** Compact "type · mode · behavior" descriptor line from a template's rules. */
function ruleSummary(r: Record<string, unknown>): string {
  const parts = [r.guardrail_type, r.mode, r.fail_behavior].filter(
    (p): p is string => typeof p === "string"
  );
  return parts.join(" · ");
}

/**
 * Built-in guardrail policy templates — one-click starting points. "Adopt"
 * creates an owned, editable copy in Saved policies; "Load" drops the core
 * config into the playground for a quick test.
 */
export function PolicyTemplates({ onLoad }: PolicyTemplatesProps) {
  const queryClient = useQueryClient();
  const [adopting, setAdopting] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["guardrail-policy-templates"],
    queryFn: api.getGuardrailPolicyTemplates,
    staleTime: 5 * 60_000,
  });

  const adopt = async (template: GuardrailPolicyTemplate) => {
    setAdopting(template.id);
    try {
      await api.createGuardrailPolicy({
        name: template.name,
        description: template.description,
        rules_json: template.rules_json,
      });
      await queryClient.invalidateQueries({ queryKey: ["guardrail-policies"] });
      toast.success(`Adopted "${template.name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't adopt template");
    } finally {
      setAdopting(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface shadow-elev-1">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-muted" aria-hidden />
          Policy templates
        </h2>
        <p className="mt-0.5 text-2xs text-subtle">
          Pre-built guardrails — adopt one to add an editable copy to your saved policies.
        </p>
      </header>

      <div className="p-4">
        {isLoading ? (
          <LoadingState variant="list" label="Loading templates…" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {template.name}
                    </p>
                    <span className="shrink-0 rounded border border-border bg-surface-input px-1.5 py-0.5 font-mono text-micro lowercase text-muted">
                      {template.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{template.description}</p>
                  <p className="mt-1 font-mono text-2xs lowercase text-subtle">
                    {ruleSummary(template.rules_json)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      onLoad(toConfig(template));
                      toast.success(`Loaded "${template.name}" into the playground`);
                    }}
                  >
                    Load
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1.5 px-2"
                    disabled={adopting === template.id}
                    onClick={() => adopt(template)}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {adopting === template.id ? "Adopting…" : "Adopt"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
