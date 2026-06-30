"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { Button } from "@/components/ui/button";
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

interface MobileNavProps {
  onOpenShortcutsHelp?: () => void;
}

export function MobileNav({ onOpenShortcutsHelp }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useFocusTrap(panelRef, open);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-nav-panel"
            ref={panelRef}
            aria-label="Mobile"
            className="fixed inset-x-4 top-[4.25rem] z-50 rounded-xl border border-border bg-surface-elevated p-2 shadow-2xl"
          >
            {navItems.map(({ href, label, exact }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "block rounded-lg px-4 py-3 text-sm font-medium transition",
                  isActive(pathname, href, exact)
                    ? "bg-primary-muted text-foreground"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                )}
              >
                {label}
              </Link>
            ))}
            {onOpenShortcutsHelp && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenShortcutsHelp();
                }}
                className="block w-full rounded-lg px-4 py-3 text-left text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                Keyboard shortcuts
              </button>
            )}
          </nav>
        </>
      )}
    </div>
  );
}