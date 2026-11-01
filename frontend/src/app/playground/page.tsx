"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";
import { InlineQueryError } from "@/components/ui/inline-error";
import { formatDurationMs } from "@/lib/format";
import { formatRelativeTime } from "@/lib/format-date";
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
const CREDENTIAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A pasted credential UUID is an id lookup. Anything else is an exact name. */
function credentialBinding(raw: string): Pick<PlaygroundModelTarget, "credential_id" | "credential_name"> {
  const value = raw.trim();
  if (!value) return { credential_id: null, credential_name: null };
  if (CREDENTIAL_UUID.test(value)) return { credential_id: value, credential_name: null };
  return { credential_id: null, credential_name: value };
}

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
  const queryClient = useQueryClient();
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
  const historyQuery = useQuery({
    queryKey: queryKeys.playgroundRuns,
    queryFn: () => api.listPlaygroundRuns(),
  });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.playgroundRuns });
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
        description="Edit a prompt, set model targets, then run a comparison."
      />

      <div className="grid gap-8 border-t border-border pt-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <main className="min-w-0 space-y-8">
          <section aria-labelledby="playground-prompt-heading">
            <div className="mb-4 border-b border-border pb-3">
              <h2
                id="playground-prompt-heading"
                className="text-base font-semibold text-foreground"
              >
                Prompt
              </h2>
            </div>

            {promptsQuery.isError && (
              <div className="mb-4">
                <InlineQueryError
                  message="Couldn't load saved prompts"
                  detail={promptsQuery.error.message}
                  onRetry={() => void promptsQuery.refetch()}
                />
              </div>
            )}

            <div className="space-y-5">
              <div className={promptId ? "grid gap-4 sm:grid-cols-2" : "space-y-2"}>
                <div className="space-y-2">
                  <Label htmlFor="playground-prompt-source">Prompt source</Label>
                  <Select
                    value={promptId || "inline"}
                    onValueChange={(value) => {
                      setPromptId(value === "inline" ? "" : value);
                      setVersion("current");
                    }}
                  >
                    <SelectTrigger id="playground-prompt-source" className="w-full">
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
                </div>

                {promptId && (
                  <div className="space-y-2">
                    <Label htmlFor="playground-prompt-version">Version</Label>
                    <Select value={version} onValueChange={setVersion}>
                      <SelectTrigger id="playground-prompt-version" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">Current</SelectItem>
                        {(detail?.versions ?? []).map((item) => (
                          <SelectItem key={item.version} value={String(item.version)}>
                            v{item.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {promptId ? (
                <details className="border-t border-border pt-3">
                  <summary className="focus-ring cursor-pointer py-2 text-sm font-medium text-foreground">
                    Selected template
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words border-l-2 border-border pl-4 text-sm leading-6 text-muted">
                    {activeTemplate || "Loading template…"}
                  </pre>
                </details>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="playground-inline-template">Template</Label>
                  <Textarea
                    id="playground-inline-template"
                    rows={10}
                    className="font-mono text-sm leading-6"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder="Summarize {{doc}} in two sentences."
                  />
                </div>
              )}
            </div>
          </section>

          {variableNames.length > 0 && (
            <section aria-labelledby="playground-variables-heading">
              <div className="mb-4 border-b border-border pb-3">
                <h2
                  id="playground-variables-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Variables
                </h2>
              </div>
              <div className="space-y-4">
                {variableNames.map((name) => (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={"var-" + name}>{name}</Label>
                    <Input
                      id={"var-" + name}
                      value={variables[name] ?? ""}
                      onChange={(e) =>
                        setVariables((previous) => ({
                          ...previous,
                          [name]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="playground-models-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <h2
                id="playground-models-heading"
                className="text-base font-semibold text-foreground"
              >
                Models
              </h2>
              <Button
                variant="outline"
                size="sm"
                disabled={models.length >= 10}
                onClick={() =>
                  setModels((previous) => [
                    ...previous,
                    { provider: "google", model: "" },
                  ])
                }
              >
                Add variant
              </Button>
            </div>

            <div className="divide-y divide-border border-y border-border">
              {models.map((target, index) => {
                const spec = getProvider(target.provider);
                const credential =
                  target.credential_id || target.credential_name || "";
                return (
                  <fieldset key={index} className="min-w-0 py-5">
                    <legend className="sr-only">Variant {index + 1}</legend>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium text-foreground">
                        Variant {index + 1}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={models.length === 1}
                        onClick={() =>
                          setModels((previous) =>
                            previous.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                        aria-label={"Remove variant " + (index + 1)}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor={"playground-provider-" + index}>Provider</Label>
                        <Select
                          value={target.provider}
                          onValueChange={(provider) =>
                            updateModel(index, {
                              provider,
                              model: getProvider(provider).defaultModels[0] ?? "",
                            })
                          }
                        >
                          <SelectTrigger
                            id={"playground-provider-" + index}
                            className="w-full"
                          >
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
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor={"playground-model-" + index}>Model</Label>
                        <Input
                          id={"playground-model-" + index}
                          value={target.model}
                          onChange={(e) =>
                            updateModel(index, { model: e.target.value })
                          }
                          placeholder={spec?.defaultModels[0] ?? "model id"}
                          list={"playground-models-" + index}
                        />
                        <datalist id={"playground-models-" + index}>
                          {(spec?.defaultModels ?? []).map((model) => (
                            <option key={model} value={model} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {spec?.needsCredential && (
                      <details className="mt-4 border-t border-border pt-3">
                        <summary className="focus-ring cursor-pointer py-1 text-sm text-muted hover:text-foreground">
                          Credentials
                          <span className="ml-2 text-xs">
                            {credential ? "configured" : "optional"}
                          </span>
                        </summary>
                        <div className="mt-3 max-w-xl space-y-1.5">
                          <Label htmlFor={"playground-credential-" + index}>
                            Credential name or ID
                          </Label>
                          <Input
                            id={"playground-credential-" + index}
                            value={credential}
                            onChange={(e) =>
                              updateModel(index, credentialBinding(e.target.value))
                            }
                            placeholder="Name or UUID"
                          />
                        </div>
                      </details>
                    )}
                  </fieldset>
                );
              })}
            </div>

            <div className="border-b border-border py-5">
              <Button
                className="w-full sm:w-auto"
                onClick={() => void run()}
                // P7a: min_length=1 on the models field server-side — empty or all-
                // blank rows must not reach a 400.
                disabled={
                  running ||
                  (!promptId && !template.trim()) ||
                  models.filter((model) => model.model.trim()).length === 0
                }
              >
                {running ? "Running…" : "Run"}
              </Button>
            </div>
          </section>
        </main>

        <section
          className="min-w-0 border-t border-border pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0"
          aria-labelledby="playground-outputs-heading"
        >
          <div className="mb-4 border-b border-border pb-3">
            <h2
              id="playground-outputs-heading"
              className="text-base font-semibold text-foreground"
            >
              Outputs
            </h2>
          </div>

          {!response ? (
            <p className="py-2 text-sm leading-6 text-muted">
              Run the configured models to see their responses here.
            </p>
          ) : (
            <div className="space-y-6">
              <details className="border-b border-border pb-4">
                <summary className="focus-ring cursor-pointer py-2 text-sm font-medium text-foreground">
                  Rendered template
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words border-l-2 border-border pl-4 text-sm leading-6 text-muted">
                  {response.rendered_template}
                </pre>
              </details>
              <div className="grid gap-6 2xl:grid-cols-2">
                {response.results.map((result, index) => (
                  <article key={index} className="min-w-0 border-t border-border pt-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="min-w-0 break-words text-sm font-medium text-foreground">
                        {result.provider} / {result.model}
                      </h3>
                      {result.latency_ms !== null && (
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                          {formatDurationMs(result.latency_ms)}
                        </span>
                      )}
                    </div>
                    {result.error ? (
                      <p className="mt-3 break-words text-sm leading-6 text-destructive">
                        {result.error}
                      </p>
                    ) : (
                      <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                        {result.output}
                      </pre>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="border-t border-border pt-6" aria-labelledby="playground-history-heading">
        <h2
          id="playground-history-heading"
          className="text-base font-semibold text-foreground"
        >
          Recent runs
        </h2>
        <div className="mt-3">
          {historyQuery.isError ? (
            <InlineQueryError
              message="Couldn't load recent runs"
              detail={historyQuery.error.message}
              onRetry={() => void historyQuery.refetch()}
            />
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="py-3 text-sm text-muted">No runs yet.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {(historyQuery.data ?? []).map((savedRun) => (
                <li key={savedRun.id}>
                  <button
                    type="button"
                    className="focus-ring w-full px-3 py-3 text-left transition-colors hover:bg-surface-input"
                    onClick={() => setResponse(savedRun)}
                  >
                    <span className="text-xs text-muted">
                      {savedRun.created_at
                        ? formatRelativeTime(savedRun.created_at)
                        : "Saved"}
                    </span>
                    <span className="mt-1 block truncate text-sm text-foreground">
                      {savedRun.rendered_template}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
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
