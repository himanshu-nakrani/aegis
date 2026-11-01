"use client";

import { useReactFlow } from "@xyflow/react";
import {
  Gauge,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CanvasToolbar({
  onTidy,
  onDelete,
  deleteDisabled,
  tidyDisabled,
  tidyTitle,
  animMs,
  showTelemetry = false,
  onToggleTelemetry,
}: {
  onTidy: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  tidyDisabled?: boolean;
  /** Tooltip override for the tidy button (e.g. the reason it is disabled). */
  tidyTitle?: string;
  animMs: number;
  /** Controlled telemetry-overlay state (owned by WorkflowCanvas). OFF default. */
  showTelemetry?: boolean;
  /** Flips the telemetry overlay. Absent = button hidden (safe standalone). */
  onToggleTelemetry?: (next: boolean) => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg glass-panel p-0.5 shadow-elev-1 sm:gap-1 sm:p-1"
      role="group"
      aria-label="Canvas controls"
    >
      <ToolbarGroup>
        <ToolbarButton
          label="Zoom out"
          onClick={() => zoomOut({ duration: animMs })}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          label="Zoom in"
          onClick={() => zoomIn({ duration: animMs })}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup>
        <ToolbarButton
          label="Fit view"
          short="Fit"
          showLabel
          onClick={() =>
            fitView({ padding: 0.2, maxZoom: 1.2, duration: animMs })
          }
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="More canvas actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-52">
          <DropdownMenuItem
            onSelect={onTidy}
            disabled={tidyDisabled}
            aria-label={
              tidyDisabled && tidyTitle ? `Tidy layout. ${tidyTitle}` : undefined
            }
            title={tidyTitle}
          >
            <Wand2 className="h-4 w-4" />
            Tidy layout
          </DropdownMenuItem>
          {onToggleTelemetry && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showTelemetry}
                onCheckedChange={(checked) =>
                  onToggleTelemetry(checked === true)
                }
              >
                <Gauge className="h-4 w-4" />
                Show node telemetry
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteDisabled !== true && (
        <>
          <Divider />
          <ToolbarGroup>
            <ToolbarButton
              label="Delete selection"
              onClick={onDelete}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
        </>
      )}
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-border" />;
}

function ToolbarButton({
  label,
  tooltip,
  short,
  onClick,
  disabled,
  className,
  pressed,
  showLabel = false,
  children,
}: {
  label: string;
  /** Tooltip text when it should differ from the visible/aria label. */
  tooltip?: string;
  /** Compact visible label when the full one is too long for the toolbar. */
  short?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** When defined, renders as an aria-pressed toggle with an active surface. */
  pressed?: boolean;
  showLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "sm" : "icon-sm"}
          className={cn(pressed && "bg-surface-hover", className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
        >
          {children}
          {showLabel && <span className="hidden sm:inline">{short ?? label}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
