"use client";

import dynamic from "next/dynamic";
import { Database, GitCompare, History, Layers, Sparkles, X } from "lucide-react";
import { NodePalette } from "@/components/canvas/NodePalette";
import type { DiffKind } from "@/components/canvas/VersionDiffView";
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
  onDiffHighlight?: (highlights: Record<string, DiffKind> | null) => void;
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
  onDiffHighlight,
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
          "flex w-[280px] shrink-0 flex-col border-r border-border bg-surface",
          "lg:absolute lg:bottom-3 lg:left-3 lg:top-16 lg:z-10 lg:overflow-hidden lg:rounded-xl lg:border lg:bg-surface lg:shadow-elev-1 lg:backdrop-blur-md",
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
              aria-label="Close workflow tools"
              className="px-4 py-3 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          className="flex border-b border-border overflow-x-auto"
          role="tablist"
          aria-label="Workflow tools"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`canvas-tab-${id}`}
              aria-selected={activeTab === id}
              aria-controls={`canvas-panel-${id}`}
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
          <div
            role="tabpanel"
            id="canvas-panel-nodes"
            aria-labelledby="canvas-tab-nodes"
            hidden={activeTab !== "nodes"}
            className={activeTab !== "nodes" ? "hidden" : undefined}
          >
            <NodePalette onAddNode={onAddNode} />
          </div>
          <div
            role="tabpanel"
            id="canvas-panel-data"
            aria-labelledby="canvas-tab-data"
            hidden={activeTab !== "data"}
            className={activeTab !== "data" ? "hidden" : undefined}
          >
            <WorkflowDataPanel workflowId={workflowId} />
          </div>
          <div
            role="tabpanel"
            id="canvas-panel-quality"
            aria-labelledby="canvas-tab-quality"
            hidden={activeTab !== "quality"}
            className={activeTab !== "quality" ? "hidden" : undefined}
          >
            <WorkflowQualityPanel workflowId={workflowId} />
          </div>
          <div
            role="tabpanel"
            id="canvas-panel-versions"
            aria-labelledby="canvas-tab-versions"
            hidden={activeTab !== "versions"}
            className={activeTab !== "versions" ? "hidden" : undefined}
          >
            <VersionHistory
              embedded
              workflowId={workflowId}
              currentVersionId={currentVersionId}
              onSelectVersion={onSelectVersion}
              onDiffHighlight={onDiffHighlight}
            />
          </div>
          <div
            role="tabpanel"
            id="canvas-panel-compare"
            aria-labelledby="canvas-tab-compare"
            hidden={activeTab !== "compare"}
            className={activeTab !== "compare" ? "hidden" : undefined}
          >
            <RunComparison embedded workflowId={workflowId} />
          </div>
        </div>
      </div>
    </>
  );
}