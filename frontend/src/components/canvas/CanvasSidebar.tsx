"use client";

import dynamic from "next/dynamic";
import { Database, GitCompare, History, Layers, Sparkles } from "lucide-react";
import { NodePalette } from "@/components/canvas/NodePalette";
import type { NodeData, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";

const WorkflowDataPanel = dynamic(
  () => import("@/components/canvas/WorkflowDataPanel").then((m) => m.WorkflowDataPanel),
  { ssr: false }
);
const WorkflowQualityPanel = dynamic(
  () => import("@/components/canvas/WorkflowQualityPanel").then((m) => m.WorkflowQualityPanel),
  { ssr: false }
);
const VersionHistory = dynamic(
  () => import("@/components/canvas/VersionHistory").then((m) => m.VersionHistory),
  { ssr: false }
);
const RunComparison = dynamic(
  () => import("@/components/runs/RunComparison").then((m) => m.RunComparison),
  { ssr: false }
);

type SidebarTab = "nodes" | "data" | "quality" | "versions" | "compare";

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
  { id: "data", label: "Data", icon: Database },
  { id: "quality", label: "Quality", icon: Sparkles },
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
    <div className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 px-2 py-3 text-[10px] font-semibold uppercase tracking-wider transition",
              activeTab === id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="relative flex-1 overflow-y-auto p-3">
        <div className={activeTab === "nodes" ? "block" : "hidden"}>
          <NodePalette onAddNode={onAddNode} />
        </div>
        <div className={activeTab === "data" ? "block" : "hidden"}>
          <WorkflowDataPanel workflowId={workflowId} />
        </div>
        <div className={activeTab === "quality" ? "block" : "hidden"}>
          <WorkflowQualityPanel workflowId={workflowId} />
        </div>
        <div className={activeTab === "versions" ? "block" : "hidden"}>
          <VersionHistory
            embedded
            workflowId={workflowId}
            currentVersionId={currentVersionId}
            onSelectVersion={onSelectVersion}
          />
        </div>
        <div className={activeTab === "compare" ? "block" : "hidden"}>
          <RunComparison embedded workflowId={workflowId} />
        </div>
      </div>
    </div>
  );
}