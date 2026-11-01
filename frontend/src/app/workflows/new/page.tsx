"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Page } from "@/components/layout/Page";
import {
  Bot,
  Plus,
  CheckCircle2,
  Route,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { GraphPreview, previewEdges, previewLayout } from "@/components/ui/graph-preview";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { readWorkflowExportFile, WorkflowImportError } from "@/lib/workflow-import";
import type { WorkflowGraph } from "@/types/workflow";
import {
  DescribeWorkflowCard,
  GeneratedNotes,
  type GeneratedWorkflow,
} from "./DescribeWorkflowCard";

const starterGraphs = [
  {
  id: "blank",
  name: "Blank canvas",
  description: "A trigger and end step, ready to customize.",
    icon: Plus,
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "baseNode",
          position: { x: 40, y: 120 },
          data: { label: "Trigger", nodeType: "trigger", triggerType: "manual" },
        },
        {
          id: "end",
          type: "baseNode",
          position: { x: 320, y: 120 },
          data: { label: "End", nodeType: "end" },
        },
      ],
      edges: [{ id: "e1", source: "trigger", target: "end" }],
    } satisfies WorkflowGraph,
  },
  {
    id: "agent",
    name: "Agent draft",
    description: "A simple input-to-agent flow.",
    icon: Bot,
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "baseNode",
          position: { x: 40, y: 120 },
          data: { label: "Trigger", nodeType: "trigger", triggerType: "manual" },
        },
        {
          id: "input_schema",
          type: "baseNode",
          position: { x: 320, y: 120 },
          data: {
            label: "Input Schema",
            nodeType: "input_schema",
            inputFields: [
              { key: "message", type: "string", required: true },
              { key: "priority", type: "string", default: "normal" },
            ],
          },
        },
        {
          id: "agent",
          type: "baseNode",
          position: { x: 600, y: 120 },
          data: {
            label: "LLM Agent",
            nodeType: "agent",
            instruction: "Use {{input.message}} and return a concise, grounded response.",
          },
        },
        {
          id: "end",
          type: "baseNode",
          position: { x: 880, y: 120 },
          data: { label: "End", nodeType: "end" },
        },
      ],
      edges: [
        { id: "e-trigger-input", source: "trigger", target: "input_schema" },
        { id: "e-input-agent", source: "input_schema", target: "agent" },
        { id: "e-agent-end", source: "agent", target: "end" },
      ],
    } satisfies WorkflowGraph,
  },
  {
    id: "triage",
    name: "Support triage",
    description: "Route customer messages before drafting a response.",
    icon: Route,
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "baseNode",
          position: { x: 40, y: 160 },
          data: { label: "Intake", nodeType: "trigger", triggerType: "manual" },
        },
        {
          id: "classifier",
          type: "baseNode",
          position: { x: 320, y: 160 },
          data: {
            label: "Classify request",
            nodeType: "classifier",
            categories: ["billing", "technical", "refund"],
          },
        },
        {
          id: "agent",
          type: "baseNode",
          position: { x: 600, y: 160 },
          data: {
            label: "Draft reply",
            nodeType: "agent",
            instruction: "Respond according to the classified support category.",
          },
        },
        {
          id: "end",
          type: "baseNode",
          position: { x: 880, y: 160 },
          data: { label: "End", nodeType: "end" },
        },
      ],
      edges: [
        { id: "e-trigger-classifier", source: "trigger", target: "classifier" },
        { id: "e-classifier-agent", source: "classifier", target: "agent" },
        { id: "e-agent-end", source: "agent", target: "end" },
      ],
    } satisfies WorkflowGraph,
  },
  {
    id: "quality",
    name: "Quality gated",
    description: "Add a safety check and an evaluation step.",
    icon: ShieldCheck,
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "baseNode",
          position: { x: 40, y: 140 },
          data: { label: "Trigger", nodeType: "trigger", triggerType: "manual" },
        },
        {
          id: "agent",
          type: "baseNode",
          position: { x: 320, y: 140 },
          data: {
            label: "Agent",
            nodeType: "agent",
            instruction: "Produce a policy-grounded answer with concise reasoning.",
          },
        },
        {
          id: "guardrail",
          type: "baseNode",
          position: { x: 600, y: 60 },
          data: {
            label: "Safety check",
            nodeType: "guardrail",
            rules: { guardrail_type: "rules", blocked_keywords: ["secret"], fail_behavior: "block" },
          },
        },
        {
          id: "eval",
          type: "baseNode",
          position: { x: 600, y: 220 },
          data: {
            label: "Evaluate quality",
            nodeType: "evaluation",
            evalType: "llm",
            evalThreshold: 0.8,
            criteria: "Accurate, helpful, and grounded.",
          },
        },
        {
          id: "end",
          type: "baseNode",
          position: { x: 880, y: 140 },
          data: { label: "End", nodeType: "end" },
        },
      ],
      edges: [
        { id: "e-trigger-agent", source: "trigger", target: "agent" },
        { id: "e-agent-guardrail", source: "agent", target: "guardrail" },
        { id: "e-guardrail-eval", source: "guardrail", target: "eval" },
        { id: "e-eval-end", source: "eval", target: "end" },
      ],
    } satisfies WorkflowGraph,
  },
] as const;

