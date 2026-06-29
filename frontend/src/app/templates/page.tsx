"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { WorkflowTemplate } from "@/types/workflow";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Templates</h1>
          <p className="text-slate-400">
            Start from a pre-built workflow with evaluation and guardrails
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading templates...</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const nodeCount = template.graph_json.nodes.length;
            const hasEval = template.graph_json.nodes.some((n) => n.data.nodeType === "evaluation");
            const hasGuardrail = template.graph_json.nodes.some(
              (n) => n.data.nodeType === "guardrail"
            );

            return (
              <Card key={template.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="h-5 w-5 text-sky-400" />
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                  </div>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-4">
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span>{nodeCount} nodes</span>
                    {hasEval && <span>· Evaluation</span>}
                    {hasGuardrail && <span>· Guardrails</span>}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleUseTemplate(template)}
                    disabled={creatingId === template.id}
                  >
                    {creatingId === template.id ? "Creating..." : "Use Template"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}