"use client";

import Link from "next/link";
import { Keyboard, Moon, PanelLeftClose, PanelLeftOpen, Search, Shield, Sun } from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { NavList } from "@/components/layout/NavList";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRail } from "@/hooks/use-rail";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

export function AppRail({ onOpenShortcutsHelp }: { onOpenShortcutsHelp?: () => void }) {
  const { rail, mounted, toggleRail } = useRail();
  const { toggleTheme } = useTheme();
  const expanded = mounted && rail === "expanded";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col border-r border-border bg-surface transition-[width] duration-2 ease-out-soft md:flex"
    >
      <Link
        href="/"
        aria-label="Aegis home"
        className={cn("focus-ring flex h-20 shrink-0 items-center gap-3", expanded ? "px-6" : "justify-center")}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-elevated">
          <Shield className="h-[18px] w-[18px] text-foreground" strokeWidth={1.75} />
        </span>
        {expanded && <span className="text-lg font-semibold tracking-tight text-foreground">Aegis</span>}
      </Link>

      <div className={cn("mb-6", expanded ? "px-4" : "flex justify-center")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={openCommandPalette}
              aria-label="Search workspace"
              className={cn(
                "focus-ring flex h-9 items-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
                expanded ? "w-full gap-2 border border-border bg-surface-input px-2.5 text-xs" : "w-9 justify-center"
              )}
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {expanded && <><span className="flex-1 text-left">Search workspace</span><Kbd className="py-0 text-subtle">⌘K</Kbd></>}
            </button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Search workspace · ⌘K</TooltipContent>}
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <NavList scope="rail" expanded={expanded} />
      </div>

      <div className={cn("flex shrink-0 items-center gap-1 border-t border-border py-3", expanded ? "px-4" : "flex-col")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme" className="text-muted">
              <Sun className="hidden h-4 w-4 dark:block" />
              <Moon className="h-4 w-4 dark:hidden" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={expanded ? "top" : "right"}>Toggle theme</TooltipContent>
        </Tooltip>
        {onOpenShortcutsHelp && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onOpenShortcutsHelp} aria-label="Keyboard shortcuts" className="text-muted">
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={expanded ? "top" : "right"}>Keyboard shortcuts</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleRail}
              aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
              aria-expanded={expanded}
              className={cn("text-muted", expanded && "ml-auto")}
            >
              {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={expanded ? "top" : "right"}>{expanded ? "Collapse navigation" : "Expand navigation"}</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
