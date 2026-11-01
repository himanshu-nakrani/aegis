"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FlaskConical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineQueryError } from "@/components/ui/inline-error";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { api, type PromptDetail } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/format-date";

export default function PromptsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newVersionTemplate, setNewVersionTemplate] = useState<string | null>(null);
  // P7b: delete is gated behind a confirm — bound agent nodes fall back to
  // their inline instruction on delete, which the user must see.
  const [deleteTarget, setDeleteTarget] = useState<PromptDetail | null>(null);

  const promptsQuery = useQuery({
    queryKey: queryKeys.prompts,
    queryFn: () => api.listPrompts(),
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.prompt(selectedId ?? ""),
    queryFn: () => api.getPrompt(selectedId!),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.prompts });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.prompt(selectedId) });
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createPrompt({ name: newName.trim(), template: newTemplate }),
    onSuccess: (prompt) => {
      toast.success(`Prompt "${prompt.name}" created`);
      setNewName("");
      setNewTemplate("");
      setSelectedId(prompt.id);
      setNewVersionTemplate(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const versionMutation = useMutation({
    mutationFn: (template: string) =>
      api.createPromptVersion(selectedId!, { template }),
    onSuccess: (version) => {
      toast.success(`Version ${version.version} is now current`);
      setNewVersionTemplate(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rollbackMutation = useMutation({
    mutationFn: (version: number) =>
      api.rollbackPromptVersion(selectedId!, version),
    onSuccess: () => {
      toast.success("Rolled back");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePrompt(deleteTarget!.id),
    onSuccess: () => {
      toast.success("Prompt deleted");
      setDeleteTarget(null);
      setSelectedId(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const detail: PromptDetail | undefined = detailQuery.data;
  const prompts = promptsQuery.data ?? [];
  const currentVersion = detail
    ? detail.versions.find((version) => version.version === detail.current_version)
    : undefined;
  const olderVersions = detail
    ? detail.versions.filter((version) => version.version !== detail.current_version)
    : [];

  return (
    <Page>
      <PageHeader
        title="Prompts"
        description="Versioned prompts for agent nodes and model testing."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <SectionCard title="New prompt">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="prompt-name">Name</Label>
                <Input
                  id="prompt-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="support-triage"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-template">Template</Label>
                <Textarea
                  id="prompt-template"
                  rows={7}
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value)}
                  placeholder="You are a triage assistant. Classify: {{input}}"
                />
              </div>
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || !newTemplate.trim() || createMutation.isPending}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Create prompt
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Registry">
            {promptsQuery.isError && (
              <div className="mb-3">
                <InlineQueryError
                  message="Couldn't load prompts"
                  detail={promptsQuery.error.message}
                  onRetry={() => void promptsQuery.refetch()}
                />
              </div>
            )}
            {promptsQuery.isLoading ? (
              <LoadingState label="Loading prompts…" />
            ) : promptsQuery.isError && !promptsQuery.data ? null : prompts.length === 0 ? (
              <EmptyState
                title="No prompts yet"
                description="Create your first versioned prompt above."
              />
            ) : (
              <ul className="divide-y divide-border">
                {prompts.map((prompt) => (
                  <li key={prompt.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(prompt.id);
                        setNewVersionTemplate(null);
                      }}
                      className={`focus-ring flex w-full items-start justify-between gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors hover:bg-surface-input ${
                        selectedId === prompt.id ? "bg-surface-input" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{prompt.name}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted">
                          v{prompt.current_version} · {prompt.version_count} version
                          {prompt.version_count === 1 ? "" : "s"} · updated{" "}
                          {prompt.updated_at ? formatRelativeTime(prompt.updated_at) : "—"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {selectedId && detailQuery.isLoading ? (
            <SectionCard title="Versions" className="flex flex-1 flex-col" bodyClassName="flex flex-1 flex-col justify-center">
              <LoadingState label="Loading prompt…" />
            </SectionCard>
          ) : selectedId && detailQuery.isError && !detail ? (
            <SectionCard title="Versions" className="flex flex-1 flex-col" bodyClassName="flex flex-1 flex-col justify-center">
              <InlineQueryError
                message="Couldn't load prompt versions"
                detail={detailQuery.error.message}
                onRetry={() => void detailQuery.refetch()}
              />
            </SectionCard>
          ) : !detail ? (
            <SectionCard title="Versions" className="flex flex-1 flex-col" bodyClassName="flex flex-1 flex-col justify-center">
              <EmptyState
                title="Select a prompt"
                description="Choose a prompt to inspect its versions."
              />
              <div className="mt-3">
                <Button asChild variant="outline" size="sm">
                  <Link href="/playground">
                    <FlaskConical className="mr-1.5 h-3.5 w-3.5" /> Open playground
                  </Link>
                </Button>
              </div>
            </SectionCard>
          ) : (
            <>
              <SectionCard
                title={detail.name}
                description={`Current version · v${detail.current_version}`}
                actions={
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/playground?prompt=${detail.id}`}>
                        <FlaskConical className="mr-1.5 h-3.5 w-3.5" /> Playground
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      // P7b: confirm before delete — bound agent nodes fall
                      // back to their inline instruction on delete.
                      onClick={() => setDeleteTarget(detail)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                }
              >
                {detailQuery.isError && (
                  <div className="mb-3">
                      <InlineQueryError
                        message="Couldn't load prompt versions"
                        detail={detailQuery.error.message}
                        onRetry={() => void detailQuery.refetch()}
                      />
                    </div>
                  )}
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-surface-input p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Current template
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                      {currentVersion?.template ?? ""}
                    </pre>
                    {currentVersion && currentVersion.variables.length > 0 && (
                      <p className="mt-3 text-xs text-muted">
                        Variables: {currentVersion.variables.join(", ")}
                      </p>
                    )}
                    {currentVersion?.notes && (
                      <p className="mt-2 text-xs italic text-muted">
                        {currentVersion.notes}
                      </p>
                    )}
                  </div>

                  {olderVersions.length > 0 && (
                    <details className="group rounded-lg border border-border bg-surface">
                      <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-input [&::-webkit-details-marker]:hidden">
                        <span>
                          Version history{" "}
                          <span className="font-normal text-muted">
                            ({olderVersions.length})
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-border p-4">
                        <ul className="space-y-3">
                          {olderVersions.map((version) => (
                            <li
                              key={version.version}
                              className="rounded-md border border-border p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                  v{version.version}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => rollbackMutation.mutate(version.version)}
                                  disabled={rollbackMutation.isPending}
                                >
                                  Roll back here
                                </Button>
                              </div>
                              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
                                {version.template}
                              </pre>
                              {version.variables.length > 0 && (
                                <p className="mt-2 text-xs text-muted">
                                  Variables: {version.variables.join(", ")}
                                </p>
                              )}
                              {version.notes && (
                                <p className="mt-2 text-xs italic text-muted">
                                  {version.notes}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  )}
                </div>
              </SectionCard>

              <details className="group rounded-lg border border-border bg-surface">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-input [&::-webkit-details-marker]:hidden">
                  Publish a new version
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-prompt-version">Template</Label>
                  <Textarea
                      id="new-prompt-version"
                      rows={7}
                    value={
                      newVersionTemplate ??
                        currentVersion?.template ??
                      ""
                    }
                    onChange={(e) => setNewVersionTemplate(e.target.value)}
                  />
                  </div>
                  <Button
                    onClick={() =>
                      versionMutation.mutate(
                        newVersionTemplate ??
                          currentVersion?.template ??
                          ""
                      )
                    }
                    disabled={versionMutation.isPending}
                  >
                    Publish version {detail.versions.length + 1}
                  </Button>
                  <p className="form-hint">
                    New versions become current; pinned nodes keep their selected version.
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete prompt "${deleteTarget?.name ?? ""}"?`}
        description="Agent nodes bound to this prompt (promptRef) will fall back to their inline instruction. The delete is not reversible."
        confirmLabel="Delete prompt"
        loadingLabel="Deleting…"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteMutation.mutateAsync();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete prompt");
            throw error;
          }
        }}
      />
    </Page>
  );
}
