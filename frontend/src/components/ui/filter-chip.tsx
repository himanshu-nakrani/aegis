import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FilterChip({ label, active, onClick, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-primary bg-primary-muted text-foreground"
          : "border-border bg-surface text-muted hover:border-border-strong hover:bg-surface-hover hover:text-foreground",
        className
      )}
    >
      {label}
    </button>
  );
}