"use client";

import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { MobileNav } from "@/components/layout/MobileNav";
import { Button } from "@/components/ui/button";

interface MobileTopBarProps {
  onOpenShortcutsHelp?: () => void;
}

export function MobileTopBar({ onOpenShortcutsHelp }: MobileTopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center border-b border-border bg-bg/95 px-4 backdrop-blur-sm md:hidden">
      <Link href="/" className="focus-ring group flex items-center gap-2.5 rounded-lg">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated transition-colors group-hover:border-border-strong">
          <Shield className="h-4 w-4 text-foreground" strokeWidth={2} />
        </div>
        <div className="leading-none">
          <span className="text-sm font-semibold text-foreground">Aegis</span>
          <p className="text-micro mt-0.5 text-muted">Workbench</p>
        </div>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <MobileNav onOpenShortcutsHelp={onOpenShortcutsHelp} />
        <Button asChild size="icon-lg" aria-label="New workflow">
          <Link href="/workflows/new">
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
