"use client";

import { useQuery } from "@tanstack/react-query";
import { GitCompare, History } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  buildDiffHighlightMap,
  VersionDiffView,
  type DiffKind,
} from "@/components/canvas/VersionDiffView";
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
    <div className={cn("flex flex-col", !embedded && "panel w-52")}>
      {!embedded && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <History className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground">Versions</span>
        </div>
      )}

      <div className={cn("overflow-y-auto", embedded ? "space-y-1" : "max-h-64 p-2")}>
        {loading && <LoadingState variant="inline" label="Loading versions…" className="px-2 py-3" />}
        {!loading && versions.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted">No versions yet.</p>
        )}
        {versions.map((version) => {
          const isActive = version.id === currentVersionId;
          const isDiffTarget = version.id === diffVersionId;
          const isLoading = loadingVersionId === version.id;
          const canDiff = Boolean(currentVersionId && version.id !== currentVersionId);

          return (
            <div key={version.id} className="mb-1 flex items-stretch gap-1">
              <button
                type="button"
                disabled={Boolean(loadingVersionId)}
                onClick={() => handleSelect(version)}
                className={cn(
                  "min-w-0 flex-1 rounded-lg px-3 py-2 text-left transition",
                  isActive
                    ? "bg-primary-muted text-foreground"
                    : "text-muted hover:bg-surface-hover hover:text-foreground",
                  isDiffTarget && !isActive && "ring-1 ring-warning/50",
                  isLoading && "opacity-60"
                )}
              >
                <p className="text-sm font-medium">v{version.version_number}</p>
                <p className="text-xs text-muted">
                  {version.node_count} nodes ·{" "}
                  <time dateTime={version.created_at} title={formatFullTimestamp(version.created_at)}>
                    {formatRelativeTime(version.created_at)}
                  </time>
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