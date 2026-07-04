import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  back?: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  className,
  as: Component = "h1",
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "dashboard-panel relative flex flex-col gap-6 overflow-hidden rounded-lg p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6",
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/50 via-accent/30 to-transparent" aria-hidden="true" />
      <div className="min-w-0 space-y-2">
        {back}
        {eyebrow && <p className="text-micro text-primary">{eyebrow}</p>}
        <Component className="text-[28px] font-semibold leading-9 text-foreground sm:text-[34px] sm:leading-10">
          {title}
        </Component>
        {description && (
          <div className="max-w-xl text-sm leading-6 text-muted sm:max-w-2xl">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
    </section>
  );
}
