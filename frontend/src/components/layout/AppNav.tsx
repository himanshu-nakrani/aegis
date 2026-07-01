"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, Shield } from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { MobileNav } from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/templates", label: "Templates" },
  { href: "/observability", label: "Observability" },
  { href: "/guardrails", label: "Guardrails" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AppNavProps {
  onOpenShortcutsHelp?: () => void;
}

export function AppNav({ onOpenShortcutsHelp }: AppNavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 px-3 pt-3">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-4 rounded-xl border border-border bg-surface-elevated px-4 shadow-elev-2 backdrop-blur-xl sm:px-6 lg:gap-6 lg:px-8">
        <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/20">
            <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2.25} />
          </div>
          <div className="leading-none">
            <span className="text-sm font-semibold tracking-tight text-foreground">Aegis</span>
            <p className="text-micro mt-0.5 text-muted">Agent Platform</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
          {navItems.map(({ href, label, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("nav-link relative", active && "nav-link-active")}
              >
                {label}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded bg-gradient-to-r from-primary-500 to-accent-500"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hidden gap-2 text-muted sm:inline-flex"
                onClick={openCommandPalette}
                aria-label="Open command palette"
              >
                <Search className="h-4 w-4" />
                <span className="text-xs">Search</span>
                <kbd className="rounded border border-border bg-surface px-1 font-mono text-micro">⌘K</kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search (⌘K)</TooltipContent>
          </Tooltip>
          <MobileNav onOpenShortcutsHelp={onOpenShortcutsHelp} />
          <Link href="/workflows/new" className="hidden sm:block">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Workflow
            </Button>
          </Link>
          <Link href="/workflows/new" className="sm:hidden">
            <Button size="icon-lg" aria-label="New workflow">
              <Plus className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}