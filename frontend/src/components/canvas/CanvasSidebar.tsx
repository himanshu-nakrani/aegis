"use client";

import dynamic from "next/dynamic";
import { Database, GitCompare, History, Layers, Sparkles, X } from "lucide-react";
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
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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
  mobileOpen = false,
  onMobileClose,
}: CanvasSidebarProps) {
  return (
    <>
      {mobileOpen && onMobileClose && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <div
        className={cn(
          "flex w-60 shrink-0 flex-col border-r border-border bg-surface",
          "lg:relative lg:translate-x-0",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-40 shadow-2xl lg:shadow-none"
            : "hidden lg:flex"
        )}
      >
        <div className="flex items-center border-b border-border lg:hidden">
          <span className="flex-1 px-4 py-3 text-sm font-medium text-foreground">Workflow tools</span>
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="px-4 py-3 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex border-b border-border overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                "sidebar-tab",
                activeTab === id ? "sidebar-tab-active" : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="truncate">{label}</span>
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
    </>
  );
}