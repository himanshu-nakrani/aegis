"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Live-state adornment after the label (e.g. the running dot). */
  trailing?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Required: the group has no visible label of its own. */
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Mutually exclusive toggle group — the house recipe for a two/three-way switch
 * (theme, density, canvas mode). The active side reads as *lifted* out of an
 * inset track, never as a color change: chroma stays reserved for data.
 *
 * Callers that render a value unknown during SSR (stored theme/density) must
 * gate on their own `mounted` flag and reserve the same footprint, or the
 * control will flash the wrong side.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "sm",
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 rounded-lg border border-border bg-surface-input p-0.5 shadow-sheen",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            disabled={option.disabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors duration-1",
              size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs",
              active
                ? "bg-surface-elevated text-foreground shadow-elev-1"
                : "text-muted hover:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {Icon && (
              <Icon
                className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"}
                aria-hidden
              />
            )}
            <span data-slot="segmented-label">{option.label}</span>
            {option.trailing}
          </button>
        );
      })}
    </div>
  );
}
