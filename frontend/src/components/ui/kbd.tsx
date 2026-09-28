import { cn } from "@/lib/utils";

/**
 * Keycap. One recipe for every keyboard hint — inline canvas/inspector copy and
 * the shortcuts dialog alike (callers that need a bigger cap override the size).
 */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "rounded-sm border border-border bg-surface-input px-1.5 py-0.5 font-mono text-2xs text-muted shadow-sheen",
        className
      )}
    >
      {children}
    </kbd>
  );
}
