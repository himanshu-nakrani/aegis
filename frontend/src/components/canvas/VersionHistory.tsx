"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "@/lib/api";
import type { WorkflowGraph, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";

interface VersionHistoryProps {
  workflowId: string;
  currentVersionId?: string;
  onSelectVersion: (version: WorkflowVersion) => void;
}

export function VersionHistory({
  workflowId,
  currentVersionId,
  onSelectVersion,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listVersions(workflowId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [workflowId]);

  const handleSelect = (version: WorkflowVersion) => {
    onSelectVersion(version);
  };

  return (
    <div className="flex w-52 flex-col rounded-xl border border-slate-800 bg-slate-900/80">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <History className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Versions
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto p-2">
        {loading && <p className="px-2 py-3 text-xs text-slate-500">Loading...</p>}
        {!loading && versions.length === 0 && (
          <p className="px-2 py-3 text-xs text-slate-500">No versions yet.</p>
        )}
        {versions.map((version) => {
          const nodeCount = (version.graph_json as WorkflowGraph)?.nodes?.length ?? 0;
          const isActive = version.id === currentVersionId;

          return (
            <button
              key={version.id}
              type="button"
              onClick={() => handleSelect(version)}
              className={cn(
                "mb-1 w-full rounded-lg px-3 py-2 text-left transition",
                isActive
                  ? "bg-sky-500/20 text-sky-100"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <p className="text-sm font-medium">v{version.version_number}</p>
              <p className="text-xs text-slate-500">
                {nodeCount} nodes · {new Date(version.created_at).toLocaleDateString()}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}