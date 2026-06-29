"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Brain, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface KnowledgeDoc {
  id: string;
  title?: string | null;
  text: string;
  updated_at: string;
}

interface WorkflowDataPanelProps {
  workflowId: string;
}

export function WorkflowDataPanel({ workflowId }: WorkflowDataPanelProps) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [memory, setMemory] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [kb, mem] = await Promise.all([
        api.listKnowledge(workflowId),
        api.getWorkflowMemory(workflowId),
      ]);
      setDocs(kb);
      setMemory(mem.namespaces || {});
    } catch {
      toast.error("Failed to load workflow data");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const handleDeleteDoc = async (id: string) => {
    try {
      await api.deleteKnowledge(workflowId, id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Document removed");
    } catch {
      toast.error("Delete failed");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Workflow data</p>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Knowledge base</h3>
          <span className="ml-auto text-xs text-muted">{docs.length}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Used by KB Retrieve nodes with source &quot;Workflow knowledge base&quot;.
        </p>

        {docs.length > 0 && (
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="group rounded-lg border border-border bg-surface-elevated px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {doc.title || "Untitled"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{doc.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="shrink-0 opacity-0 transition group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted hover:text-destructive" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
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
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-foreground">Persistent memory</h3>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Cross-run values from Memory Store nodes with persist enabled. Use{" "}
          <code className="rounded bg-surface px-1 text-[10px]">{`{{memory.ns.key}}`}</code>.
        </p>

        {memoryNamespaces.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-xs text-muted">
            No persisted memory yet
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {memoryNamespaces.map((ns) => (
              <div key={ns} className="rounded-lg border border-border bg-surface-elevated px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">{ns}</span>
                  <button
                    type="button"
                    onClick={() => handleClearMemory(ns)}
                    className="text-[10px] text-muted hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
                <dl className="mt-2 space-y-1">
                  {Object.entries(memory[ns] || {}).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 text-[11px]">
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
          <Button variant="outline" size="sm" className="w-full" onClick={() => handleClearMemory()}>
            Clear all memory
          </Button>
        )}
      </section>
    </div>
  );
}