import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned header slot for counts, chips, or actions. */
  actions?: React.ReactNode;
  /** Remove body padding for flush lists/tables. */
  flush?: boolean;
  /**
   * `inset` sinks the header into the card (input-toned fill + mid hairline) for
   * panels whose header is a control strip rather than a title. Keeps `border-b`
   * so the compact-density selector still matches.
   */
  headerTone?: "plain" | "inset";
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** The house section recipe: bordered surface card with a hairline header. */
export function SectionCard({
  title,
  description,
  actions,
  flush = false,
  headerTone = "plain",
  id,
  className,
  children,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={cn(
        "surface-card rounded-lg border border-border bg-surface shadow-elev-1",
        id && "scroll-mt-6",
        className
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-3 border-b px-4 py-3",
          headerTone === "inset"
            ? "border-border-mid bg-surface-input"
            : "border-border"
        )}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-2xs text-subtle">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
