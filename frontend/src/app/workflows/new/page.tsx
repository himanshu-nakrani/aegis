"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, GitBranch, Upload, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { readWorkflowExportFile, WorkflowImportError } from "@/lib/workflow-import";
import type { WorkflowGraph } from "@/types/workflow";

const defaultGraph: WorkflowGraph = {
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
      position: { x: 220, y: 120 },
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
      id: "node_1",
      type: "baseNode",
      position: { x: 440, y: 120 },
      data: {
        label: "LLM Agent",
        nodeType: "agent",
        instruction: "Use {{input.message}} and return a concise, grounded response.",
      },
    },
    {
      id: "end",
      type: "baseNode",
      position: { x: 700, y: 120 },
      data: { label: "End", nodeType: "end" },
    },
  ],
  edges: [
    { id: "e-trigger-input", source: "trigger", target: "input_schema" },
    { id: "e-input-agent", source: "input_schema", target: "node_1" },
    { id: "e-agent-end", source: "node_1", target: "end" },
  ],
};

export default function NewWorkflowPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("My Agent Workflow");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const workflow = await api.createWorkflow({
        name,
        description,
        graph_json: defaultGraph,
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
    <div className="page-container space-y-6">
      <PageHeader
        title="Create workflow"
        description="Start from a minimal graph, then add routing, guardrails, integrations, and evals on the canvas."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_minmax(320px,1fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary-muted">
              <Workflow className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle as="h2">Workflow Details</CardTitle>
              <CardDescription>Name the workflow before opening the canvas.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do? (optional)"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={handleCreate} disabled={loading || importing || !name.trim()} className="w-full sm:w-auto">
              {loading ? "Creating…" : "Create & Open Canvas"}
            </Button>
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
              onClick={handleImportClick}
              disabled={loading || importing}
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {importing ? "Importing…" : "Import from JSON"}
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted">
            Import an <code className="text-xs">aegis-workflow-v1</code> export file to create a workflow from a backup or share.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            Starter graph
          </CardTitle>
          <CardDescription>Created automatically when you open the canvas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-border bg-bg p-4">
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            <div className="relative grid gap-3">
              {defaultGraph.nodes.map((node, index) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 shadow-elev-1"
                  style={{ marginLeft: `${Math.min(index, 2) * 22}px` }}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{node.data.label}</p>
                    <p className="text-caption">{node.data.nodeType}</p>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-primary" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 text-sm text-muted">
            <div className="rounded-lg border border-border bg-surface-input px-3 py-2">
              Structured input fields are included by default.
            </div>
            <div className="rounded-lg border border-border bg-surface-input px-3 py-2">
              Save creates the first version for audit history.
            </div>
            <div className="rounded-lg border border-border bg-surface-input px-3 py-2">
              Add eval and guardrail nodes before production runs.
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
