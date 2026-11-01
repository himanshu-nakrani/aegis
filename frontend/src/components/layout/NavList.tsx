"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, navItems } from "@/components/layout/nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const sections = [
  { label: "Workspace", paths: ["/", "/templates", "/observability"] },
  { label: "Resources", paths: ["/prompts", "/knowledge", "/guardrails", "/playground"] },
  { label: "Manage", paths: ["/credentials", "/settings"] },
];

export function NavList({
  expanded,
  scope,
  onNavigate,
}: {
  expanded: boolean;
  scope: "rail" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className={cn("space-y-6", expanded ? "px-4" : "px-2")}>
      {sections.map((section) => (
        <div key={section.label}>
          {expanded ? (
            <p className="mb-2 px-2 text-2xs font-medium tracking-wide text-subtle">{section.label}</p>
          ) : <div className="mx-auto mb-2 w-5 border-t border-border" aria-hidden />}
          <div className="space-y-1">
            {section.paths.map((path) => {
              const item = navItems.find(({ href }) => href === path)!;
              const { href, label, description, exact, icon: Icon } = item;
              const active = isActivePath(pathname, href, exact);
              const link = (
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "focus-ring relative flex h-9 items-center rounded-md transition-colors duration-1",
                    expanded ? "w-full gap-3 px-2.5" : "justify-center",
                    active ? "nav-link-active" : "text-muted hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {expanded && <span className="truncate text-[13px] font-medium">{label}</span>}
                  {active && <span className={cn("absolute inset-y-2 w-0.5 rounded-r-full bg-foreground", expanded ? "-left-4" : "-left-2")} aria-hidden />}
                </Link>
              );
              if (expanded) return <div key={href}>{link}</div>;
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side={scope === "rail" ? "right" : "bottom"}>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-muted">{description}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
