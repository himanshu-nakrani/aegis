"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, Brain, Database, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { VirtualList } from "@/components/ui/virtual-list";
import { api } from "@/lib/api";
import { pollJob } from "@/lib/job-poll";
import { queryKeys } from "@/lib/query-keys";

interface WorkflowDataPanelProps {
  workflowId: string;
}

export function WorkflowDataPanel({ workflowId }: WorkflowDataPanelProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [reindexing, setReindexing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { type: "delete-doc"; id: string; title: string }
    | { type: "clear-memory"; namespace?: string }
    | null
  >(null);

  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: queryKeys.workflowKnowledge(workflowId),
    queryFn: () => api.listKnowledge(workflowId),
  });
  const { data: memoryData, isLoading: memoryLoading } = useQuery({
    queryKey: queryKeys.workflowMemory(workflowId),
    queryFn: () => api.getWorkflowMemory(workflowId),
  });
  const memory = memoryData?.namespaces || {};
  const loading = docsLoading || memoryLoading;

  if (loading && docs.length === 0 && !memoryData) {
    return <LoadingState variant="card" label="Loading workflow data…" />;
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowKnowledge(workflowId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowMemory(workflowId) }),
    ]);
  };

  const handleAddDoc = async () => {
    if (!text.trim()) {
      toast.error("Document text is required");
      return;
    }
    setSaving(true);
    try {
      await api.createKnowledge(workflowId, {
        title: title.trim() || undefined,
        text: text.trim(),
      });
      setTitle("");
      setText("");
      await refresh();
      toast.success("Knowledge document added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add document");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async () => {
    const blocks = bulkText
      .split(/\n---\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    const documents = blocks.map((block) => {
      const lines = block.split("\n");
      const first = lines[0] || "";
      if (first.includes("|")) {
        const [title, ...rest] = first.split("|");
        return { title: title.trim(), text: [...rest, ...lines.slice(1)].join("\n").trim() };
      }
      return { title: lines.length > 1 ? first : undefined, text: lines.slice(1).join("\n").trim() || first };
    }).filter((d) => d.text);

    if (!documents.length) {
      toast.error("Add documents separated by --- or title|text per line");
      return;
    }
    setSaving(true);
    try {
      const result = await api.bulkImportKnowledge(workflowId, documents);
      setBulkText("");
      toast.success(`Queued import of ${result.document_count} documents`);
      const job = await pollJob(result.job_id);
      if (job.status === "completed") {
        await refresh();
        toast.success(`Imported ${String(job.result?.count ?? result.document_count)} documents`);
      } else {
        toast.error(job.error || "Import failed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk import failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const result = await api.reindexKnowledge(workflowId);
      toast.success(`Queued reindex for ${result.count} documents`);
      const job = await pollJob(result.job_id);
      if (job.status === "completed") {
        await refresh();
        toast.success(`Reindexed ${String(job.result?.count ?? result.count)} documents`);
      } else {
        toast.error(job.error || "Reindex failed");
      }
    } catch {
      toast.error("Reindex failed");
    } finally {
      setReindexing(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await api.deleteKnowledge(workflowId, id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflowKnowledge(workflowId) });
      toast.success("Document removed");
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const handleClearMemory = async (namespace?: string) => {
    try {
      await api.clearWorkflowMemory(workflowId, namespace);
      await refresh();
      toast.success(namespace ? `Cleared namespace "${namespace}"` : "Cleared all memory");
    } catch {
      toast.error("Failed to clear memory");
    }
  };

  const memoryNamespaces = Object.keys(memory);
  const embeddedDocs = docs.filter((doc) => doc.has_embedding).length;
  const memoryKeyCount = memoryNamespaces.reduce(
    (total, ns) => total + Object.keys(memory[ns] || {}).length,
    0
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-elev-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Workflow data</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Knowledge and memory available to this workflow at run time.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh workflow data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-background px-2.5 py-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted">Docs</p>
            <p className="mt-1 text-lg font-semibold leading-none text-foreground">{docs.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-2.5 py-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted">Embedded</p>
            <p className="mt-1 text-lg font-semibold leading-none text-foreground">{embeddedDocs}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-2.5 py-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted">Memory</p>
            <p className="mt-1 text-lg font-semibold leading-none text-foreground">{memoryKeyCount}</p>
          </div>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-3 shadow-elev-1">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
            <BookOpen className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Knowledge base</h3>
              <Badge variant="outline" className="ml-auto px-2 py-0.5 text-2xs">
                {docs.length} docs
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Indexed for vector RAG. Use retrieval method &quot;Vector embedding&quot; on KB Retrieve.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full justify-center" onClick={handleReindex} disabled={reindexing}>
          <RefreshCw className={`h-3.5 w-3.5 ${reindexing ? "animate-spin" : ""}`} />
          {reindexing ? "Reindexing…" : "Reindex embeddings"}
        </Button>

        {docs.length > 0 ? (
          <VirtualList
            items={docs}
            itemHeight={72}
            maxHeight={240}
            className="space-y-2"
            renderItem={(doc) => (
              <div className="group mb-2 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/30 hover:bg-surface-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <span className="truncate">{doc.title || "Untitled"}</span>
                      {doc.has_embedding && (
                        <Badge variant="success" className="shrink-0 px-1.5 py-0 text-2xs">
                          embedded
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{doc.text}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.title || "document"}`}
                    onClick={() =>
                      setConfirmAction({
                        type: "delete-doc",
                        id: doc.id,
                        title: doc.title || "Untitled",
                      })
                    }
                    className="shrink-0 opacity-0 transition group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted hover:text-destructive" />
                  </button>
                </div>
              </div>
            )}
          />
        ) : (
          <EmptyState
            compact
            icon={BookOpen}
            title="No knowledge documents"
            description="Add a policy, FAQ, or source note and it will become retrievable by this workflow."
            className="border-dashed bg-background py-6"
          />
        )}

        <div className="space-y-2 rounded-lg border border-dashed border-border bg-background/60 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Refund policy"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Content</Label>
            <Textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Document text for RAG retrieval…"
              className="text-xs"
            />
          </div>
          <Button size="sm" className="w-full" onClick={handleAddDoc} disabled={saving}>
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Adding…" : "Add document"}
          </Button>
          <div className="space-y-1 border-t border-border pt-3">
            <Label className="text-xs">Bulk import</Label>
            <Textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"FAQ|Refund policy text...\n---\nShipping|Delivery times..."}
              className="text-xs"
            />
            <Button size="sm" variant="outline" className="w-full" onClick={handleBulkImport} disabled={saving}>
              Import batch
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-3 shadow-elev-1">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
            <Brain className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Persistent memory</h3>
              <Badge variant="outline" className="ml-auto px-2 py-0.5 text-2xs">
                {memoryNamespaces.length} namespaces
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Cross-run values from Memory Store nodes with persist enabled. Use{" "}
              <code className="rounded bg-background px-1 text-2xs">{`{{memory.ns.key}}`}</code>.
            </p>
          </div>
        </div>

        {memoryNamespaces.length === 0 ? (
          <EmptyState
            compact
            icon={Brain}
            title="No persisted memory"
            description="Memory Store nodes will appear here after a run writes durable keys."
            className="border-dashed bg-background py-6"
          />
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {memoryNamespaces.map((ns) => (
              <div key={ns} className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">{ns}</span>
                  <Badge variant="outline" className="px-1.5 py-0 text-2xs">
                    {Object.keys(memory[ns] || {}).length} keys
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: "clear-memory", namespace: ns })}
                    className="text-2xs text-muted hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
                <dl className="mt-2 space-y-1">
                  {Object.entries(memory[ns] || {}).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 text-xs">
                      <dt className="truncate font-mono text-muted">{key}</dt>
                      <dd className="truncate text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}

        {memoryNamespaces.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setConfirmAction({ type: "clear-memory" })}
          >
            Clear all memory
          </Button>
        )}
      </section>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.type === "delete-doc"
            ? "Delete document?"
            : confirmAction?.namespace
              ? `Clear namespace "${confirmAction.namespace}"?`
              : "Clear all memory?"
        }
        description={
          confirmAction?.type === "delete-doc"
            ? "This permanently removes the document and its embeddings. This cannot be undone."
            : confirmAction?.namespace
              ? `All keys in "${confirmAction.namespace}" will be permanently cleared.`
              : "All persisted memory for this workflow will be permanently cleared."
        }
        confirmLabel={
          confirmAction?.type === "delete-doc" ? "Delete document" : "Clear"
        }
        loadingLabel={
          confirmAction?.type === "delete-doc" ? "Deleting document…" : "Clearing…"
        }
        variant="destructive"
        onConfirm={async () => {
          if (!confirmAction) return;
          if (confirmAction.type === "delete-doc") {
            await handleDeleteDoc(confirmAction.id);
          } else {
            await handleClearMemory(confirmAction.namespace);
          }
        }}
      />
    </div>
  );
}
