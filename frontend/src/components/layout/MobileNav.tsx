"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <nav aria-label="Mobile" className="flex flex-col gap-1 pb-4">
          {navItems.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-lg px-4 py-3 text-sm font-medium transition",
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
              onClick={onOpenShortcutsHelp}
              className="rounded-lg px-4 py-3 text-left text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
            >
              Keyboard shortcuts
            </button>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}