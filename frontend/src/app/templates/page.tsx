"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LayoutTemplate, Loader2, Search, Upload } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowTemplate } from "@/types/workflow";

type TemplateFilter = "all" | "eval" | "guardrail" | "approval";

const FILTER_OPTIONS: Array<{ id: TemplateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "eval", label: "Evaluation" },
  { id: "guardrail", label: "Guardrails" },
  { id: "approval", label: "Human approval" },
];

const FILTER_IDS = new Set<TemplateFilter>(["all", "eval", "guardrail", "approval"]);

function templateFlags(template: WorkflowTemplate) {
  const nodes = template.graph_json.nodes;
  return {
    hasEval: nodes.some((n) => n.data.nodeType === "evaluation"),
    hasGuardrail: nodes.some((n) => n.data.nodeType === "guardrail"),
    hasApproval: nodes.some((n) => n.data.nodeType === "human_approval"),
  };
}

/** Keep provenance and usage secondary to the template itself. */
function TemplateMeta({ template }: { template: WorkflowTemplate }) {
  const isBuiltin = template.builtin ?? !template.author;
  const source = isBuiltin || !template.author ? "Built-in" : "By " + template.author;
  const usage = template.usage_count ?? 0;

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-subtle">
      <span className="min-w-0 truncate">{source}</span>
      {usage > 0 && (
        <>
          <span aria-hidden="true" className="text-border-strong">·</span>
          <span className="shrink-0 tabular-nums">{pluralize(usage, "use")}</span>
        </>
      )}
    </div>
  );
}

function TemplateCapabilities({ template }: { template: WorkflowTemplate }) {
  const flags = templateFlags(template);
  const capabilities = [
    flags.hasEval ? "Evaluation" : null,
    flags.hasGuardrail ? "Guardrails" : null,
    flags.hasApproval ? "Human approval" : null,
  ].filter((label): label is string => label !== null);

  if (capabilities.length === 0) return null;
  return (
    <p className="text-xs leading-5 text-subtle">
      <span className="mr-2 font-medium text-muted">Includes</span>
      {capabilities.join(" · ")}
    </p>
  );
}

interface TemplateCardProps {
  template: WorkflowTemplate;
  creatingId: string | null;
  onUse: (template: WorkflowTemplate) => void;
}

