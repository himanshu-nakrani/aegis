"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { WorkflowGraph } from "@/types/workflow";

const defaultGraph: WorkflowGraph = {
  nodes: [
    {
      id: "node_1",
      type: "baseNode",
      position: { x: 100, y: 120 },
      data: {
        label: "LLM Agent",
        nodeType: "agent",
        instruction: "You are a helpful AI assistant. Respond clearly and concisely.",
      },
    },
    {
      id: "node_2",
      type: "baseNode",
      position: { x: 380, y: 120 },
      data: {
        label: "Evaluation",
        nodeType: "evaluation",
        criteria: "faithfulness and helpfulness",
      },
    },
  ],
  edges: [{ id: "e1-2", source: "node_1", target: "node_2" }],
};

export default function NewWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState("My Agent Workflow");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const workflow = await api.createWorkflow({
        name,
        description,
        graph_json: defaultGraph,
      });
      router.push(`/workflows/${workflow.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>Create Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <Button onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? "Creating..." : "Create & Open Canvas"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}