"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Keyboard, Menu, Plus, Search } from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { isActivePath, navItems } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
      <SheetContent side="bottom" className="rounded-t-lg border-border bg-surface-elevated p-0">
        <SheetHeader className="bg-surface-input">
          <SheetTitle>Aegis Workbench</SheetTitle>
          <SheetDescription>Navigate, create, and inspect workflow operations.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-2 px-5 py-4">
          <Button asChild className="w-full min-w-0 justify-start gap-2" size="sm">
            <Link href="/workflows/new">
              <Plus className="h-4 w-4" />
              New workflow
            </Link>
          </Button>
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
            const active = isActivePath(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 items-center justify-between overflow-hidden rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border border-primary/20 bg-primary-muted text-foreground"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <span className="inline-flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-lg border border-border bg-surface-input p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
                      active && "border-primary/30 text-primary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </span>
                {active && <span className="absolute inset-y-2 right-2 w-px rounded bg-primary" />}
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
              className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <span className="rounded-lg border border-border bg-surface-input p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
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