function TemplateCard({ template, creatingId, onUse }: TemplateCardProps) {
  return (
    <Card className="flex h-full flex-col gap-4 p-5 transition-colors hover:border-border-strong">
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-6 text-foreground">{template.name}</h2>
        <p className="line-clamp-3 text-sm leading-6 text-muted">{template.description}</p>
      </div>
      <TemplateCapabilities template={template} />
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-mid pt-3.5">
        <TemplateMeta template={template} />
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => onUse(template)}
          disabled={creatingId !== null}
        >
          {creatingId === template.id ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Use template
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function PublishTemplateDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [publishing, setPublishing] = useState(false);

  const {
    data: workflows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.workflows,
    queryFn: api.listWorkflows,
    enabled: open,
  });

  // Prefill the template name from the chosen workflow when name is untouched.
  const selected = workflows.find((w) => w.id === workflowId);

  const reset = () => {
    setWorkflowId("");
    setName("");
    setDescription("");
  };

  const handlePublish = async () => {
    if (!workflowId) {
      toast.error("Choose a workflow to publish");
      return;
    }
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setPublishing(true);
    try {
      const created = await api.createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        workflow_id: workflowId,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      toast.success(`Published "${created.name}" as a template`);
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish template");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" />
        Publish a template
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish a template</DialogTitle>
          <DialogDescription>
            Share a workflow as a reusable starting point.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="publish-workflow" className="text-micro">
              Workflow
            </Label>
            {isLoading ? (
              <div className="skeleton h-9 w-full rounded-md" />
            ) : isError ? (
              <p className="text-xs text-destructive">Could not load workflows.</p>
            ) : workflows.length === 0 ? (
              <p className="text-xs text-muted">
                Create a workflow before publishing your first template.
              </p>
            ) : (
              <Select
                value={workflowId || undefined}
                onValueChange={(id) => {
                  setWorkflowId(id);
                  const wf = workflows.find((w) => w.id === id);
                  if (wf && !name.trim()) setName(wf.name);
                }}
              >
                <SelectTrigger id="publish-workflow" className="w-full">
                  <SelectValue placeholder="Select a workflow…" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      {wf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-name" className="text-micro">
              Template name
            </Label>
            <Input
              id="publish-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={selected?.name ?? "Support triage starter"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-description" className="text-micro">
              Description
            </Label>
            <Input
              id="publish-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this template is for (optional)"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handlePublish}
            disabled={publishing || !workflowId || !name.trim()}
          >
            {publishing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Publishing…
              </>
            ) : (
              "Publish template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("all");

  // Honour an inbound ?filter= from cross-page CTAs (e.g. the guardrails banner).
  // Read from window after mount (not useSearchParams) so the route stays
  // statically renderable and there's no hydration mismatch.
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get("filter");
    if (incoming && FILTER_IDS.has(incoming as TemplateFilter)) {
      setFilter(incoming as TemplateFilter);
    }
  }, []);

  const {
    data: templates = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.listTemplates,
  });

  const searchMatchedTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (!query) return true;
      return (
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.id.toLowerCase().includes(query)
      );
    });
  }, [templates, search]);

  const categoryCounts = useMemo(
    () => ({
      all: searchMatchedTemplates.length,
      eval: searchMatchedTemplates.filter((template) => templateFlags(template).hasEval).length,
      guardrail: searchMatchedTemplates.filter((template) => templateFlags(template).hasGuardrail).length,
      approval: searchMatchedTemplates.filter((template) => templateFlags(template).hasApproval).length,
    }),
    [searchMatchedTemplates]
  );

  const filteredTemplates = useMemo(() => {
    if (filter === "all") return searchMatchedTemplates;
    return searchMatchedTemplates.filter((template) => {
      const flags = templateFlags(template);
      if (filter === "eval") return flags.hasEval;
      if (filter === "guardrail") return flags.hasGuardrail;
      return flags.hasApproval;
    });
  }, [searchMatchedTemplates, filter]);

  const hasActiveFilters = filter !== "all" || search.trim() !== "";
  const templateCount =
    filteredTemplates.length === templates.length
      ? pluralize(templates.length, "template")
      : filteredTemplates.length + " of " + pluralize(templates.length, "template");

  const handleUseTemplate = async (template: WorkflowTemplate) => {
    if (creatingId) return;
    setCreatingId(template.id);
    try {
      // P7d: create from the listed graph first so a failed create can't
      // increment usage_count; count only after the workflow exists.
      const workflow = await api.createWorkflow({
        name: template.name,
        description: template.description,
        graph_json: template.graph_json,
      });
      // Best-effort: counting failure must not block navigation or the toast.
      void api.useTemplate(template.id).catch(() => undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows }),
        queryClient.invalidateQueries({ queryKey: queryKeys.observabilitySummary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
      ]);
      toast.success(`Created workflow from "${template.name}"`);
      router.push(`/workflows/${workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create workflow");
    } finally {
      setCreatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="space-y-2">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-4 w-96 max-w-full" />
        </div>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="skeleton h-9 w-full max-w-md rounded-md" />
            <div className="skeleton h-4 w-24" />
          </div>
          <div className="flex flex-col gap-2 border-t border-border-mid pt-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="skeleton h-4 w-32" />
            <div className="flex flex-wrap gap-2">
              <div className="skeleton h-8 w-16 rounded-md" />
              <div className="skeleton h-8 w-28 rounded-md" />
              <div className="skeleton h-8 w-28 rounded-md" />
              <div className="skeleton h-8 w-32 rounded-md" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="surface-card flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-5"
            >
              <div className="skeleton h-5 w-2/3" />
              <div className="space-y-2">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-4/5" />
              </div>
              <div className="skeleton h-4 w-44" />
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-mid pt-3.5">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-8 w-28 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-container">
        <ApiConnectionState
          description="Templates could not be loaded from the backend. Check the API target, then retry."
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Templates"
        description="Find a starting point by name, description, ID, or capability."
        actions={<PublishTemplateDialog />}
      />

      <section className="space-y-4" aria-label="Search and filter templates">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="template-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, description, or ID"
              aria-label="Search templates by name, description, or ID"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted tabular-nums" role="status" aria-live="polite">
            {templateCount}
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-border-mid pt-4 sm:flex-row sm:items-center sm:gap-5">
          <p className="shrink-0 text-xs font-medium text-subtle">Browse by capability</p>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter templates by capability"
          >
            {FILTER_OPTIONS.map((option) => (
              <FilterChip
                key={option.id}
                label={option.label + " · " + categoryCounts[option.id]}
                active={filter === option.id}
                onClick={() => setFilter(option.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {filteredTemplates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title={hasActiveFilters ? "No matching templates" : "No templates yet"}
          description={
            hasActiveFilters
              ? "Try another search or choose a different category."
              : "Published workflows will appear here as reusable starting points."
          }
          action={
            hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              creatingId={creatingId}
              onUse={handleUseTemplate}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
