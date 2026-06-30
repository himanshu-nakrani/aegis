import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Signed percentage change, e.g. 12 or -8.5. Use 0 for neutral. */
  deltaPercent: number;
  /** Label for the comparison window, e.g. "vs prior 7d". */
  comparisonLabel?: string;
  className?: string;
};

export function TrendPill({
  deltaPercent,
  comparisonLabel = "vs prior 7d",
  className,
}: Props) {
  const direction = deltaPercent > 0 ? "up" : deltaPercent < 0 ? "down" : "flat";
  const Icon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const tone =
    direction === "up"
      ? "text-success"
      : direction === "down"
        ? "text-destructive"
        : "text-muted";
  const sign = deltaPercent > 0 ? "+" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone, className)}>
      <Icon className="h-3 w-3" />
      {sign}
      {deltaPercent.toFixed(0)}% <span className="text-muted">{comparisonLabel}</span>
    </span>
  );
}