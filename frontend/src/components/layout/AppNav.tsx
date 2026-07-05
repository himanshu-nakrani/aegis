"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, Shield } from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { MobileNav } from "@/components/layout/MobileNav";
import { isActivePath, navItems } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AppNavProps {
  onOpenShortcutsHelp?: () => void;
}

export function AppNav({ onOpenShortcutsHelp }: AppNavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/88 shadow-[0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-6 lg:px-8">
        <Link href="/" className="focus-ring group flex items-center gap-2.5 rounded-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(20,184,166,0.16)] transition-colors group-hover:border-primary/45">
            <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2.25} />
          </div>
          <div className="leading-none">
            <span className="text-sm font-semibold text-foreground">Aegis</span>
            <p className="text-micro mt-0.5 text-muted">Workbench</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
          {navItems.map(({ href, label, exact, icon: Icon }) => {
            const active = isActivePath(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("nav-link relative gap-1.5 overflow-hidden", active && "nav-link-active")}
              >
                <Icon className={cn("h-3.5 w-3.5", active && "text-primary")} />
                {label}
                {active && (
                  <motion.span
                    layoutId="nav-active-rail"
                    className="absolute inset-x-2 bottom-0 h-px rounded bg-gradient-to-r from-primary-500 to-accent-500"
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
                className="hidden min-w-28 justify-between gap-2 border border-border bg-surface-input text-muted shadow-elev-1 sm:inline-flex"
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
          <Button asChild size="sm" className="hidden shadow-[0_10px_28px_rgba(20,184,166,0.16)] sm:inline-flex">
            <Link href="/workflows/new">
              <Plus className="h-4 w-4" />
              New Workflow
            </Link>
          </Button>
          <Button asChild size="icon-lg" className="sm:hidden" aria-label="New workflow">
            <Link href="/workflows/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
