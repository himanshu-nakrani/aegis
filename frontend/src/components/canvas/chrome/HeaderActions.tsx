"use client";

import { Compass, Download, MoreHorizontal, Save, Upload } from "lucide-react";

import { startCanvasTour } from "@/components/onboarding/CanvasTour";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortcutKeys } from "@/lib/shortcuts";

export function HeaderActions({
  onSave,
  onSaveAsNew,
  onImport,
  onExport,
  isSaving,
  disabled,
}: {
  onSave: () => void;
  onSaveAsNew: () => void;
  onImport: () => void;
  onExport: () => void;
  isSaving?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={disabled || isSaving}
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save · {formatShortcutKeys(["⌘", "S"])}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="More actions"
            disabled={disabled}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onSaveAsNew}>
            <Save className="h-4 w-4" />
            Save as new version
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onImport}>
            <Upload className="h-4 w-4" />
            Import JSON…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExport}>
            <Download className="h-4 w-4" />
            Export JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => startCanvasTour()}>
            <Compass className="h-4 w-4" />
            Canvas tour
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
