export interface ShortcutItem {
  keys: string[];
  description: string;
  context?: "global" | "canvas";
}

export const SHORTCUTS: ShortcutItem[] = [
  { keys: ["⌘", "K"], description: "Open command palette", context: "global" },
  { keys: ["?"], description: "Show keyboard shortcuts", context: "global" },
  { keys: ["⌘", "S"], description: "Save workflow", context: "canvas" },
  { keys: ["Delete"], description: "Delete selected node or edge", context: "canvas" },
  { keys: ["⌘", "D"], description: "Duplicate selected node", context: "canvas" },
  { keys: ["⌘", "C"], description: "Copy selected node", context: "canvas" },
  { keys: ["⌘", "V"], description: "Paste node", context: "canvas" },
  { keys: ["⌘", "Z"], description: "Undo", context: "canvas" },
  { keys: ["⇧", "⌘", "Z"], description: "Redo", context: "canvas" },
  { keys: ["Esc"], description: "Close dialogs and menus", context: "global" },
];

export function formatShortcutKeys(keys: string[]): string {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return keys
    .map((key) => (key === "⌘" ? (isMac ? "⌘" : "Ctrl") : key))
    .join(isMac && keys.includes("⌘") ? "" : " + ");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}