type StarterId = (typeof starterGraphs)[number]["id"] | "describe";

const describeShape = {
  id: "describe" as const,
  name: "Describe it",
  description: "Turn a short brief into an editable graph.",
  icon: Sparkles,
};


export default function NewWorkflowPage({
  searchParams,
}: {
  searchParams: { starter?: string };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [starterId, setStarterId] = useState<StarterId>(() =>
    searchParams.starter === "describe" ||
    starterGraphs.some((starter) => starter.id === searchParams.starter)
      ? (searchParams.starter as StarterId)
      : "agent"
  );
  const [generated, setGenerated] = useState<GeneratedWorkflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const describing = starterId === "describe";
  const selectedStarter =
    starterGraphs.find((starter) => starter.id === starterId) ??
    starterGraphs.find((starter) => starter.id === "agent")!;
  // When describing, the graph comes from the generator; otherwise the starter.
  const activeGraph = describing ? generated?.graph ?? null : selectedStarter.graph;

  const handleCreate = async () => {
    if (!activeGraph) return;
    setLoading(true);
    try {
      const workflow = await api.createWorkflow({
        name,
        description,
        graph_json: activeGraph,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows }),
        queryClient.invalidateQueries({ queryKey: queryKeys.observabilitySummary }),
      ]);
      router.push(`/workflows/${workflow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create workflow");
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const payload = await readWorkflowExportFile(file);
      const workflow = await api.importWorkflow({
        format: payload.format,
        name: payload.name ?? name,
        description: payload.description ?? description,
        graph_json: payload.graph_json,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows }),
        queryClient.invalidateQueries({ queryKey: queryKeys.observabilitySummary }),
      ]);
      toast.success(`Imported "${workflow.name}"`);
      router.push(`/workflows/${workflow.id}`);
    } catch (error) {
      const message =
        error instanceof WorkflowImportError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Import failed";
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const starterNodes = activeGraph ? previewLayout(activeGraph, Number.POSITIVE_INFINITY) : [];
  const starterEdges = activeGraph
    ? previewEdges(activeGraph, starterNodes, Number.POSITIVE_INFINITY)
    : [];

  return (
    <Page>
      <PageHeader
        title="Create a workflow"
        description="Start with a blank canvas, a template, or a short brief."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <SectionCard
          title="Workflow setup"
          className="overflow-hidden"
          bodyClassName="space-y-5 p-4 sm:p-5"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workflow name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Support triage"
              />
            </div>

            {!describing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="description">Description</Label>
                  <span className="text-xs text-subtle">Optional</span>
                </div>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A short summary of what this workflow does"
                  className="min-h-20"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-medium text-foreground">Starting point</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...starterGraphs, describeShape].map((starter) => {
                const Icon = starter.icon;
                const selected = starter.id === starterId;
                return (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => setStarterId(starter.id)}
                    aria-pressed={selected}
                    aria-label={"Use " + starter.name + " starter"}
                    className={cn(
                      "focus-ring group flex min-h-[84px] items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-1",
                      selected
                        ? "border-primary/40 bg-primary-muted/50"
                        : "border-border bg-surface-input hover:border-border-strong hover:bg-surface-hover"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                        selected
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground">{starter.name}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-4 text-muted">
                        {starter.description}
                      </span>
                    </span>
                    {selected && (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {describing && (
            <div className="border-t border-border pt-5">
              <DescribeWorkflowCard
                description={description}
                onDescriptionChange={setDescription}
                result={generated}
                onResult={setGenerated}
                busy={loading || importing}
                onError={(message) => toast.error(message)}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImportClick}
                disabled={loading || importing}
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "Importing…" : "Import JSON"}
              </Button>
            </div>
            <Button
              onClick={handleCreate}
              disabled={loading || importing || !name.trim() || !activeGraph}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              {loading ? "Creating…" : "Create workflow"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Graph preview"
          className="overflow-hidden"
          bodyClassName="p-4 sm:p-5"
        >
          {activeGraph ? (
            <>
              <GraphPreview nodes={starterNodes} edges={starterEdges} size="lg" />
              {describing && generated && <GeneratedNotes notes={generated.notes} />}
            </>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-bg p-6 text-center sm:min-h-[320px]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-input text-muted">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">Your graph will appear here</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
                Generate a draft to see the first version.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </Page>
  );
}
