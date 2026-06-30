"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
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

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
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
          <nav className="fixed inset-x-4 top-[4.25rem] z-50 rounded-xl border border-border bg-surface-elevated p-2 shadow-2xl">
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
          </nav>
        </>
      )}
    </div>
  );
}