"use client";

import dynamic from "next/dynamic";
import { useId } from "react";
import { Database, GitCompare, History, Layers, Sparkles, X } from "lucide-react";
import { NodePalette } from "@/components/canvas/NodePalette";
import type { DiffKind } from "@/components/canvas/VersionDiffView";
import type { NodeData, WorkflowVersion } from "@/types/workflow";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
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
  const sidebarId = useId();
  const tabId = (id: SidebarTab) => `canvas-tab-${sidebarId}-${id}`;
  const panelId = (id: SidebarTab) => `canvas-panel-${sidebarId}-${id}`;
  const { width, handleProps } = useResizablePanel({
    storageKey: "aegis:panel:left",
    defaultWidth: 280,
    min: 240,
    max: 420,
    side: "left",
  });
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
        style={{
          // Overlay mode caps to viewport; docked mode uses the resizable width.
          width: mobileOpen ? `min(${width}px, 85vw)` : width,
        }}
        className={cn(
          "relative shrink-0 flex-col border-r border-border bg-surface-elevated",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-40 flex shadow-2xl lg:static lg:z-auto lg:shadow-none"
            : "hidden lg:flex"
        )}
      >
        {!mobileOpen && (
          <div
            {...handleProps}
            className="focus-ring group absolute inset-y-0 -right-px z-10 hidden w-[3px] cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 active:bg-primary/30 lg:block"
          />
        )}
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
          className="flex overflow-x-auto border-b border-border bg-background/25 [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong"
          role="tablist"
          aria-label="Workflow tools"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabId(id)}
              aria-selected={activeTab === id}
              aria-controls={panelId(id)}
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
            id={panelId("nodes")}
            aria-labelledby={tabId("nodes")}
            hidden={activeTab !== "nodes"}
            className={activeTab !== "nodes" ? "hidden" : undefined}
          >
            <NodePalette onAddNode={onAddNode} />
          </div>
          <div
            role="tabpanel"
            id={panelId("data")}
            aria-labelledby={tabId("data")}
            hidden={activeTab !== "data"}
            className={activeTab !== "data" ? "hidden" : undefined}
          >
            <WorkflowDataPanel workflowId={workflowId} />
          </div>
          <div
            role="tabpanel"
            id={panelId("quality")}
            aria-labelledby={tabId("quality")}
            hidden={activeTab !== "quality"}
            className={activeTab !== "quality" ? "hidden" : undefined}
          >
            <WorkflowQualityPanel workflowId={workflowId} currentVersionId={currentVersionId} />
          </div>
          <div
            role="tabpanel"
            id={panelId("versions")}
            aria-labelledby={tabId("versions")}
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
            id={panelId("compare")}
            aria-labelledby={tabId("compare")}
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
