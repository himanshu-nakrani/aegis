"use client";

import { GitCompare, History, Layers } from "lucide-react";
import { NodePalette } from "@/components/canvas/NodePalette";
import { VersionHistory } from "@/components/canvas/VersionHistory";
import { RunComparison } from "@/components/runs/RunComparison";
import type { NodeData, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";

type SidebarTab = "nodes" | "versions" | "compare";

interface CanvasSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onAddNode: (data: NodeData) => void;
  workflowId: string;
  currentVersionId?: string;
  onSelectVersion: (version: WorkflowVersion) => void;
}

const tabs: Array<{ id: SidebarTab; label: string; icon: React.ElementType }> = [
  { id: "nodes", label: "Nodes", icon: Layers },
  { id: "versions", label: "Versions", icon: History },
  { id: "compare", label: "Compare", icon: GitCompare },
];

export function CanvasSidebar({
  activeTab,
  onTabChange,
  onAddNode,
  workflowId,
  currentVersionId,
  onSelectVersion,
}: CanvasSidebarProps) {
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/60">
      <div className="flex border-b border-slate-800/80">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 px-2 py-3 text-[10px] font-medium uppercase tracking-wider transition",
              activeTab === id
                ? "border-b-2 border-sky-400 text-sky-300"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "nodes" && <NodePalette onAddNode={onAddNode} />}
        {activeTab === "versions" && (
          <VersionHistory
            embedded
            workflowId={workflowId}
            currentVersionId={currentVersionId}
            onSelectVersion={onSelectVersion}
          />
        )}
        {activeTab === "compare" && <RunComparison embedded workflowId={workflowId} />}
      </div>
    </div>
  );
}