"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Loader2, Search, Upload, UserCheck } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { HoverLift } from "@/components/motion";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { GraphPreview, previewEdges, previewLayout } from "@/components/ui/graph-preview";
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

/** Compact provenance and usage details shown beneath each template. */
function TemplateMeta({ template }: { template: WorkflowTemplate }) {
  const isBuiltin = template.builtin ?? !template.author;
  const source = isBuiltin || !template.author ? "Built-in" : "By " + template.author;
  const usage = template.usage_count ?? 0;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-mid pt-3 text-xs text-subtle">
      <span className="min-w-0 truncate">{source}</span>
      {usage > 0 && <span className="shrink-0 tabular-nums">{pluralize(usage, "use")}</span>}
    </div>
  );
}

function CapabilityBadges({ template }: { template: WorkflowTemplate }) {
  const flags = templateFlags(template);
  if (!flags.hasEval && !flags.hasGuardrail && !flags.hasApproval) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {flags.hasEval && (
        <Badge variant="outline">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-cat-quality" aria-hidden />
          Eval
        </Badge>
      )}
      {flags.hasGuardrail && (
        <Badge variant="outline">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-cat-quality" aria-hidden />
          Guardrails
        </Badge>
      )}
      {flags.hasApproval && (
        <Badge variant="outline">
          <UserCheck className="mr-1 h-3 w-3" />
          Approval
        </Badge>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: WorkflowTemplate;
  creatingId: string | null;
  onUse: (template: WorkflowTemplate) => void;
}

function TemplateCard({ template, creatingId, onUse }: TemplateCardProps) {
  const nodes = previewLayout(template.graph_json);
  const edges = previewEdges(template.graph_json, nodes);
  return (
    <HoverLift className="h-full">
      <Card className="flex h-full flex-col overflow-hidden transition-colors duration-1 hover:border-border-strong">
        <div className="border-b border-border-mid bg-surface-input p-3">
          <GraphPreview nodes={nodes} edges={edges} size="sm" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0 space-y-2">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold leading-5 text-foreground">{template.name}</h2>
              <p className="line-clamp-2 text-xs leading-5 text-muted">
                {template.description}
              </p>
            </div>
            <CapabilityBadges template={template} />
          </div>
          <TemplateMeta template={template} />
          <Button
            className="mt-auto w-full"
            onClick={() => onUse(template)}
            disabled={creatingId !== null}
          >
            {creatingId === template.id ? "Creating…" : "Use template"}
          </Button>
        </div>
      </Card>
    </HoverLift>
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

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      const flags = templateFlags(template);
      if (filter === "eval" && !flags.hasEval) return false;
      if (filter === "guardrail" && !flags.hasGuardrail) return false;
      if (filter === "approval" && !flags.hasApproval) return false;
      if (!query) return true;
      return (
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.id.toLowerCase().includes(query)
      );
    });
  }, [templates, search, filter]);

  const hasActiveFilters = filter !== "all" || search.trim() !== "";
  const templateCount =
    filteredTemplates.length === templates.length
      ? pluralize(templates.length, "template")
      : filteredTemplates.length + " of " + templates.length + " templates";

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="skeleton h-9 w-full max-w-md rounded-md" />
          <div className="flex flex-wrap gap-2">
            <div className="skeleton h-8 w-12 rounded-md" />
            <div className="skeleton h-8 w-24 rounded-md" />
            <div className="skeleton h-8 w-24 rounded-md" />
            <div className="skeleton h-8 w-28 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="surface-card space-y-4 rounded-lg border border-border bg-surface p-4"
            >
              <div className="skeleton h-36 w-full rounded-lg" />
              <div className="space-y-2">
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-4/5" />
              </div>
              <div className="skeleton h-6 w-24 rounded-md" />
              <div className="skeleton h-9 w-full rounded-lg" />
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
        description="Start with a workflow and make it your own."
        actions={<PublishTemplateDialog />}
      />

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
            placeholder="Search templates"
            aria-label="Search templates"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter templates">
            {FILTER_OPTIONS.map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                active={filter === option.id}
                onClick={() => setFilter(option.id)}
              />
            ))}
          </div>
          <p className="text-xs text-muted tabular-nums" role="status" aria-live="polite">
            {templateCount}
          </p>
        </div>
      </div>

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
