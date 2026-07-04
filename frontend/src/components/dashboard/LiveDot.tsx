"use client";

import { cn } from "@/lib/utils";
import { useGlowPulse } from "@/components/motion";

type Props = {
  connected: boolean;
  className?: string;
};

export function LiveDot({ connected, className }: Props) {
  const pulse = useGlowPulse("primary");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-muted",
        className
      )}
      aria-label={connected ? "Live updates connected" : "Live updates disconnected"}
    >
      <span
        className={cn("h-2 w-2 rounded-full", connected ? `bg-success ${pulse}` : "bg-muted")}
        aria-hidden
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}
