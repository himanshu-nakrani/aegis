"use client";

import Link from "next/link";
import {
  Keyboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Shield,
  Sun,
} from "lucide-react";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { NavList } from "@/components/layout/NavList";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRail } from "@/hooks/use-rail";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface AppRailProps {
  onOpenShortcutsHelp?: () => void;
}

/**
 * The app rail: a 56px icon column by default, expanding to a 224px labeled
 * rail when the user asks for it (persisted, applied pre-hydration). Hidden
 * below md, where MobileNav takes over with a top bar + drawer.
 */
export function AppRail({ onOpenShortcutsHelp }: AppRailProps) {
  const { rail, mounted, toggleRail } = useRail();
  const { toggleTheme } = useTheme();
  // Width comes from --rail-w (bootstrap-set, paint-correct). The expanded
  // *markup* waits for mount so server and client HTML match; one frame of
  // icon-layout inside an already-224px rail beats a 168px gap.
  const expanded = mounted && rail === "expanded";

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col border-r border-border bg-surface-elevated py-3 transition-[width] duration-2 ease-out-soft md:flex",
        expanded ? "items-stretch" : "items-center"
      )}
    >
      <div className={cn("flex items-center", expanded ? "gap-2.5 px-4" : "justify-center")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/"
              aria-label="Aegis home"
              className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated transition-colors duration-1 hover:border-border-strong"
            >
              <Shield className="h-4 w-4 text-foreground" strokeWidth={2} />
            </Link>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Aegis home</TooltipContent>}
        </Tooltip>
        {expanded && (
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            Aegis
          </span>
        )}
      </div>

      <div className={cn("mt-3", expanded ? "px-3" : "flex justify-center")}>
        {expanded ? (
          <Button asChild size="sm" className="w-full">
            <Link href="/workflows/new">
              <Plus className="h-3.5 w-3.5" />
              New workflow
            </Link>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="icon" className="focus-ring h-10 w-10" aria-label="New workflow">
                <Link href="/workflows/new">
                  <Plus className="h-[18px] w-[18px]" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New workflow</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className={cn("my-3 border-b border-border", expanded ? "mx-4" : "w-8")} />

      <NavList scope="rail" expanded={expanded} />

      <div
        className={cn(
          "mt-auto flex flex-col gap-1",
          expanded ? "items-stretch px-3" : "items-center"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={expanded ? "sm" : "icon"}
              className={cn("focus-ring text-muted", expanded ? "w-full justify-start gap-2" : "h-10 w-10")}
              onClick={openCommandPalette}
              aria-label="Search"
            >
              <Search className={expanded ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
              {expanded && "Search"}
            </Button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Search ⌘K</TooltipContent>}
        </Tooltip>

        {onOpenShortcutsHelp && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={expanded ? "sm" : "icon"}
                className={cn("focus-ring text-muted", expanded ? "w-full justify-start gap-2" : "h-10 w-10")}
                onClick={onOpenShortcutsHelp}
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className={expanded ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
                {expanded && "Shortcuts"}
              </Button>
            </TooltipTrigger>
            {!expanded && <TooltipContent side="right">Keyboard shortcuts</TooltipContent>}
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={expanded ? "sm" : "icon"}
              className={cn("focus-ring text-muted", expanded ? "w-full justify-start gap-2" : "h-10 w-10")}
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {/* Both icons in the markup, CSS picks one: the theme class is
                  applied pre-hydration, so server and client HTML must match. */}
              <Sun className={cn("hidden dark:block", expanded ? "h-3.5 w-3.5" : "h-[18px] w-[18px]")} />
              <Moon className={cn("dark:hidden", expanded ? "h-3.5 w-3.5" : "h-[18px] w-[18px]")} />
              {expanded && "Theme"}
            </Button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Toggle theme</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={expanded ? "sm" : "icon"}
              className={cn("focus-ring text-muted", expanded ? "w-full justify-start gap-2" : "h-10 w-10")}
              onClick={toggleRail}
              aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
              aria-expanded={expanded}
            >
              {expanded ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-[18px] w-[18px]" />
              )}
              {expanded && "Collapse"}
            </Button>
          </TooltipTrigger>
          {!expanded && (
            <TooltipContent side="right">Expand navigation</TooltipContent>
          )}
        </Tooltip>
      </div>
    </nav>
  );
}
