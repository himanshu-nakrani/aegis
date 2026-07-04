"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  FileJson,
  GitBranch,
  Layers3,
  Route,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { readWorkflowExportFile, WorkflowImportError } from "@/lib/workflow-import";
import type { WorkflowGraph } from "@/types/workflow";

const starterGraphs = [
  {
    id: "agent",
    name: "Agent draft",
    description: "A clean input-to-agent flow for fast prototyping.",
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
          position: { x: 240, y: 120 },
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
          position: { x: 480, y: 120 },
          data: {
            label: "LLM Agent",
            nodeType: "agent",
            instruction: "Use {{input.message}} and return a concise, grounded response.",
          },
        },
        {
          id: "end",
          type: "baseNode",
          position: { x: 740, y: 120 },
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
          position: { x: 260, y: 160 },
          data: {
            label: "Classify request",
            nodeType: "classifier",
            categories: ["billing", "technical", "refund"],
          },
        },
        {
          id: "agent",
          type: "baseNode",
          position: { x: 520, y: 160 },
          data: {
            label: "Draft reply",
            nodeType: "agent",
            instruction: "Respond according to the classified support category.",
          },
        },
        {
          id: "end",
          type: "baseNode",
          position: { x: 780, y: 160 },
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
    description: "Ship with eval scoring and a guardrail checkpoint from day one.",
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
          position: { x: 280, y: 140 },
          data: {
            label: "Agent",
            nodeType: "agent",
            instruction: "Produce a policy-grounded answer with concise reasoning.",
          },
        },
        {
          id: "guardrail",
          type: "baseNode",
          position: { x: 530, y: 80 },
          data: {
            label: "Safety check",
            nodeType: "guardrail",
            rules: { guardrail_type: "rules", blocked_keywords: ["secret"], fail_behavior: "block" },
          },
        },
        {
          id: "eval",
          type: "baseNode",
          position: { x: 530, y: 210 },
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
          position: { x: 800, y: 140 },
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

function pointForNode(graph: WorkflowGraph, nodeId: string) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const xs = graph.nodes.map((item) => item.position.x);
  const ys = graph.nodes.map((item) => item.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  return {
    x: 18 + ((node.position.x - minX) / spanX) * 64,
    y: graph.nodes.length <= 4 && spanY === 1
      ? 50
      : 24 + ((node.position.y - minY) / spanY) * 52,
  };
}

function StarterGraphPreview({ graph }: { graph: WorkflowGraph }) {
  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-lg border border-border bg-bg p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:min-h-[390px] sm:p-5">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_28%_18%,rgba(20,184,166,0.12),transparent_62%),radial-gradient(ellipse_45%_35%_at_80%_72%,rgba(59,130,246,0.09),transparent_62%)]" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {graph.edges.map((edge) => {
          const source = pointForNode(graph, edge.source);
          const target = pointForNode(graph, edge.target);
          if (!source || !target) return null;
          const sourceNode = graph.nodes.find((node) => node.id === edge.source);
          const color = sourceNode
            ? CATEGORY_COLOR_VAR[categorize(sourceNode.data.nodeType)]
            : "var(--canvas-edge)";
          const mid = Math.max(8, Math.abs(target.x - source.x) * 0.35);
          return (
            <path
              key={edge.id}
              d={`M ${source.x} ${source.y} C ${source.x + mid} ${source.y}, ${target.x - mid} ${target.y}, ${target.x} ${target.y}`}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeOpacity="0.62"
              strokeWidth="0.42"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div className="relative h-[286px] sm:h-[350px]">
        {graph.nodes.map((node) => {
          const point = pointForNode(graph, node.id);
          const catColor = CATEGORY_COLOR_VAR[categorize(node.data.nodeType)];
          return (
            <div
              key={node.id}
              className="absolute w-[112px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-surface-elevated/95 px-2 py-2 shadow-elev-1 backdrop-blur-md sm:w-[150px] sm:px-3"
              style={{
                left: `${point?.x ?? 50}%`,
                top: `${point?.y ?? 50}%`,
              }}
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: catColor }} aria-hidden />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground sm:text-sm">{node.data.label}</p>
                  <p className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] sm:text-[10px]" style={{ color: catColor }}>
                    {node.data.nodeType}
                  </p>
                </div>
                <span
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:flex"
                  style={{
                    background: `color-mix(in srgb, ${catColor} 14%, transparent)`,
                    color: catColor,
                  }}
                >
                  <Layers3 className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NewWorkflowPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("My Agent Workflow");
  const [description, setDescription] = useState("");
  const [starterId, setStarterId] = useState<(typeof starterGraphs)[number]["id"]>("agent");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const selectedStarter = starterGraphs.find((starter) => starter.id === starterId) ?? starterGraphs[0];

  const handleCreate = async () => {
    setLoading(true);
    try {
      const workflow = await api.createWorkflow({
        name,
        description,
        graph_json: selectedStarter.graph,
      });
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

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Create workflow"
        description="Launch with a usable graph, then tune routing, guardrails, integrations, and evals on the canvas."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(460px,1.1fr)]">
        <section className="dashboard-panel overflow-hidden rounded-lg">
          <div className="border-b border-border bg-surface-input/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary-muted text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Workflow className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">Workflow details</h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Name the workflow and choose the graph shape that best matches the job.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
              </div>
              <div className="space-y-2">
                <Label>Starter</Label>
                <div className="flex h-10 items-center rounded-lg border border-border bg-surface-input px-3 text-sm text-foreground">
                  {selectedStarter.name}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do? (optional)"
                className="min-h-20"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Choose a launch shape</Label>
                <Badge variant="outline">{selectedStarter.graph.nodes.length} nodes</Badge>
              </div>
              {starterGraphs.map((starter) => {
                const Icon = starter.icon;
                const selected = starter.id === starterId;
                return (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => setStarterId(starter.id)}
                    aria-pressed={selected}
                    aria-label={`Use ${starter.name} starter`}
                    className={cn(
                      "focus-ring group relative flex items-start gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-primary/40 bg-primary-muted text-foreground shadow-elev-1"
                        : "border-border bg-surface-input text-muted hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 w-1 opacity-0 transition-opacity",
                        selected && "opacity-100"
                      )}
                      style={{ background: selected ? "var(--primary)" : undefined }}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
                        selected ? "bg-primary text-primary-foreground" : "bg-surface text-muted group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{starter.name}</span>
                        {selected && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">{starter.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-border bg-surface-input/80 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-muted text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <FileJson className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Import instead</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Use an <code className="rounded bg-surface px-1 text-[11px]">aegis-workflow-v1</code> JSON export to restore a backup or shared graph.
                  </p>
                </div>
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
                  {importing ? "Importing…" : "Import"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs leading-5 text-muted">
                Creates a versioned workflow and opens the canvas immediately.
              </div>
              <Button onClick={handleCreate} disabled={loading || importing || !name.trim()} className="w-full sm:w-auto">
                <Sparkles className="h-4 w-4" />
                {loading ? "Creating…" : "Create & open canvas"}
              </Button>
            </div>
          </div>
        </section>

        <section className="dashboard-panel overflow-hidden rounded-lg">
          <div className="flex flex-col gap-3 border-b border-border bg-surface-input/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Starter graph</h2>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted">
                This is the graph that will be created when you open the canvas.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-micro">Nodes</p>
                <p className="mt-1 text-lg font-semibold leading-none text-foreground">{selectedStarter.graph.nodes.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-micro">Edges</p>
                <p className="mt-1 text-lg font-semibold leading-none text-foreground">{selectedStarter.graph.edges.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-micro">Mode</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Draft</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <StarterGraphPreview graph={selectedStarter.graph} />

            <div className="grid gap-2 text-sm text-muted sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface-input px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <p className="font-medium text-foreground">Versioned</p>
                <p className="mt-1 text-xs leading-5">Save creates the first audit snapshot.</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-input px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <p className="font-medium text-foreground">Editable</p>
                <p className="mt-1 text-xs leading-5">Every node opens in the canvas inspector.</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-input px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <p className="font-medium text-foreground">Production-ready</p>
                <p className="mt-1 text-xs leading-5">Add evals and guardrails before rollout.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
