import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  trend?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "min-h-24 rounded-lg border border-border bg-surface p-4 shadow-elev-1 transition-colors duration-fast hover:border-border-strong hover:bg-surface-hover",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-micro">{label}</p>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-input text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
          </div>
        )}
      </div>
      <p className="mt-5 text-[30px] font-semibold leading-none text-foreground">{value}</p>
      {trend && <p className="mt-1 text-xs text-muted">{trend}</p>}
    </div>
  );
}
