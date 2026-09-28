import type { RunStatusTone } from "@/lib/run-status";
import { cn } from "@/lib/utils";

/** `active` extends the run-status ladder with the copper live-execution signal. */
export type StatusDotTone = RunStatusTone | "active";

const TONE_CLASS: Record<StatusDotTone, string> = {
  success: "bg-success/80",
  warning: "bg-warning/80",
  destructive: "bg-destructive/80",
  accent: "bg-accent",
  muted: "bg-muted/70",
  active: "bg-active",
};

/**
 * The one status pip. Rows and cards pair it with a colored status word
 * (`runStatusTextClass`); detail headers use a Badge instead. Callers holding a
 * raw run status pass `tone={runStatusTone(status)}` rather than inventing a
 * mapping — see lib/run-status.ts.
 */
export function StatusDot({
  tone,
  pulse = false,
  size = "sm",
  className,
}: {
  tone: StatusDotTone;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 rounded-full",
        size === "md" ? "h-2 w-2" : "h-1.5 w-1.5",
        TONE_CLASS[tone],
        pulse && "animate-pulse",
        className
      )}
    />
  );
}
