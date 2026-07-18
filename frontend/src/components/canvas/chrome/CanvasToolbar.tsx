"use client";

import { useReactFlow } from "@xyflow/react";
import { Gauge, Maximize2, Minus, Plus, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CanvasToolbar({
  onTidy,
  onDelete,
  deleteDisabled,
  tidyDisabled,
  animMs,
  showTelemetry = false,
  onToggleTelemetry,
}: {
  onTidy: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  tidyDisabled?: boolean;
  animMs: number;
  /** Controlled telemetry-overlay state (owned by WorkflowCanvas). OFF default. */
  showTelemetry?: boolean;
  /** Flips the telemetry overlay. Absent = button hidden (safe standalone). */
  onToggleTelemetry?: (next: boolean) => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex items-center gap-1 rounded-lg glass-panel p-1 shadow-elev-1">
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
          onClick={() =>
            fitView({ padding: 0.2, maxZoom: 1.2, duration: animMs })
          }
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      {onToggleTelemetry && (
        <>
          <Divider />
          <ToolbarGroup>
            <ToolbarButton
              label={showTelemetry ? "Hide node telemetry" : "Show node telemetry"}
              onClick={() => onToggleTelemetry(!showTelemetry)}
              pressed={showTelemetry}
              className={showTelemetry ? "text-foreground" : undefined}
            >
              <Gauge className="h-3.5 w-3.5" />
            </ToolbarButton>
          </ToolbarGroup>
        </>
      )}

      <Divider />

      <ToolbarGroup>
        <ToolbarButton
          label="Tidy layout"
          onClick={onTidy}
          disabled={tidyDisabled}
        >
          <Wand2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup>
        <ToolbarButton
          label="Delete selection"
          onClick={onDelete}
          disabled={deleteDisabled}
          className={deleteDisabled ? undefined : "text-destructive"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>
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
  onClick,
  disabled,
  className,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** When defined, renders as an aria-pressed toggle with an active surface. */
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(pressed && "bg-surface-hover", className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
