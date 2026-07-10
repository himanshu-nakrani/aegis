"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCompare, History } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  buildDiffHighlightMap,
  VersionDiffView,
  type DiffKind,
} from "@/components/canvas/VersionDiffView";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { api } from "@/lib/api";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowVersion, WorkflowVersionListItem } from "@/types/workflow";
import { cn } from "@/lib/utils";

interface VersionHistoryProps {
  workflowId: string;
  currentVersionId?: string;
  onSelectVersion: (version: WorkflowVersion) => void;
  onDiffHighlight?: (highlights: Record<string, DiffKind> | null) => void;
  embedded?: boolean;
}

export function VersionHistory({
  workflowId,
  currentVersionId,
  onSelectVersion,
  onDiffHighlight,
  embedded = false,
}: VersionHistoryProps) {
  const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null);
  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: published } = useQuery({
    queryKey: ["published", workflowId],
    queryFn: () => api.getPublished(workflowId),
  });
  const publishedId = published?.published_version_id ?? null;

  const handlePublish = async (versionId: string, versionNumber: number) => {
    try {
      await api.publishVersion(workflowId, versionId);
      void queryClient.invalidateQueries({ queryKey: ["published", workflowId] });
      toast.success(`v${versionNumber} published — the invoke API now serves it`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    }
  };

  const { data: versions = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.workflowVersions(workflowId),
    queryFn: () => api.listVersions(workflowId),
  });

  const { data: diffPair, isLoading: diffLoading } = useQuery({
    queryKey: ["version-diff", workflowId, currentVersionId, diffVersionId],
    queryFn: async () => {
      if (!currentVersionId || !diffVersionId || currentVersionId === diffVersionId) {
        return null;
      }
      const [current, selected] = await Promise.all([
        api.getVersion(workflowId, currentVersionId),
        api.getVersion(workflowId, diffVersionId),
      ]);
      return { current, selected };
    },
    enabled: Boolean(currentVersionId && diffVersionId && currentVersionId !== diffVersionId),
  });

  const handleSelect = async (version: WorkflowVersionListItem) => {
    if (loadingVersionId) return;
    setLoadingVersionId(version.id);
    try {
      const fullVersion = await api.getVersion(workflowId, version.id);
      onSelectVersion(fullVersion);
      if (version.id !== currentVersionId) {
        setDiffVersionId(version.id);
      } else {
        setDiffVersionId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load version");
    } finally {
      setLoadingVersionId(null);
    }
  };

  const handleDiffToggle = (versionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!currentVersionId || versionId === currentVersionId) return;
    setDiffVersionId((current) => (current === versionId ? null : versionId));
  };

  useEffect(() => {
    if (!onDiffHighlight) return;
    if (diffPair) {
      onDiffHighlight(buildDiffHighlightMap(diffPair.selected, diffPair.current));
    } else {
      onDiffHighlight(null);
    }
  }, [diffPair, onDiffHighlight]);

  return (
    <div className={cn("flex flex-col", !embedded && "panel w-64")}>
      {!embedded && (
        <div className="border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-muted text-primary">
              <History className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Version history</p>
              <p className="text-[11px] text-muted">{versions.length} saved snapshots</p>
            </div>
          </div>
        </div>
      )}

      <div className={cn("overflow-y-auto", embedded ? "space-y-1" : "max-h-72 p-2")}>
        {loading && <LoadingState variant="inline" label="Loading versions…" className="px-2 py-3" />}
        {!loading && versions.length === 0 && (
          <EmptyState
            compact
            icon={History}
            title="No versions yet"
            description="Saved snapshots will appear here after workflow changes are versioned."
            className="border-dashed bg-background py-6"
          />
        )}
        {versions.map((version) => {
          const isActive = version.id === currentVersionId;
          const isDiffTarget = version.id === diffVersionId;
          const isLoading = loadingVersionId === version.id;
          const canDiff = Boolean(currentVersionId && version.id !== currentVersionId);

          return (
            <div key={version.id} className="mb-1.5 flex items-stretch gap-1.5">
              <button
                type="button"
                disabled={Boolean(loadingVersionId)}
                onClick={() => handleSelect(version)}
                className={cn(
                  "min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition",
                  isActive
                    ? "border-primary/25 bg-primary-muted text-foreground shadow-elev-1"
                    : "border-transparent text-muted hover:border-border hover:bg-surface-hover hover:text-foreground",
                  isDiffTarget && !isActive && "border-warning/40 bg-warning/10 text-foreground",
                  isLoading && "opacity-60"
                )}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">v{version.version_number}</p>
                  {publishedId === version.id && (
                    <Badge variant="success" className="ml-auto px-1.5 py-0 text-[9px]">
                      published
                    </Badge>
                  )}
                  {isActive && (
                    <Badge variant="primary" className={publishedId === version.id ? "px-1.5 py-0 text-[9px]" : "ml-auto px-1.5 py-0 text-[9px]"}>
                      current
                    </Badge>
                  )}
                  {isDiffTarget && !isActive && (
                    <Badge variant="warning" className="ml-auto px-1.5 py-0 text-[9px]">
                      compare
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {version.node_count} nodes ·{" "}
                  <time dateTime={version.created_at} title={formatFullTimestamp(version.created_at)}>
                    {formatRelativeTime(version.created_at)}
                  </time>
                  {publishedId !== version.id && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handlePublish(version.id, version.version_number);
                      }}
                      className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-border-strong hover:text-foreground"
                    >
                      Publish
                    </button>
                  )}
                </p>
              </button>
              {canDiff && (
                <button
                  type="button"
                  title="Compare with current version"
                  onClick={(event) => handleDiffToggle(version.id, event)}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-lg border border-border px-2 transition",
                    isDiffTarget
                      ? "border-warning/50 bg-warning/10 text-warning"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {diffVersionId && currentVersionId && diffVersionId !== currentVersionId && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Version diff</p>
          {diffLoading && <p className="text-xs text-muted">Loading comparison…</p>}
          {diffPair && (
            <VersionDiffView left={diffPair.selected} right={diffPair.current} />
          )}
        </div>
      )}
    </div>
  );
}
