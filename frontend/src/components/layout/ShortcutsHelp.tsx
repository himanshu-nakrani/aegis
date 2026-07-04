"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS, formatShortcutKeys } from "@/lib/shortcuts";

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCanvas?: boolean;
}

export function ShortcutsHelp({ open, onOpenChange, onCanvas = false }: ShortcutsHelpProps) {
  const items = SHORTCUTS.filter(
    (item) => item.context === "global" || (onCanvas && item.context === "canvas")
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Productivity shortcuts across Aegis.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.description}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
            >
              <span className="text-sm text-foreground">{item.description}</span>
              <kbd className="shrink-0 rounded border border-border bg-surface-input px-2 py-0.5 font-mono text-xs font-semibold text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                {formatShortcutKeys(item.keys)}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
