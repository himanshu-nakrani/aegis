"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Keyboard,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Plus,
  Search,
  Settings,
  Shield,
  Workflow,
} from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/observability", label: "Observability", icon: BarChart3 },
  { href: "/guardrails", label: "Guardrails", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface MobileNavProps {
  onOpenShortcutsHelp?: () => void;
}

export function MobileNav({ onOpenShortcutsHelp }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl border-border bg-surface-elevated p-0">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <div className="border-b border-border px-5 pb-4 pt-5">
          <p className="text-sm font-semibold text-foreground">Aegis Workbench</p>
          <p className="mt-1 text-caption">Navigate, create, and inspect workflow operations.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 py-4">
          <Link href="/workflows/new">
            <Button className="w-full justify-start gap-2" size="sm">
              <Plus className="h-4 w-4" />
              New workflow
            </Button>
          </Link>
          <Button
            variant="outline"
            className="justify-start gap-2"
            size="sm"
            onClick={() => {
              setOpen(false);
              openCommandPalette();
            }}
          >
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
        <nav aria-label="Mobile" className="grid gap-1 px-3 pb-5">
          {navItems.map(({ href, label, exact, icon: Icon }) => {
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition",
                  active
                    ? "bg-primary-muted text-foreground"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <span className="inline-flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-lg border border-border bg-surface-input p-2",
                      active && "border-primary/30 text-primary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </span>
                {active && <span className="h-2 w-2 rounded-full bg-primary" />}
              </Link>
            );
          })}
          {onOpenShortcutsHelp && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenShortcutsHelp();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
            >
              <span className="rounded-lg border border-border bg-surface-input p-2">
                <Keyboard className="h-4 w-4" />
              </span>
              Keyboard shortcuts
            </button>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
