"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, Layers, BarChart3, Shield, FileText } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { isEditableTarget } from "@/lib/shortcuts";

const RECENTS_KEY = "aegis:command-recents";
const MAX_RECENTS = 5;
const OPEN_EVENT = "aegis:open-command-palette";

type Action = {
  id: string;
  label: string;
  group: "Navigate" | "Create" | "Help";
  icon: React.ComponentType<{ className?: string }>;
  perform: (router: ReturnType<typeof useRouter>) => void;
};

const ACTIONS: Action[] = [
  {
    id: "nav:workflows",
    label: "Workflows",
    group: "Navigate",
    icon: Layers,
    perform: (r) => r.push("/workflows"),
  },
  {
    id: "nav:runs",
    label: "Runs",
    group: "Navigate",
    icon: FileText,
    perform: (r) => r.push("/runs"),
  },
  {
    id: "nav:observability",
    label: "Observability",
    group: "Navigate",
    icon: BarChart3,
    perform: (r) => r.push("/observability"),
  },
  {
    id: "nav:templates",
    label: "Templates",
    group: "Navigate",
    icon: Layers,
    perform: (r) => r.push("/templates"),
  },
  {
    id: "nav:guardrails",
    label: "Guardrails",
    group: "Navigate",
    icon: Shield,
    perform: (r) => r.push("/guardrails"),
  },
  {
    id: "nav:settings",
    label: "Settings",
    group: "Navigate",
    icon: Settings,
    perform: (r) => r.push("/settings"),
  },
  {
    id: "create:workflow",
    label: "New workflow",
    group: "Create",
    icon: Plus,
    perform: (r) => r.push("/workflows/new"),
  },
];

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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search actions, workflows, settings..." />
      <CommandList>
        <CommandEmpty>No matches. Try a different search.</CommandEmpty>
        {recentActions.length > 0 && (
          <CommandGroup heading="Recent">
            {recentActions.map((a) => (
              <CommandItem key={a.id} onSelect={() => run(a)}>
                <a.icon className="mr-2 h-4 w-4" />
                {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {groupBy(ACTIONS).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((a) => (
              <CommandItem key={a.id} onSelect={() => run(a)}>
                <a.icon className="mr-2 h-4 w-4" />
                {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}