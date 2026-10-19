"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Play, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type PlaygroundModelTarget, type PlaygroundRunResponse } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { LLM_PROVIDERS, getProvider } from "@/lib/llm-providers";

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;

function extractVariables(template: string): string[] {
  const seen: string[] = [];
  const pattern = new RegExp(VARIABLE_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}
function PlaygroundInner() {
  const params = useSearchParams();
  const [promptId, setPromptId] = useState<string>(params.get("prompt") ?? "");
  const [version, setVersion] = useState<string>("current");
  const [template, setTemplate] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [models, setModels] = useState<PlaygroundModelTarget[]>([
    { provider: "google", model: "gemini-2.5-flash" },
  ]);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<PlaygroundRunResponse | null>(null);

  const promptsQuery = useQuery({ queryKey: queryKeys.prompts, queryFn: () => api.listPrompts() });
  const promptDetailQuery = useQuery({
    queryKey: queryKeys.prompt(promptId),
    queryFn: () => api.getPrompt(promptId),
    enabled: !!promptId,
  });

  const prompts = promptsQuery.data ?? [];
  const detail = promptDetailQuery.data;

  const activeTemplate = promptId
    ? (version === "current"
        ? detail?.versions.find((v) => v.version === detail.current_version)?.template
        : detail?.versions.find((v) => v.version === Number(version))?.template) ?? ""
    : template;

  // Seed variable fields when the template's variable set changes.
  const variableNames = extractVariables(activeTemplate).filter(
    (name) => !["input", "last_output"].includes(name) && !name.startsWith("steps.")
  );
  useEffect(() => {
    setVariables((prev) => {
      const next: Record<string, string> = {};
      for (const name of variableNames) next[name] = prev[name] ?? "";
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variableNames.join("|")]);

  const updateModel = (index: number, patch: Partial<PlaygroundModelTarget>) =>
    setModels((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const run = async () => {
    setRunning(true);
    setResponse(null);
    try {
      const result = await api.runPlayground({
        ...(promptId
          ? { prompt_id: promptId, ...(version !== "current" ? { version: Number(version) } : {}) }
          : { template }),
        variables,
        // resolve_provider_model rejects caller api_base (SSRF). Omit it so a
        // stale row can't turn a run into a per-variant error.
        models: models
          .filter((m) => m.model.trim())
          .map((m) => ({
            provider: m.provider,
            model: m.model,
            credential_id: m.credential_id,
            credential_name: m.credential_name,
          })),
      });
      setResponse(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Playground run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Playground"
        description="Render a prompt and compare outputs across models — no workflow required."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <SectionCard title="Prompt">
            <div className="space-y-3">
              <Select
                value={promptId || "inline"}
                onValueChange={(v) => {
                  setPromptId(v === "inline" ? "" : v);
                  setVersion("current");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Inline template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inline">Inline template</SelectItem>
                  {prompts.map((prompt) => (
                    <SelectItem key={prompt.id} value={prompt.id}>
                      {prompt.name} (v{prompt.current_version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {promptId ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-xs text-muted">Version</Label>
                    <Select value={version} onValueChange={setVersion}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">Current</SelectItem>
                        {(detail?.versions ?? []).map((v) => (
                          <SelectItem key={v.version} value={String(v.version)}>
                            v{v.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface-input p-3 text-xs text-muted">
                    {activeTemplate || "Loading template…"}
                  </pre>
                </div>
              ) : (
                <Textarea
                  rows={6}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="Summarize {{doc}} in two sentences."
                />
              )}
            </div>
          </SectionCard>

          {variableNames.length > 0 && (
            <SectionCard title="Variables">
              <div className="space-y-3">
                {variableNames.map((name) => (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={`var-${name}`}>{`{{${name}}}`}</Label>
                    <Input
                      id={`var-${name}`}
                      value={variables[name] ?? ""}
                      onChange={(e) =>
                        setVariables((prev) => ({ ...prev, [name]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Models"
            actions={
              <Button
                variant="outline"
                size="sm"
                disabled={models.length >= 10}
                onClick={() =>
                  setModels((prev) => [...prev, { provider: "google", model: "" }])
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add variant
              </Button>
            }
          >
            <div className="space-y-3">
              {models.map((target, index) => {
                const spec = getProvider(target.provider);
                return (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={target.provider}
                      onValueChange={(provider) =>
                        updateModel(index, {
                          provider,
                          model: getProvider(provider).defaultModels[0] ?? "",
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LLM_PROVIDERS.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-1 flex-col gap-1">
                      <Input
                        value={target.model}
                        onChange={(e) => updateModel(index, { model: e.target.value })}
                        placeholder={spec?.defaultModels[0] ?? "model id"}
                        list={`playground-models-${index}`}
                      />
                      <datalist id={`playground-models-${index}`}>
                        {(spec?.defaultModels ?? []).map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                      {spec?.needsCredential && (
                        // P7a: runs can also bind a credential by name/id.
                        <Input
                          value={target.credential_name ?? ""}
                          onChange={(e) =>
                            updateModel(index, { credential_name: e.target.value || null })
                          }
                          placeholder="credential name or id (optional)"
                          className="text-xs"
                        />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={models.length === 1}
                      onClick={() => setModels((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remove variant"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              <Button
                onClick={() => void run()}
                // P7a: min_length=1 on `models` server-side — empty or all-
                // blank rows must not reach a 400.
                disabled={
                  running ||
                  (!promptId && !template.trim()) ||
                  models.filter((m) => m.model.trim()).length === 0
                }
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {running ? "Running…" : "Run"}
              </Button>
            </div>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Outputs">
            {!response ? (
              <p className="text-sm text-muted">
                Run the prompt to compare outputs side by side.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Rendered template
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-surface-input p-3 text-xs">
                    {response.rendered_template}
                  </pre>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {response.results.map((result, index) => (
                    <div key={index} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {result.provider} / {result.model}
                        </span>
                        {result.latency_ms !== null && (
                          <span className="text-xs text-muted">{result.latency_ms}ms</span>
                        )}
                      </div>
                      {result.error ? (
                        <p className="mt-2 text-xs text-destructive">{result.error}</p>
                      ) : (
                        <pre className="mt-2 whitespace-pre-wrap text-sm">
                          {result.output}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </Page>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense>
      <PlaygroundInner />
    </Suspense>
  );
}
