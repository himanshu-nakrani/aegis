"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  LayoutTemplate,
  Plus,
  Settings,
  Shield,
  Workflow,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { isEditableTarget } from "@/lib/shortcuts";

const RECENTS_KEY = "aegis:command-recents";
const MAX_RECENTS = 5;
const OPEN_EVENT = "aegis:open-command-palette";

type Action = {
  id: string;
  label: string;
  description: string;
  group: "Navigate" | "Create" | "Help";
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  perform: (router: ReturnType<typeof useRouter>) => void;
};

const ACTIONS: Action[] = [
  {
    id: "nav:dashboard",
    label: "Dashboard",
    description: "Workspace overview and active workflows",
    group: "Navigate",
    icon: LayoutDashboard,
    perform: (r) => r.push("/"),
  },
  {
    id: "nav:workflows",
    label: "Workflows",
    description: "Browse, edit, and version workflow graphs",
    group: "Navigate",
    icon: Workflow,
    perform: (r) => r.push("/workflows"),
  },
  {
    id: "nav:templates",
    label: "Templates",
    description: "Clone production-ready workflow patterns",
    group: "Navigate",
    icon: LayoutTemplate,
    perform: (r) => r.push("/templates"),
  },
  {
    id: "nav:observability",
    label: "Observability",
    description: "Inspect runs, quality, traces, and scheduler health",
    group: "Navigate",
    icon: BarChart3,
    perform: (r) => r.push("/observability"),
  },
  {
    id: "nav:guardrails",
    label: "Guardrails",
    description: "Preview policy checks before wiring nodes",
    group: "Navigate",
    icon: Shield,
    perform: (r) => r.push("/guardrails"),
  },
  {
    id: "nav:settings",
    label: "Settings",
    description: "Credentials, API auth, and evaluation presets",
    group: "Navigate",
    icon: Settings,
    perform: (r) => r.push("/settings"),
  },
  {
    id: "create:workflow",
    label: "New workflow",
    description: "Start a blank workflow on the visual canvas",
    group: "Create",
    icon: Plus,
    shortcut: "N",
    perform: (r) => r.push("/workflows/new"),
  },
];

function CommandActionRow({ action }: { action: Action }) {
  const Icon = action.icon;
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-muted text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors group-data-[selected=true]/command-item:border-primary/35 group-data-[selected=true]/command-item:bg-primary-muted group-data-[selected=true]/command-item:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{action.label}</span>
        <span className="block truncate text-xs text-muted">{action.description}</span>
      </span>
      {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
    </>
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) setRecents(JSON.parse(raw) as string[]);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const recordRecent = (id: string) => {
    const next = [id, ...recents.filter((r) => r !== id)].slice(0, MAX_RECENTS);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {}
  };

  const run = (action: Action) => {
    recordRecent(action.id);
    setOpen(false);
    action.perform(router);
  };

  const groupBy = (items: Action[]) => {
    const map = new Map<string, Action[]>();
    for (const a of items) {
      const arr = map.get(a.group) ?? [];
      arr.push(a);
      map.set(a.group, arr);
    }
    return Array.from(map.entries());
  };

  const recentActions = recents
    .map((id) => ACTIONS.find((a) => a.id === id))
    .filter((a): a is Action => !!a);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Aegis command center">
      <Command>
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/60 via-accent/35 to-transparent" aria-hidden />
        <div className="border-b border-border bg-surface-input/55 px-3 pb-2 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Command center</p>
          <p className="mt-1 text-caption">Jump across the workbench or start a new workflow.</p>
        </div>
        <CommandInput placeholder="Search navigation, workflows, settings..." />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No matches. Try a different search.</CommandEmpty>
          {recentActions.length > 0 && (
            <CommandGroup heading="Recent">
              {recentActions.map((a) => (
                <CommandItem key={a.id} onSelect={() => run(a)}>
                  <CommandActionRow action={a} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {groupBy(ACTIONS).map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((a) => (
                <CommandItem key={a.id} onSelect={() => run(a)}>
                  <CommandActionRow action={a} />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
