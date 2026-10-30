"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, RefreshCw, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  type KnowledgeBase,
  type KnowledgeQueryResult,
  type KnowledgeSettings,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const EMPTY_SETTINGS: KnowledgeSettings = {
  chunk_strategy: "sentence",
  chunk_size: 800,
  chunk_overlap: 120,
  retrieval_method: "hybrid",
  rrf_k: 60,
  reranker: "none",
  rerank_candidates: 20,
  top_k: 5,
  min_score: null,
  query_rewrite: "none",
};

function chunkLabel(count: number): string {
  return `${count} chunk${count === 1 ? "" : "s"}`;
}

function splitTags(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [settings, setSettings] = useState<KnowledgeSettings>(EMPTY_SETTINGS);
  const [ingestMode, setIngestMode] = useState<"paste" | "file" | "url">("paste");
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTags, setDocTags] = useState("");
  const [queryText, setQueryText] = useState("");
  const [queryTags, setQueryTags] = useState("");
  const [queryMethod, setQueryMethod] = useState("saved");
  const [queryResult, setQueryResult] = useState<KnowledgeQueryResult | null>(null);

  const basesQuery = useQuery({
    queryKey: queryKeys.knowledgeBases,
    queryFn: () => api.listKnowledgeBases(),
  });
  const bases = useMemo(() => basesQuery.data ?? [], [basesQuery.data]);
  const selected = bases.find((base) => base.id === selectedId) ?? null;

  const documentsQuery = useQuery({
    queryKey: queryKeys.knowledgeDocuments(selectedId ?? ""),
    queryFn: () => api.listKnowledgeSources(selectedId!),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!bases.length) {
      if (!basesQuery.isFetching) setSelectedId(null);
      return;
    }
    if (!selectedId) {
      setSelectedId(bases[0].id);
      return;
    }
    // A create can select an id before the list refetch includes it.
    if (!bases.some((base) => base.id === selectedId) && !basesQuery.isFetching) {
      setSelectedId(bases[0].id);
    }
  }, [bases, selectedId, basesQuery.isFetching]);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDescription(selected.description ?? "");
    setSettings({ ...EMPTY_SETTINGS, ...selected.settings });
    setQueryResult(null);
    // Reload the form when the saved library changes, not on every chunk-count refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updated_at]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases });
    if (selectedId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeDocuments(selectedId),
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: () => api.createKnowledgeBase({ name: newName.trim() }),
    onSuccess: (base) => {
      toast.success(`Library "${base.name}" created`);
      setNewName("");
      setSelectedId(base.id);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateKnowledgeBase(selectedId!, {
        name: name.trim(),
        description,
        settings: {
          ...settings,
          min_score: settings.min_score,
        },
      }),
    onSuccess: () => {
      toast.success("Library saved");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteKnowledgeBase(id),
    onSuccess: () => {
      toast.success("Library deleted");
      setDeleteTarget(null);
      setSelectedId(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const ingestMutation = useMutation({
    mutationFn: async () => {
      const tags = splitTags(docTags);
      if (ingestMode === "paste") {
        return api.addKnowledgeText(selectedId!, {
          title: docTitle.trim() || undefined,
          text: docText,
          tags,
        });
      }
      if (ingestMode === "url") {
        return api.addKnowledgeUrl(selectedId!, {
          url: docUrl.trim(),
          title: docTitle.trim() || undefined,
          tags,
        });
      }
      if (!docFile) throw new Error("Choose a file");
      return api.uploadKnowledgeBaseDocument(
        selectedId!,
        docFile,
        docTitle.trim() || undefined,
        tags.join(",")
      );
    },
    onSuccess: (result) => {
      toast.success(`Added ${result.chunks_created} chunk${result.chunks_created === 1 ? "" : "s"}`);
      setDocText("");
      setDocUrl("");
      setDocFile(null);
      setDocTitle("");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (sourceId: string) => api.deleteKnowledgeSource(selectedId!, sourceId),
    onSuccess: (result) => {
      toast.success(`Removed ${result.deleted_chunks} chunk${result.deleted_chunks === 1 ? "" : "s"}`);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const reindexMutation = useMutation({
    mutationFn: () => api.reindexKnowledgeBase(selectedId!),
    onSuccess: (result) => {
      toast.success(`Reindexed ${result.reindexed} chunk${result.reindexed === 1 ? "" : "s"}`);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const queryMutation = useMutation({
    mutationFn: () =>
      api.queryKnowledgeBase(selectedId!, {
        query: queryText.trim(),
        settings,
        tags: splitTags(queryTags),
        ...(queryMethod !== "saved" ? { method: queryMethod } : {}),
      }),
    onSuccess: (result) => setQueryResult(result),
    onError: (error) => toast.error(error.message),
  });

  const patchSettings = (patch: Partial<KnowledgeSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));

  return (
    <Page>
      <PageHeader
        title="Knowledge"
        description="Libraries shared across workflows. Chunk size, overlap, and strategy apply the next time you add a document. Reindex refreshes embeddings for chunks already stored."
      />

      {basesQuery.isError && (
        <InlineQueryError
          message="Couldn't load libraries"
          detail={basesQuery.error.message}
          onRetry={() => void basesQuery.refetch()}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <SectionCard title="Libraries">
          {basesQuery.isLoading ? (
            <LoadingState variant="inline" label="Loading libraries…" />
          ) : bases.length === 0 ? (
            <EmptyState
              compact
              icon={BookOpen}
              title="No libraries"
              description="Create a library, then paste text, upload a file, or fetch a public URL."
            />
          ) : (
            <ul className="space-y-1">
              {bases.map((base) => (
                <li key={base.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(base.id)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                      base.id === selectedId
                        ? "bg-surface-input text-foreground"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <span className="block truncate font-medium">{base.name}</span>
                    <span className="font-mono text-2xs tabular-nums">
                      {chunkLabel(base.chunk_count)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Library name"
              aria-label="New library name"
            />
            <Button
              size="sm"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Add
            </Button>
          </div>
        </SectionCard>

        {!selected ? (
          <SectionCard title="Library" className="flex flex-col" bodyClassName="flex flex-1 flex-col justify-center">
            <EmptyState
              compact
              icon={BookOpen}
              title="Select a library"
              description="Settings, documents, and the query bench open for the library you pick."
            />
          </SectionCard>
        ) : (
          <div className="space-y-6">
            <SectionCard
              title={selected.name}
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reindexMutation.isPending || selected.chunk_count === 0}
                    onClick={() => reindexMutation.mutate()}
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reindexMutation.isPending ? "animate-spin" : ""}`} />
                    Reindex
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(selected)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kb-name">Name</Label>
                  <Input id="kb-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="kb-description">Description</Label>
                  <Input
                    id="kb-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-strategy">Chunk strategy</Label>
                  <Select
                    value={settings.chunk_strategy}
                    onValueChange={(value) =>
                      patchSettings({ chunk_strategy: value as KnowledgeSettings["chunk_strategy"] })
                    }
                  >
                    <SelectTrigger id="kb-strategy" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sentence">Sentence</SelectItem>
                      <SelectItem value="paragraph">Paragraph</SelectItem>
                      <SelectItem value="fixed">Fixed window</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-method">Retrieval</Label>
                  <Select
                    value={settings.retrieval_method}
                    onValueChange={(value) =>
                      patchSettings({
                        retrieval_method: value as KnowledgeSettings["retrieval_method"],
                      })
                    }
                  >
                    <SelectTrigger id="kb-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">Hybrid (RRF)</SelectItem>
                      <SelectItem value="embedding">Embedding</SelectItem>
                      <SelectItem value="bm25">BM25</SelectItem>
                      <SelectItem value="tfidf">TF-IDF</SelectItem>
                      <SelectItem value="keyword">Keyword</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-size">Chunk size</Label>
                  <Input
                    id="kb-size"
                    type="number"
                    min={200}
                    max={4000}
                    value={settings.chunk_size}
                    onChange={(e) => patchSettings({ chunk_size: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-overlap">Overlap</Label>
                  <Input
                    id="kb-overlap"
                    type="number"
                    min={0}
                    value={settings.chunk_overlap}
                    onChange={(e) => patchSettings({ chunk_overlap: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-topk">Top K</Label>
                  <Input
                    id="kb-topk"
                    type="number"
                    min={1}
                    max={20}
                    value={settings.top_k}
                    onChange={(e) => patchSettings({ top_k: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-min">Minimum score</Label>
                  <Input
                    id="kb-min"
                    type="number"
                    min={0}
                    step="0.01"
                    value={settings.min_score ?? ""}
                    placeholder="No filter"
                    onChange={(e) =>
                      patchSettings({
                        min_score: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                {settings.retrieval_method === "hybrid" && (
                  <div className="space-y-2">
                    <Label htmlFor="kb-rrf">RRF k</Label>
                    <Input
                      id="kb-rrf"
                      type="number"
                      min={1}
                      max={200}
                      value={settings.rrf_k}
                      onChange={(e) => patchSettings({ rrf_k: Number(e.target.value) })}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="kb-rewrite">Query rewrite</Label>
                  <Select
                    value={settings.query_rewrite}
                    onValueChange={(value) =>
                      patchSettings({ query_rewrite: value as KnowledgeSettings["query_rewrite"] })
                    }
                  >
                    <SelectTrigger id="kb-rewrite" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="llm">LLM rewrite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-rerank">Reranker</Label>
                  <Select
                    value={settings.reranker}
                    onValueChange={(value) =>
                      patchSettings({ reranker: value as KnowledgeSettings["reranker"] })
                    }
                  >
                    <SelectTrigger id="kb-rerank" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="llm">LLM rerank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {settings.reranker === "llm" && (
                  <div className="space-y-2">
                    <Label htmlFor="kb-candidates">Rerank candidates</Label>
                    <Input
                      id="kb-candidates"
                      type="number"
                      min={1}
                      max={50}
                      value={settings.rerank_candidates}
                      onChange={(e) => patchSettings({ rerank_candidates: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">
                Minimum score filters the score the method actually returns. Hybrid scores are small reciprocal-rank values. LLM rewrite and rerank keep the original query and order when no model key is available.
              </p>
              <Button
                className="mt-3"
                size="sm"
                disabled={!name.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
            </SectionCard>

            <SectionCard title="Add documents" description="PDF, DOCX, Markdown, and text up to 8MB. Tags are lowercase, at most 12, and a query matches only chunks that have every tag.">
              <div className="mb-3 flex gap-2">
                {(["paste", "file", "url"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={ingestMode === mode ? "default" : "outline"}
                    onClick={() => setIngestMode(mode)}
                  >
                    {mode === "paste" ? "Paste" : mode === "file" ? "File" : "URL"}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input id="doc-title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-tags">Tags</Label>
                  <Input
                    id="doc-tags"
                    value={docTags}
                    onChange={(e) => setDocTags(e.target.value)}
                    placeholder="support, billing"
                  />
                </div>
                {ingestMode === "paste" && (
                  <div className="space-y-2">
                    <Label htmlFor="doc-text">Text</Label>
                    <Textarea
                      id="doc-text"
                      rows={6}
                      value={docText}
                      onChange={(e) => setDocText(e.target.value)}
                    />
                  </div>
                )}
                {ingestMode === "file" && (
                  <div className="space-y-2">
                    <Label htmlFor="doc-file">File</Label>
                    <Input
                      id="doc-file"
                      type="file"
                      accept=".pdf,.docx,.md,.txt,text/plain,text/markdown,application/pdf"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                )}
                {ingestMode === "url" && (
                  <div className="space-y-2">
                    <Label htmlFor="doc-url">Public URL</Label>
                    <Input
                      id="doc-url"
                      value={docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      placeholder="https://example.com/guide"
                    />
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-fit"
                  disabled={ingestMutation.isPending}
                  onClick={() => ingestMutation.mutate()}
                >
                  {ingestMutation.isPending ? "Adding…" : "Add document"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="Documents" description={`${chunkLabel(selected.chunk_count)} stored. A library query stops at 5000 chunks.`}>
              {documentsQuery.isLoading ? (
                <LoadingState variant="inline" label="Loading documents…" />
              ) : documentsQuery.isError ? (
                <InlineQueryError
                  message="Couldn't load documents"
                  detail={documentsQuery.error.message}
                  onRetry={() => void documentsQuery.refetch()}
                />
              ) : (documentsQuery.data ?? []).length === 0 ? (
                <EmptyState compact title="No documents" description="Paste, upload, or fetch a page to fill this library." />
              ) : (
                <ul className="divide-y divide-border">
                  {(documentsQuery.data ?? []).map((doc) => (
                    <li key={doc.source_document_id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.title || doc.source_name || "Untitled"}</p>
                        <p className="text-xs text-muted">
                          {chunkLabel(doc.chunk_count)}
                          {doc.tags.length ? ` · ${doc.tags.join(", ")}` : ""}
                          {doc.source_url ? ` · ${doc.source_url}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${doc.title || "document"}`}
                        onClick={() => deleteSourceMutation.mutate(doc.source_document_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Try a query" description="Uses the form above, including settings you have not saved yet.">
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="kb-query">Query</Label>
                  <Textarea
                    id="kb-query"
                    rows={3}
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="query-method">Method override</Label>
                    <Select value={queryMethod} onValueChange={setQueryMethod}>
                      <SelectTrigger id="query-method" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="saved">Use settings above</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="embedding">Embedding</SelectItem>
                        <SelectItem value="bm25">BM25</SelectItem>
                        <SelectItem value="tfidf">TF-IDF</SelectItem>
                        <SelectItem value="keyword">Keyword</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="query-tags">Require tags</Label>
                    <Input
                      id="query-tags"
                      value={queryTags}
                      onChange={(e) => setQueryTags(e.target.value)}
                      placeholder="support"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-fit"
                  disabled={!queryText.trim() || queryMutation.isPending}
                  onClick={() => queryMutation.mutate()}
                >
                  {queryMutation.isPending ? "Searching…" : "Search"}
                </Button>
                {queryResult && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted">
                      {queryResult.method} · rewrite {queryResult.rewrite.applied ? "applied" : "skipped"}
                      {queryResult.rewrite.reason ? ` (${queryResult.rewrite.reason})` : ""} · rerank{" "}
                      {queryResult.rerank.applied ? "applied" : "skipped"}
                      {queryResult.rerank.reason ? ` (${queryResult.rerank.reason})` : ""}
                    </p>
                    {queryResult.results.length === 0 ? (
                      <p className="text-sm text-muted">No chunks passed the score filter.</p>
                    ) : (
                      <ul className="space-y-2">
                        {queryResult.results.map((hit, index) => (
                          <li key={hit.id ?? index} className="rounded-md border border-border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {hit.title || hit.source_name || "Chunk"}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-muted">
                                {hit.score == null ? "—" : hit.score.toFixed(4)}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-muted">
                              {hit.text}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete library"
        description="Documents in this library are removed. Workflow knowledge bases are left as they are."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) return deleteMutation.mutateAsync(deleteTarget.id);
        }}
      />
    </Page>
  );
}
