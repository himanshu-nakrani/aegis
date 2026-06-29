"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Save, Square } from "lucide-react";
import { toast } from "sonner";
import { BaseNode } from "@/components/canvas/nodes/BaseNode";
import { NodeInspector } from "@/components/canvas/NodeInspector";
import { NodePalette } from "@/components/canvas/NodePalette";
import { RunResultsPanel } from "@/components/results/RunResultsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { NodeData, WorkflowGraph, WorkflowRun } from "@/types/workflow";

const nodeTypes = { baseNode: BaseNode };

let nodeCounter = 0;

function toGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data as NodeData,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}

interface WorkflowCanvasProps {
  workflowId: string;
  workflowName: string;
  initialGraph: WorkflowGraph;
  versionId?: string;
}

export function WorkflowCanvas({
  workflowId,
  workflowName,
  initialGraph,
  versionId,
}: WorkflowCanvasProps) {
  const initialNodes = useMemo<Node[]>(
    () =>
      (initialGraph.nodes || []).map((node) => ({
        id: node.id,
        type: "baseNode",
        position: node.position,
        data: node.data as NodeData,
      })),
    [initialGraph]
  );
  const initialEdges = useMemo<Edge[]>(() => initialGraph.edges || [], [initialGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("What is 15 * 7?");
  const [currentVersionId, setCurrentVersionId] = useState(versionId);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [liveEvents, setLiveEvents] = useState<Array<Record<string, unknown>>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedData = selectedNode ? (selectedNode.data as NodeData) : null;

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const handleAddNode = useCallback(
    (data: NodeData) => {
      nodeCounter += 1;
      const id = `node_${nodeCounter}`;
      const newNode: Node = {
        id,
        type: "baseNode",
        position: { x: 120 + nodeCounter * 40, y: 120 + nodeCounter * 30 },
        data,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const handleNodeDataChange = useCallback(
    (nodeId: string, data: NodeData) => {
      setNodes((nds) => nds.map((node) => (node.id === nodeId ? { ...node, data } : node)));
    },
    [setNodes]
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...(node.data as NodeData),
          isActive: node.id === activeNodeId,
        },
      })),
    [nodes, activeNodeId]
  );

  const handleSave = async (saveAsNewVersion = false) => {
    setIsSaving(true);
    try {
      const version = await api.saveVersion(workflowId, {
        graph_json: toGraph(nodes, edges),
        save_as_new_version: saveAsNewVersion,
      });
      setCurrentVersionId(version.id);
      toast.success(saveAsNewVersion ? "Saved as new version" : "Workflow saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save workflow");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setLiveEvents([]);
    setRun(null);
    setActiveNodeId(null);

    try {
      await handleSave(false);
      const createdRun = await api.createRun({
        workflow_id: workflowId,
        version_id: currentVersionId,
        input_text: inputText,
      });
      setRun(createdRun);
      setCurrentRunId(createdRun.id);
      toast.info("Workflow started");

      const source = api.streamRun(createdRun.id, (event) => {
        setLiveEvents((prev) => [...prev, event]);

        if (event.type === "node_started") {
          setActiveNodeId(String(event.node_id));
        }
        if (event.type === "node_completed") {
          setActiveNodeId(null);
        }
        if (event.type === "run_completed") {
          toast.success("Workflow completed");
        }
        if (event.type === "run_failed") {
          toast.error(String(event.error || "Workflow failed"));
        }
        if (event.type === "run_cancelled") {
          toast.warning("Workflow cancelled");
        }
        if (
          event.type === "run_completed" ||
          event.type === "run_failed" ||
          event.type === "run_cancelled" ||
          event.type === "stream_end"
        ) {
          api.getRun(createdRun.id).then(setRun);
          setIsRunning(false);
          setActiveNodeId(null);
          source.close();
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start workflow");
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    if (!currentRunId) return;
    try {
      await api.cancelRun(currentRunId);
      toast.warning("Stopping workflow...");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel run");
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{workflowName}</h1>
          <p className="text-xs text-slate-400">Visual agent workflow canvas</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            className="w-72"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Workflow input..."
          />
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={isSaving}>
            <Save className="h-4 w-4" />
            Save
          </Button>
          <Button variant="outline" onClick={() => handleSave(true)} disabled={isSaving}>
            Save as New Version
          </Button>
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleRun} disabled={nodes.length === 0}>
              <Play className="h-4 w-4" />
              Run Workflow
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="p-4">
          <NodePalette onAddNode={handleAddNode} />
        </div>

        <div className="relative flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onSelectionChange={({ nodes: selected }) =>
              setSelectedNodeId(selected[0]?.id ?? null)
            }
            fitView
            className="bg-slate-950"
          >
            <Background gap={16} color="#1e293b" />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <NodeInspector
            nodeId={selectedNodeId}
            data={selectedData}
            onChange={handleNodeDataChange}
          />
        </div>

        <RunResultsPanel run={run} liveEvents={liveEvents} isRunning={isRunning} />
      </div>

      <div className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        Tip: connect nodes left-to-right. Evaluation and guardrail nodes work best after an agent node.
      </div>
    </div>
  );
}