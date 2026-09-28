"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { isActivePath, navItems } from "@/components/layout/nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The nav list shared by the expanded rail and the mobile drawer, so both
 * surfaces can never drift. Collapsed it is the icon column (labels move into
 * tooltips); expanded it adds the label plus its one-line purpose.
 *
 * `scope` keeps the framer layoutId unique per mounted surface — the rail stays
 * mounted at every width, so a shared id would animate two pills at once.
 */
export function NavList({
  expanded,
  scope,
}: {
  expanded: boolean;
  scope: "rail" | "drawer";
}) {
  const pathname = usePathname();
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        expanded ? "items-stretch px-3" : "items-center"
      )}
    >
      {navItems.map(({ href, label, description, exact, icon: Icon }) => {
        const active = isActivePath(pathname, href, exact);
        const link = (
          <Link
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring relative flex h-10 items-center rounded-md border border-transparent transition-colors duration-1",
              expanded ? "w-full gap-3 px-3" : "w-10 justify-center",
              active
                ? "nav-link-active"
                : "text-muted hover:bg-surface-hover hover:text-foreground"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {expanded && (
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="block truncate text-2xs text-subtle">{description}</span>
              </span>
            )}
            {active && (
              <motion.span
                layoutId={`nav-active-${scope}`}
                className="absolute -left-px inset-y-2 w-0.5 rounded-r-full bg-foreground"
              />
            )}
          </Link>
        );
        if (expanded) return <div key={href}>{link}</div>;
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
