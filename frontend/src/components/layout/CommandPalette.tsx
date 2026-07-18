"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
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
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createWorkflowFromTemplate } from "@/lib/create-from-template";
import { getRecentWorkflows, recordWorkflowVisit, type RecentWorkflow } from "@/lib/recent-workflows";

const RECENTS_KEY = "aegis:command-recents";
const MAX_RECENTS = 5;
const OPEN_EVENT = "aegis:open-command-palette";
const MAX_WORKFLOW_RESULTS = 30;

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
    id: "nav:workflows",
    label: "Workflows",
    description: "Browse, edit, and version workflow graphs",
    group: "Navigate",
    icon: Workflow,
    perform: (r) => r.push("/"),
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

function WorkflowRow({ name, meta }: { name: string; meta?: string }) {
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input text-muted">
        <Workflow className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
      </span>
    </>
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [recentWorkflows, setRecentWorkflows] = useState<RecentWorkflow[]>([]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const templateCreatingRef = useRef(false);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const { data: workflows = [] } = useQuery({
    queryKey: queryKeys.workflows,
    queryFn: api.listWorkflows,
    enabled: open,
    staleTime: 30_000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.listTemplates,
    enabled: open && hasQuery,
    staleTime: 30_000,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) setRecents(JSON.parse(raw) as string[]);
    } catch {}
  }, []);

  // Reset query + refresh recent workflows whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setRecentWorkflows(getRecentWorkflows());
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (e.repeat) return;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Plain "n" jumps to the new-workflow canvas (advertised in the palette).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n") return;
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setOpen(false);
      router.push("/workflows/new");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

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

  const openWorkflow = (id: string, name: string) => {
    setOpen(false);
    recordWorkflowVisit(id, name);
    router.push(`/workflows/${id}`);
  };

  const applyTemplate = async (templateId: string) => {
    if (templateCreatingRef.current) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    templateCreatingRef.current = true;
    setOpen(false);
    try {
      const workflow = await createWorkflowFromTemplate(queryClient, template);
      router.push(`/workflows/${workflow.id}`);
    } catch {
      // toast surfaced by createWorkflowFromTemplate
    } finally {
      templateCreatingRef.current = false;
    }
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

  // When the workflows cache is loaded, drop recent entries that no longer exist.
  const workflowIds = new Set(workflows.map((w) => w.id));
  const visibleRecentWorkflows =
    workflows.length > 0
      ? recentWorkflows.filter((rw) => workflowIds.has(rw.id))
      : recentWorkflows;

  const visibleWorkflows = workflows.slice(0, MAX_WORKFLOW_RESULTS);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Aegis command center">
      <Command>
        <div className="border-b border-border px-3 pb-2 pt-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted">Command</p>
          <p className="mt-0.5 text-xs text-subtle">Jump across the workbench or start a new workflow.</p>
        </div>
        <CommandInput
          placeholder="Search navigation, workflows, templates…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No matches. Try a different search.</CommandEmpty>

          {!hasQuery && visibleRecentWorkflows.length > 0 && (
            <CommandGroup heading="Recent workflows">
              {visibleRecentWorkflows.map((rw) => (
                <CommandItem
                  key={rw.id}
                  value={`recent-workflow:${rw.id} ${rw.name}`}
                  onSelect={() => openWorkflow(rw.id, rw.name)}
                >
                  <WorkflowRow name={rw.name} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}

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

          {hasQuery && visibleWorkflows.length > 0 && (
            <CommandGroup heading="Workflows">
              {visibleWorkflows.map((w) => {
                const version =
                  w.latest_version_number != null ? `v${w.latest_version_number}` : null;
                const meta = version
                  ? `${version}${w.published ? " · published" : ""}`
                  : w.published
                    ? "published"
                    : undefined;
                return (
                  <CommandItem
                    key={w.id}
                    value={`workflow:${w.id} ${w.name} ${w.description ?? ""}`}
                    onSelect={() => openWorkflow(w.id, w.name)}
                  >
                    <WorkflowRow name={w.name} meta={meta} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {hasQuery && templates.length > 0 && (
            <CommandGroup heading="Templates">
              {templates.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`template:${t.id} ${t.name}`}
                  onSelect={() => void applyTemplate(t.id)}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input text-muted">
                    <LayoutTemplate className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      Use template: {t.name}
                    </span>
                    <span className="block truncate text-xs text-muted">{t.description}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
