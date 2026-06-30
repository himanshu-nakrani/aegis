"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LayoutTemplate, Search, Shield, Sparkles, UserCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { HoverLift } from "@/components/motion";
import { pluralize } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowTemplate } from "@/types/workflow";

type TemplateFilter = "all" | "eval" | "guardrail" | "approval";

const FILTER_OPTIONS: Array<{ id: TemplateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "eval", label: "Evaluation" },
  { id: "guardrail", label: "Guardrails" },
  { id: "approval", label: "Human approval" },
];

const GRADIENTS = [
  "from-primary-500 to-accent-500",
  "from-cat-llm to-cat-data",
  "from-cat-integration to-cat-quality",
  "from-cat-trigger to-cat-logic",
  "from-success to-cat-llm",
  "from-cat-data to-primary-500",
];

function gradientForName(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function templateFlags(template: WorkflowTemplate) {
  const nodes = template.graph_json.nodes;
  return {
    hasEval: nodes.some((n) => n.data.nodeType === "evaluation"),
    hasGuardrail: nodes.some((n) => n.data.nodeType === "guardrail"),
    hasApproval: nodes.some((n) => n.data.nodeType === "human_approval"),
  };
}

export default function TemplatesPage() {
  const router = useRouter();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("all");

  const { data: templates = [], isLoading: loading } = useQuery({
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
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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

  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Templates"
        description="Pre-built workflows with evaluation and guardrails — ready to customize on the canvas."
        back={
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter templates">
          {FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={filter === option.id}
              onClick={() => setFilter(option.id)}
            />
          ))}
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      ) : (
        <div className="section-block grid gap-5 md:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "60ms" }}>
          {filteredTemplates.map((template, index) => {
            const nodeCount = template.graph_json.nodes.length;
            const flags = templateFlags(template);

            return (
              <HoverLift key={template.id} className="stagger-item" style={{ animationDelay: `${index * 60}ms` }}>
                <GlassCard className="flex flex-col overflow-hidden">
                  <div
                    className={`relative h-32 bg-gradient-to-br ${gradientForName(template.name)}`}
                  />
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="text-body-lg font-semibold">{template.name}</h3>
                    <p className="text-caption mt-1 line-clamp-2">{template.description}</p>
                    <div className="text-caption mt-3 flex flex-wrap items-center gap-2">
                      <span>{pluralize(nodeCount, "node")}</span>
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
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => handleUseTemplate(template)}
                      disabled={creatingId === template.id}
                    >
                      {creatingId === template.id ? "Creating…" : "Use template"}
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