"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search, Shield } from "lucide-react";
import { MobileNav } from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
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
  onOpenCommandPalette?: () => void;
  onOpenShortcutsHelp?: () => void;
}

export function AppNav({ onOpenCommandPalette, onOpenShortcutsHelp }: AppNavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-6 lg:px-8">
        <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/20">
            <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2.25} />
          </div>
          <div className="leading-none">
            <span className="text-sm font-semibold tracking-tight text-foreground">Aegis</span>
            <p className="mt-0.5 text-[11px] text-muted">Agent Platform</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
          {navItems.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              className={cn("nav-link", isActive(pathname, href, exact) && "nav-link-active")}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Tooltip content="Search (⌘K)">
            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-2 text-muted sm:inline-flex"
              onClick={onOpenCommandPalette}
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4" />
              <span className="text-xs">Search</span>
              <kbd className="rounded border border-border bg-surface px-1 font-mono text-[10px]">⌘K</kbd>
            </Button>
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
      </div>
    </header>
  );
}