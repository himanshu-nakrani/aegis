"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentType, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LayoutTemplate, Search, Shield, Sparkles, UserCheck } from "lucide-react";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { HoverLift } from "@/components/motion";
import { pluralize } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowGraph, WorkflowTemplate } from "@/types/workflow";

type TemplateFilter = "all" | "eval" | "guardrail" | "approval";

const FILTER_OPTIONS: Array<{ id: TemplateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "eval", label: "Evaluation" },
  { id: "guardrail", label: "Guardrails" },
  { id: "approval", label: "Human approval" },
];

function templateFlags(template: WorkflowTemplate) {
  const nodes = template.graph_json.nodes;
  return {
    hasEval: nodes.some((n) => n.data.nodeType === "evaluation"),
    hasGuardrail: nodes.some((n) => n.data.nodeType === "guardrail"),
    hasApproval: nodes.some((n) => n.data.nodeType === "human_approval"),
  };
}

function TemplateSignal({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-micro">{label}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-caption">{detail}</p>
        </div>
        <span className="rounded-lg border border-border bg-surface-input p-2 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </GlassCard>
  );
}

const NODE_COLOR: Record<string, string> = {
  trigger: "bg-cat-trigger",
  llm: "bg-cat-llm",
  logic: "bg-cat-logic",
  data: "bg-cat-data",
  integration: "bg-cat-integration",
  quality: "bg-cat-quality",
  evaluation: "bg-cat-quality",
  guardrail: "bg-cat-quality",
  human_approval: "bg-warning",
};

function previewLayout(graph: WorkflowGraph) {
  const nodes = graph.nodes.slice(0, 7);
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);

  return nodes.map((node, index) => {
    const fallbackX = nodes.length <= 1 ? 50 : 14 + (index / (nodes.length - 1)) * 72;
    const x = xRange > 1 ? 12 + ((node.position.x - minX) / xRange) * 76 : fallbackX;
    const y = yRange > 1 ? 18 + ((node.position.y - minY) / yRange) * 58 : 24 + (index % 3) * 22;
    return {
      ...node,
      x: Math.min(82, Math.max(8, x)),
      y: Math.min(74, Math.max(12, y)),
    };
  });
}

function TemplatePreview({ template }: { template: WorkflowTemplate }) {
  const nodes = previewLayout(template.graph_json);
  const edgeCount = template.graph_json.edges.length;
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = template.graph_json.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .slice(0, 8);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="border-b border-border bg-surface-input/70 p-4">
      <div className="relative h-36 overflow-hidden rounded-lg border border-border bg-bg">
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          {visibleEdges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={edge.id}
                x1={`${source.x}%`}
                y1={`${source.y}%`}
                x2={`${target.x}%`}
                y2={`${target.y}%`}
                className="stroke-border-strong"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeDasharray={edge.label ? "3 4" : undefined}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0">
          {nodes.map((node, index) => {
            const color = NODE_COLOR[node.data.nodeType] ?? "bg-primary";
            return (
              <div
                key={node.id}
                className="absolute flex max-w-[112px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 shadow-elev-1"
                style={{ left: `${node.x}%`, top: `${node.y}%`, zIndex: 10 + index }}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
                <span className="truncate text-[10px] font-medium text-foreground">
                  {node.data.label || node.data.nodeType}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-caption">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          {pluralize(template.graph_json.nodes.length, "node")}
        </span>
        <span>{pluralize(edgeCount, "edge")}</span>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("all");

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

  const templateStats = useMemo(() => {
    return templates.reduce(
      (acc, template) => {
        const flags = templateFlags(template);
        acc.nodes += template.graph_json.nodes.length;
        if (flags.hasEval) acc.eval += 1;
        if (flags.hasGuardrail) acc.guardrail += 1;
        if (flags.hasApproval) acc.approval += 1;
        return acc;
      },
      { nodes: 0, eval: 0, guardrail: 0, approval: 0 }
    );
  }, [templates]);

  const handleUseTemplate = async (template: WorkflowTemplate) => {
    setCreatingId(template.id);
    try {
      const workflow = await api.createWorkflow({
        name: template.name,
        description: template.description,
        graph_json: template.graph_json,
      });
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
      <div className="page-container space-y-10">
        <div className="space-y-3">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel space-y-4 p-5">
              <div className="flex items-start gap-3">
                <div className="skeleton h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-3/4" />
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-5/6" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-5 w-16 rounded-full" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
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
    <div className="page-container space-y-6">
      <PageHeader
        title="Templates"
        description="Production-ready workflow patterns for evaluation, guardrails, approval, and integrations."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Workflows
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <TemplateSignal
          icon={LayoutTemplate}
          label="Library"
          value={String(templates.length)}
          detail="Ready-to-clone templates"
        />
        <TemplateSignal
          icon={Sparkles}
          label="Evaluation"
          value={String(templateStats.eval)}
          detail="Quality-scored patterns"
        />
        <TemplateSignal
          icon={Shield}
          label="Guardrails"
          value={String(templateStats.guardrail)}
          detail="Policy-aware flows"
        />
        <TemplateSignal
          icon={UserCheck}
          label="Approvals"
          value={String(templateStats.approval)}
          detail="Human review stages"
        />
      </div>

      <div className="dashboard-panel flex flex-col gap-4 rounded-lg p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input
            id="template-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="pl-9"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-1">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter templates">
            {FILTER_OPTIONS.map((option) => {
              const count =
                option.id === "all"
                  ? templates.length
                  : option.id === "eval"
                    ? templateStats.eval
                    : option.id === "guardrail"
                      ? templateStats.guardrail
                      : templateStats.approval;
              return (
                <FilterChip
                  key={option.id}
                  label={`${option.label} ${count}`}
                  active={filter === option.id}
                  onClick={() => setFilter(option.id)}
                />
              );
            })}
          </div>
          <p className="text-caption">
            Showing {filteredTemplates.length} of {templates.length}
          </p>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <GlassCard className="p-0">
          <EmptyState
            icon={LayoutTemplate}
            title="No templates found"
            description="Try a different search term or filter."
            action={
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
            }
          />
        </GlassCard>
      ) : (
        <div className="section-block grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "60ms" }}>
          {filteredTemplates.map((template, index) => {
            const flags = templateFlags(template);

            return (
              <HoverLift key={template.id} className="stagger-item h-full" style={{ animationDelay: `${index * 60}ms` }}>
                <GlassCard className="flex h-full flex-col overflow-hidden transition-colors duration-fast hover:border-border-strong hover:bg-surface-hover">
                  <TemplatePreview template={template} />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold leading-5 text-foreground">{template.name}</h2>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{template.description}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {template.graph_json.nodes.length} nodes
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-caption">
                      {flags.hasEval && (
                        <Badge variant="primary">
                          <Sparkles className="mr-1 h-3 w-3" />
                          Eval
                        </Badge>
                      )}
                      {flags.hasGuardrail && (
                        <Badge variant="success">
                          <Shield className="mr-1 h-3 w-3" />
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
                    <Button
                      className="mt-4 w-full"
                      onClick={() => handleUseTemplate(template)}
                      disabled={creatingId === template.id}
                    >
                      {creatingId === template.id ? "Creating..." : "Use template"}
                    </Button>
                  </div>
                </GlassCard>
              </HoverLift>
            );
          })}
        </div>
      )}
    </div>
  );
}
