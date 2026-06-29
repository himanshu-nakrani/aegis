"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LayoutTemplate, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
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

  if (loading) {
    return <LoadingState label="Loading templates…" />;
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

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template, index) => {
          const nodeCount = template.graph_json.nodes.length;
          const hasEval = template.graph_json.nodes.some((n) => n.data.nodeType === "evaluation");
          const hasGuardrail = template.graph_json.nodes.some(
            (n) => n.data.nodeType === "guardrail"
          );

          return (
            <Card
              key={template.id}
              className="interactive-card flex flex-col"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-muted">
                    <LayoutTemplate className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="mt-1">{template.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mt-auto space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{nodeCount} nodes</Badge>
                  {hasEval && (
                    <Badge variant="accent">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Evaluation
                    </Badge>
                  )}
                  {hasGuardrail && (
                    <Badge variant="success">
                      <Shield className="mr-1 h-3 w-3" />
                      Guardrails
                    </Badge>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleUseTemplate(template)}
                  disabled={creatingId === template.id}
                >
                  {creatingId === template.id ? "Creating…" : "Use Template"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}