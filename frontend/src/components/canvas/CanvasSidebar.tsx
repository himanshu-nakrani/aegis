"use client";

import dynamic from "next/dynamic";
import { useId } from "react";
import { Database, GitCompare, History, Layers, PanelLeftClose, Sparkles } from "lucide-react";
import { NodePalette } from "@/components/canvas/NodePalette";
import type { DiffKind } from "@/components/canvas/VersionDiffView";
import type { NodeData, WorkflowVersion } from "@/types/workflow";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { useReducedMotionStrict } from "@/components/motion";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Cross-fades a tab panel's contents in place. The panel div itself stays
 * mounted (with its `hidden` attribute untouched) so query caches and scroll
 * state survive tab switches; only the inner contents fade.
 */
function TabPanelFade({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotionStrict();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={false}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

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

/** The tool set currently exposed by the canvas workspace. */
export type CanvasSidebarTab = "nodes" | "data" | "quality" | "versions" | "compare";

interface CanvasSidebarProps {
  activeTab: CanvasSidebarTab;
  onTabChange: (tab: CanvasSidebarTab) => void;
  /** Collapse the docked panel back to the canvas (hides this sidebar). */
  onCollapse?: () => void;
  onAddNode: (data: NodeData) => void;
  workflowId: string;
  currentVersionId?: string;
  onSelectVersion: (version: WorkflowVersion) => void;
  onDiffHighlight?: (highlights: Record<string, DiffKind> | null) => void;
}

const tabs: Array<{ id: CanvasSidebarTab; label: string; icon: React.ElementType }> = [
  { id: "nodes", label: "Nodes", icon: Layers },
  { id: "data", label: "Data", icon: Database },
  { id: "quality", label: "Quality", icon: Sparkles },
  { id: "versions", label: "Versions", icon: History },
  { id: "compare", label: "Compare", icon: GitCompare },
];

export function CanvasSidebar({
  activeTab,
  onTabChange,
  onCollapse,
  onAddNode,
  workflowId,
  currentVersionId,
  onSelectVersion,
  onDiffHighlight,
}: CanvasSidebarProps) {
  const sidebarId = useId();
  const tabId = (id: CanvasSidebarTab) => `canvas-tab-${sidebarId}-${id}`;
  const panelId = (id: CanvasSidebarTab) => `canvas-panel-${sidebarId}-${id}`;
  const { width, handleProps } = useResizablePanel({
    storageKey: "aegis:panel:left",
    defaultWidth: 320,
    min: 240,
    max: 420,
    side: "left",
  });
  const body = (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as CanvasSidebarTab)}
      className="flex min-h-0 flex-1 gap-0"
    >
      <div
        {...handleProps}
        className="focus-ring group absolute inset-y-0 -right-px z-10 block w-[3px] cursor-col-resize bg-transparent transition-colors duration-1 hover:bg-primary/30 active:bg-primary/30"
      />

      <div className="space-y-2 border-b border-border bg-background/25 p-2">
        <div className="flex h-6 items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-semibold text-muted">Workflow tools</h2>
          {onCollapse && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onCollapse}
                  aria-label="Hide workflow tools"
                >
                  <PanelLeftClose className="size-4" strokeWidth={1.75} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Hide workflow tools</TooltipContent>
            </Tooltip>
          )}
        </div>
        <TabsList
          aria-label="Workflow tools"
          className="grid w-full min-w-0 grid-cols-5 gap-0.5 shadow-none"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <span className="block min-w-0">
                  <TabsTrigger
                    value={id}
                    id={tabId(id)}
                    aria-label={label}
                    aria-controls={panelId(id)}
                    className="h-11 w-full min-w-0 flex-col gap-1 px-0 py-0.5 text-xs font-medium leading-4 tracking-normal hover:bg-surface-hover group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none"
                  >
                    <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                    <span className={width < 320 ? "sr-only" : "max-w-full truncate"}>{label}</span>
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
      </div>

        <div className="relative flex-1 overflow-y-auto p-3">
          <div
            role="tabpanel"
            id={panelId("nodes")}
            aria-labelledby={tabId("nodes")}
            hidden={activeTab !== "nodes"}
            className={activeTab !== "nodes" ? "hidden" : undefined}
          >
            <TabPanelFade active={activeTab === "nodes"}>
              <NodePalette onAddNode={onAddNode} />
            </TabPanelFade>
          </div>
          <div
            role="tabpanel"
            id={panelId("data")}
            aria-labelledby={tabId("data")}
            hidden={activeTab !== "data"}
            className={activeTab !== "data" ? "hidden" : undefined}
          >
            <TabPanelFade active={activeTab === "data"}>
              <WorkflowDataPanel workflowId={workflowId} />
            </TabPanelFade>
          </div>
          <div
            role="tabpanel"
            id={panelId("quality")}
            aria-labelledby={tabId("quality")}
            hidden={activeTab !== "quality"}
            className={activeTab !== "quality" ? "hidden" : undefined}
          >
            <TabPanelFade active={activeTab === "quality"}>
              <WorkflowQualityPanel workflowId={workflowId} currentVersionId={currentVersionId} />
            </TabPanelFade>
          </div>
          <div
            role="tabpanel"
            id={panelId("versions")}
            aria-labelledby={tabId("versions")}
            hidden={activeTab !== "versions"}
            className={activeTab !== "versions" ? "hidden" : undefined}
          >
            <TabPanelFade active={activeTab === "versions"}>
              <VersionHistory
                embedded
                workflowId={workflowId}
                currentVersionId={currentVersionId}
                onSelectVersion={onSelectVersion}
                onDiffHighlight={onDiffHighlight}
              />
            </TabPanelFade>
          </div>
          <div
            role="tabpanel"
            id={panelId("compare")}
            aria-labelledby={tabId("compare")}
            hidden={activeTab !== "compare"}
            className={activeTab !== "compare" ? "hidden" : undefined}
          >
            <TabPanelFade active={activeTab === "compare"}>
              <RunComparison embedded workflowId={workflowId} />
            </TabPanelFade>
          </div>
      </div>
    </Tabs>
  );

  return (
    <div
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-border bg-surface-elevated"
    >
      {body}
    </div>
  );
}
