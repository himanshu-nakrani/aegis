"use client";

import { Dialog } from "@/components/ui/dialog";
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
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="Productivity shortcuts across Aegis."
      className="max-w-md"
    >
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.description}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <span className="text-sm text-foreground">{item.description}</span>
            <kbd className="shrink-0 rounded border border-border bg-surface-elevated px-2 py-0.5 font-mono text-xs text-muted">
              {formatShortcutKeys(item.keys)}
            </kbd>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}