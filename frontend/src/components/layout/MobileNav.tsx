"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Keyboard, Menu, Moon, Search, Shield, Sun } from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { NavList } from "@/components/layout/NavList";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTheme } from "@/providers/ThemeProvider";

interface MobileNavProps {
  onOpenShortcutsHelp?: () => void;
}

/**
 * Below md the rail is replaced by a sticky top bar plus a slide-over drawer —
 * 56px of permanent chrome is too expensive on a phone. The drawer reuses
 * NavList so the two surfaces can never drift.
 */
export function MobileNav({ onOpenShortcutsHelp }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { toggleTheme } = useTheme();
  const close = () => setOpen(false);

  // Close *after* the route changes: closing inside the link's onClick unmounts
  // the anchor before its default navigation runs and cancels the click.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-surface-elevated/95 px-3 backdrop-blur-sm md:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          className="focus-ring text-muted"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-[18px] w-[18px]" />
        </Button>
        <Link
          href="/"
          aria-label="Aegis home"
          className="focus-ring flex items-center gap-2 rounded-md"
        >
          <Shield className="h-4 w-4 text-foreground" strokeWidth={2} />
          <span className="text-sm font-semibold tracking-tight text-foreground">Aegis</span>
        </Link>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="focus-ring text-muted"
          onClick={openCommandPalette}
          aria-label="Search"
        >
          <Search className="h-[18px] w-[18px]" />
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[248px] gap-0 p-0 sm:max-w-[248px]"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Shield className="h-4 w-4" strokeWidth={2} />
              Aegis
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-3">
            <NavList scope="drawer" expanded />
          </div>
          <div className="flex items-center gap-1 border-t border-border px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="focus-ring flex-1 justify-start gap-2 text-muted"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <Sun className="hidden h-3.5 w-3.5 dark:block" />
              <Moon className="h-3.5 w-3.5 dark:hidden" />
              Theme
            </Button>
            {onOpenShortcutsHelp && (
              <Button
                variant="ghost"
                size="sm"
                className="focus-ring flex-1 justify-start gap-2 text-muted"
                onClick={() => {
                  close();
                  onOpenShortcutsHelp();
                }}
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="h-3.5 w-3.5" />
                Shortcuts
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
