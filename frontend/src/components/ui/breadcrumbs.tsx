import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Trail above a page title. Intermediate items are links; the last is the
 * current page and carries `aria-current`.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Array<{ label: string; href?: string }>;
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
              )}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="focus-ring rounded-sm transition-colors duration-1 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last && "text-foreground")}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
