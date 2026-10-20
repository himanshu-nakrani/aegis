"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
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

  return (
    <Page>
      <PageHeader
        title="Prompts"
        description="Versioned prompt registry — bind agent nodes to a versioned template, or test one in the playground."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <SectionCard title="New prompt">
            <div className="space-y-3">
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
                  rows={5}
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
                      className={`flex w-full items-center justify-between gap-2 px-2 py-2.5 text-left text-sm hover:bg-surface-input ${
                        selectedId === prompt.id ? "bg-surface-input" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{prompt.name}</span>
                        <span className="block text-xs text-muted">
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

        <div className="space-y-6">
          {selectedId && detailQuery.isLoading ? (
            <SectionCard title="Versions">
              <LoadingState label="Loading prompt…" />
            </SectionCard>
          ) : selectedId && detailQuery.isError && !detail ? (
            <SectionCard title="Versions">
              <InlineQueryError
                message="Couldn't load prompt versions"
                detail={detailQuery.error.message}
                onRetry={() => void detailQuery.refetch()}
              />
            </SectionCard>
          ) : !detail ? (
            <SectionCard title="Versions">
              <EmptyState
                title="Select a prompt"
                description="Pick a prompt on the left to view versions, publish a new version, or roll back. Or try a template in the playground."
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
                title={`${detail.name} — v${detail.current_version} current`}
                actions={
                  <div className="flex items-center gap-2">
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
                <ul className="space-y-3">
                  {detail.versions.map((version) => (
                    <li
                      key={version.version}
                      className="rounded-md border border-border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          v{version.version}
                          {version.version === detail.current_version && (
                            <span className="ml-2 text-xs text-muted">current</span>
                          )}
                        </span>
                        {version.version !== detail.current_version && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => rollbackMutation.mutate(version.version)}
                            disabled={rollbackMutation.isPending}
                          >
                            Roll back here
                          </Button>
                        )}
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">
                        {version.template}
                      </pre>
                      {version.variables.length > 0 && (
                        <p className="mt-1 text-xs text-muted">
                          Variables: {version.variables.join(", ")}
                        </p>
                      )}
                      {version.notes && (
                        <p className="mt-1 text-xs text-muted italic">{version.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>

              <SectionCard title="New version">
                <div className="space-y-3">
                  <Textarea
                    rows={5}
                    value={
                      newVersionTemplate ??
                      detail.versions.find((v) => v.version === detail.current_version)
                        ?.template ??
                      ""
                    }
                    onChange={(e) => setNewVersionTemplate(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      versionMutation.mutate(
                        newVersionTemplate ??
                          detail.versions.find(
                            (v) => v.version === detail.current_version
                          )?.template ??
                          ""
                      )
                    }
                    disabled={versionMutation.isPending}
                  >
                    Publish version {detail.versions.length + 1}
                  </Button>
                  <p className="form-hint">
                    New versions become current immediately; nodes pinned to a specific
                    version keep their pin.
                  </p>
                </div>
              </SectionCard>
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
          await deleteMutation.mutateAsync();
        }}
      />
    </Page>
  );
}
