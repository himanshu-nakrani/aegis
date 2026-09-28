import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Flush row for divided lists — the one recipe behind home rails, the workflow
 * library, credentials and rubric rows. `gutter` matches the container family:
 * rail cards pad `px-3`, full-width cards `px-4`. Focus is an inset ring
 * (`.focus-row`) because an outset ring would clip against the list edges.
 *
 * Trailing absolute buttons (pin, menu, delete) stay siblings of the Row inside
 * the caller's `li.group.relative`, exactly as before.
 *
 * Rows that are pure containers (actions live beside them, not inside) render
 * a `div` — a button role would lie about interactivity.
 */
export function Row({
  href,
  onClick,
  children,
  className,
  gutter = "card",
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  gutter?: "card" | "rail";
}) {
  const classes = cn(
    "focus-row flex items-center gap-2.5 py-2.5 transition-colors duration-1 hover:bg-surface-hover",
    gutter === "card" ? "px-4" : "px-3",
    className
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {children}
      </button>
    );
  }
  return <div className={classes}>{children}</div>;
}
