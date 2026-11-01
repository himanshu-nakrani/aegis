"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineQueryError } from "@/components/ui/inline-error";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, type PromptDetail } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/format-date";

export default function PromptsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingPrompt, setCreatingPrompt] = useState(false);
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
      setCreatingPrompt(false);
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

      <div className="grid gap-8 border-t border-border pt-6 xl:grid-cols-[minmax(15rem,0.75fr)_minmax(0,2fr)]">
        <aside className="min-w-0" aria-labelledby="prompt-registry-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <h2 id="prompt-registry-heading" className="text-sm font-semibold text-foreground">
              Registry
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreatingPrompt(true);
                setNewVersionTemplate(null);
              }}
            >
              New prompt
            </Button>
          </div>

          {promptsQuery.isError && (
            <div className="py-3">
              <InlineQueryError
                message="Couldn't load prompts"
                detail={promptsQuery.error.message}
                onRetry={() => void promptsQuery.refetch()}
              />
            </div>
          )}
          {promptsQuery.isLoading ? (
            <div className="py-8">
              <LoadingState label="Loading prompts…" />
            </div>
          ) : promptsQuery.isError && !promptsQuery.data ? null : prompts.length === 0 ? (
            <p className="py-4 text-sm text-muted">No prompts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {prompts.map((prompt) => (
                <li key={prompt.id}>
                  <button
                    type="button"
                    aria-pressed={!creatingPrompt && selectedId === prompt.id}
                    onClick={() => {
                      setSelectedId(prompt.id);
                      setCreatingPrompt(false);
                      setNewVersionTemplate(null);
                    }}
                    className={
                      "focus-ring w-full border-l-2 px-3 py-3 text-left transition-colors hover:bg-surface-input " +
                      (!creatingPrompt && selectedId === prompt.id
                        ? "border-foreground bg-surface-input"
                        : "border-transparent")
                    }
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {prompt.name}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      v{prompt.current_version} · {prompt.version_count} version
                      {prompt.version_count === 1 ? "" : "s"} ·{" "}
                      {prompt.updated_at ? formatRelativeTime(prompt.updated_at) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="min-w-0 border-t border-border pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
          {creatingPrompt ? (
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    New prompt
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Create a reusable prompt template.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCreatingPrompt(false)}>
                  Cancel
                </Button>
              </div>
              <div className="mt-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="prompt-name">Name</Label>
                  <Input
                    id="prompt-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="support-triage"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prompt-template">Template</Label>
                  <Textarea
                    id="prompt-template"
                    rows={12}
                    className="font-mono text-sm leading-6"
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    placeholder="You are a triage assistant. Classify: {{input}}"
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={
                    !newName.trim() ||
                    !newTemplate.trim() ||
                    createMutation.isPending
                  }
                >
                  Create prompt
                </Button>
              </div>
            </div>
          ) : selectedId && detailQuery.isLoading ? (
            <div className="py-10">
              <LoadingState label="Loading prompt…" />
            </div>
          ) : selectedId && detailQuery.isError && !detail ? (
            <InlineQueryError
              message="Couldn't load prompt versions"
              detail={detailQuery.error.message}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : !detail ? (
            <div className="max-w-xl py-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Prompt editor
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Select a prompt from the registry or create one to edit its template and
                version history.
              </p>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold tracking-tight text-foreground">
                    {detail.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Current version · v{detail.current_version}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={"/playground?prompt=" + detail.id}>Open in Playground</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(detail)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {detailQuery.isError && (
                <div className="mt-4">
                  <InlineQueryError
                    message="Couldn't refresh prompt versions"
                    detail={detailQuery.error.message}
                    onRetry={() => void detailQuery.refetch()}
                  />
                </div>
              )}

              <div className="mt-6 max-w-4xl space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-prompt-version">Template</Label>
                  <Textarea
                    id="new-prompt-version"
                    rows={14}
                    className="font-mono text-sm leading-6"
                    value={
                      newVersionTemplate ??
                      currentVersion?.template ??
                      ""
                    }
                    onChange={(e) => setNewVersionTemplate(e.target.value)}
                  />
                </div>
                {currentVersion &&
                  (currentVersion.variables.length > 0 || currentVersion.notes) && (
                    <div className="space-y-1 text-xs leading-5 text-muted">
                      {currentVersion.variables.length > 0 && (
                        <p>Current variables: {currentVersion.variables.join(", ")}</p>
                      )}
                      {currentVersion.notes && <p>{currentVersion.notes}</p>}
                    </div>
                  )}
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="form-hint">
                    Publishing makes this the current version. Pinned nodes keep their
                    selected version.
                  </p>
                  <Button
                    className="w-full sm:w-auto"
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
                </div>
              </div>

              {olderVersions.length > 0 && (
                <details className="mt-8 max-w-4xl border-t border-border">
                  <summary className="focus-ring cursor-pointer py-4 text-sm font-medium text-foreground">
                    Version history
                    <span className="ml-2 font-normal text-muted">
                      {olderVersions.length} older
                    </span>
                  </summary>
                  <ul className="divide-y divide-border border-t border-border">
                    {olderVersions.map((version) => (
                      <li key={version.version} className="py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-sm font-medium text-foreground">
                            Version {version.version}
                          </h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => rollbackMutation.mutate(version.version)}
                            disabled={rollbackMutation.isPending}
                          >
                            Restore this version
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
                          <p className="mt-2 text-xs italic text-muted">{version.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={'Delete prompt "' + (deleteTarget?.name ?? "") + '"?'}
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
