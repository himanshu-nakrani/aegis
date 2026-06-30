"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  LayoutTemplate,
  Plus,
  Search,
  Settings,
  Shield,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  href: string;
  keywords?: string[];
}

const NAV_ITEMS: PaletteItem[] = [
  { id: "nav-dashboard", label: "Dashboard", icon: Workflow, href: "/", keywords: ["home"] },
  { id: "nav-templates", label: "Templates", icon: LayoutTemplate, href: "/templates" },
  { id: "nav-observability", label: "Observability", icon: Activity, href: "/observability" },
  { id: "nav-guardrails", label: "Guardrails", icon: Shield, href: "/guardrails" },
  { id: "nav-settings", label: "Settings", icon: Settings, href: "/settings" },
  {
    id: "nav-new-workflow",
    label: "New workflow",
    description: "Create a blank workflow",
    icon: Plus,
    href: "/workflows/new",
    keywords: ["create"],
  },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
    enabled: open,
    staleTime: 30_000,
  });

  const workflowItems: PaletteItem[] = useMemo(
    () =>
      workflows.map((wf) => ({
        id: `wf-${wf.id}`,
        label: wf.name,
        description: wf.description || `Version ${wf.latest_version_number ?? 1}`,
        icon: Workflow,
        href: `/workflows/${wf.id}`,
        keywords: [wf.id, wf.description || ""],
      })),
    [workflows]
  );

  const allItems = useMemo(() => [...NAV_ITEMS, ...workflowItems], [workflowItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 12);
    return allItems
      .filter((item) => {
        const haystack = [item.label, item.description || "", ...(item.keywords || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 12);
  }, [allItems, query]);

  useFocusTrap(panelRef, open);

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery("");
      setActiveIndex(0);
      router.push(href);
    },
    [onOpenChange, router]
  );

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filteredItems[activeIndex]) {
      e.preventDefault();
      navigate(filteredItems[activeIndex].href);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        className="relative z-10 w-full max-w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-2xl animate-fade-in"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search workflows and pages…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
          />
          <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">
            esc
          </kbd>
        </div>

        <ul id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted">No results found</li>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                      index === activeIndex
                        ? "bg-primary-muted text-foreground"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      {item.description && (
                        <p className="truncate text-xs text-muted">{item.description}</p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted">
          <span>Navigate with ↑↓ · Enter to open</span>
          <span>
            <kbd className="hidden rounded border border-border bg-surface px-1 font-mono sm:inline-flex">
              ⌘K
            </kbd>
          </span>
        </div>
      </div>
    </div>
  );
}