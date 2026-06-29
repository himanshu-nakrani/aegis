"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { WorkflowVersion, WorkflowVersionListItem } from "@/types/workflow";
import { cn } from "@/lib/utils";

interface VersionHistoryProps {
  workflowId: string;
  currentVersionId?: string;
  onSelectVersion: (version: WorkflowVersion) => void;
  embedded?: boolean;
}

export function VersionHistory({
  workflowId,
  currentVersionId,
  onSelectVersion,
  embedded = false,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<WorkflowVersionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listVersions(workflowId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [workflowId]);

  const handleSelect = async (version: WorkflowVersionListItem) => {
    if (loadingVersionId) return;
    setLoadingVersionId(version.id);
    try {
      const fullVersion = await api.getVersion(workflowId, version.id);
      onSelectVersion(fullVersion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load version");
    } finally {
      setLoadingVersionId(null);
    }
  };

  return (
    <div className={cn("flex flex-col", !embedded && "panel w-52")}>
      {!embedded && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <History className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground">Versions</span>
        </div>
      )}

      <div className={cn("overflow-y-auto", embedded ? "space-y-1" : "max-h-64 p-2")}>
        {loading && <p className="px-2 py-3 text-sm text-muted">Loading…</p>}
        {!loading && versions.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted">No versions yet.</p>
        )}
        {versions.map((version) => {
          const isActive = version.id === currentVersionId;
          const isLoading = loadingVersionId === version.id;

          return (
            <button
              key={version.id}
              type="button"
              disabled={Boolean(loadingVersionId)}
              onClick={() => handleSelect(version)}
              className={cn(
                "mb-1 w-full rounded-lg px-3 py-2 text-left transition",
                isActive ? "bg-primary-muted text-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground",
                isLoading && "opacity-60"
              )}
            >
              <p className="text-sm font-medium">v{version.version_number}</p>
              <p className="text-xs text-muted">
                {version.node_count} nodes · {new Date(version.created_at).toLocaleDateString()}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}