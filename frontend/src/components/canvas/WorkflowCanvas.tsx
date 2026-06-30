"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Maximize2,
  Play,
  Save,
  Settings2,
  Shield,
  Square,
  Trash2,
  Upload,
  PanelLeft,
  PanelRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BaseNode } from "@/components/canvas/nodes/BaseNode";
import { CanvasSidebar } from "@/components/canvas/CanvasSidebar";
import { EdgeInspector } from "@/components/canvas/EdgeInspector";
import { DRAG_TYPE } from "@/components/canvas/NodePalette";
const NodeInspector = dynamic(
  () => import("@/components/canvas/NodeInspector").then((mod) => mod.NodeInspector),
  { ssr: false }
);
import { RunResultsPanel } from "@/components/results/RunResultsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { readWorkflowExportFile, WorkflowImportError } from "@/lib/workflow-import";
import type { NodeData, WorkflowGraph, WorkflowRun, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";

const nodeTypes = { baseNode: BaseNode };

const MINIMAP_NODE_COLORS: Record<string, string> = {
  trigger: "#22c55e",
  end: "#ef4444",
  input_schema: "#22c55e",
  if: "#6366f1",
  switch: "#6366f1",
  filter: "#71717a",
  set_fields: "#f59e0b",
  agent: "#6366f1",
  tool: "#8b5cf6",
  evaluation: "#f59e0b",
  guardrail: "#22c55e",
  router: "#6366f1",
  classifier: "#8b5cf6",
  join: "#71717a",
  summarizer: "#f59e0b",
  translator: "#8b5cf6",
  extractor: "#22c55e",
  transform: "#6366f1",
  json_parse: "#22c55e",
  delay: "#71717a",
  note: "#a1a1aa",
};

function minimapNodeColor(node: Node): string {
  const nodeType = (node.data as NodeData)?.nodeType;
  return MINIMAP_NODE_COLORS[nodeType ?? "agent"] ?? "#64748b";
}

function nextNodeId(existingNodes: Node[]): string {
  let max = 0;
  for (const node of existingNodes) {
    const match = /^node_(\d+)$/.exec(node.id);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `node_${max + 1}`;
}

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
      label: typeof edge.label === "string" ? edge.label : undefined,
      data: edge.data as { route?: string } | undefined,
    })),
  };
}

function graphToNodes(graph: WorkflowGraph): Node[] {
  return (graph.nodes || []).map((node) => ({
    id: node.id,
    type: "baseNode",
    position: node.position,
    data: node.data as NodeData,
  }));
}

function graphToEdges(graph: WorkflowGraph): Edge[] {
  return (graph.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: edge.label,
    data: edge.data,
    labelStyle: { fill: "#8b95a8", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "#12161f", fillOpacity: 0.95 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 4,
  }));
}

interface WorkflowCanvasProps {
  workflowId: string;
  workflowName: string;
  initialGraph: WorkflowGraph;
  versionId?: string;
}

function WorkflowCanvasInner({
  workflowId,
  workflowName,
  initialGraph,
  versionId,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition, fitView, deleteElements } = useReactFlow();

  const initialNodes = useMemo<Node[]>(() => graphToNodes(initialGraph), [initialGraph]);
  const initialEdges = useMemo<Edge[]>(() => graphToEdges(initialGraph), [initialGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "data" | "quality" | "versions" | "compare">("nodes");
  const [rightTab, setRightTab] = useState<"configure" | "results">("configure");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("What is 15 * 7?");
  const [currentVersionId, setCurrentVersionId] = useState(versionId);
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [liveEvents, setLiveEvents] = useState<Array<Record<string, unknown>>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const lastSavedGraphRef = useRef(JSON.stringify(toGraph(initialNodes, initialEdges)));

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedData = selectedNode ? (selectedNode.data as NodeData) : null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const failedGuardrailIds = useMemo(() => {
    const ids = (run?.metrics_json?.failed_guardrails as string[] | undefined) || [];
    return new Set(ids);
  }, [run?.metrics_json]);

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const failed =
          failedGuardrailIds.has(edge.source) || failedGuardrailIds.has(edge.target);
        const isActive =
          isRunning &&
          (edge.source === activeNodeId || edge.target === activeNodeId);
        return {
          ...edge,
          type: "smoothstep",
          animated: isActive,
          style: failed
            ? { stroke: "var(--canvas-edge-failed)", strokeWidth: 2 }
            : isActive
              ? { stroke: "var(--canvas-edge-active)", strokeWidth: 2 }
              : { stroke: "var(--canvas-edge)", strokeWidth: 1.5 },
          labelStyle: { fill: "var(--muted)", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.95 },
        };
      }),
    [edges, failedGuardrailIds, isRunning, activeNodeId]
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...(node.data as NodeData),
          isActive: node.id === activeNodeId,
          hasError: failedGuardrailIds.has(node.id),
        },
      })),
    [nodes, activeNodeId, failedGuardrailIds]
  );

  const addNodeAtPosition = useCallback(
    (data: NodeData, position: { x: number; y: number }) => {
      let newId = "";
      setNodes((nds) => {
        newId = nextNodeId(nds);
        return [
          ...nds,
          {
            id: newId,
            type: "baseNode",
            position,
            data,
          },
        ];
      });
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
    },
    [setNodes]
  );

  const handleAddNode = useCallback(
    (data: NodeData) => {
      let newId = "";
      setNodes((nds) => {
        newId = nextNodeId(nds);
        const ordinal = Number.parseInt(newId.replace("node_", ""), 10);
        return [
          ...nds,
          {
            id: newId,
            type: "baseNode",
            position: { x: 120 + ordinal * 48, y: 120 + ordinal * 32 },
            data,
          },
        ];
      });
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
    },
    [setNodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const sourceData = sourceNode?.data as NodeData | undefined;
      let route: string | undefined;

      const branchKeys =
        sourceData?.nodeType === "router"
          ? sourceData.routes
          : sourceData?.nodeType === "classifier"
            ? sourceData.categories
            : sourceData?.nodeType === "if"
              ? ["true", "false"]
              : sourceData?.nodeType === "switch"
                ? [
                    ...(sourceData.switchCases || []),
                    sourceData.switchDefault || "default",
                  ]
                : undefined;

      if (branchKeys?.length) {
        const used = edges
          .filter((e) => e.source === connection.source)
          .map((e) => (e.data as { route?: string })?.route)
          .filter(Boolean);
        route = branchKeys.find((r) => !used.includes(r)) ?? branchKeys[0];
      }

      const newEdge: Edge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        type: "smoothstep",
        label: route,
        data: route ? { route } : undefined,
        labelStyle: { fill: "#94a3b8", fontSize: 11 },
        labelBgStyle: { fill: "#0f172a", fillOpacity: 0.9 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [nodes, edges, setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(DRAG_TYPE);
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as NodeData;
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNodeAtPosition(data, position);
      } catch {
        toast.error("Failed to add node");
      }
    },
    [screenToFlowPosition, addNodeAtPosition]
  );

  const handleNodeDataChange = useCallback(
    (nodeId: string, data: NodeData) => {
      setNodes((nds) => nds.map((node) => (node.id === nodeId ? { ...node, data } : node)));
    },
    [setNodes]
  );

  const handleEdgeChange = useCallback(
    (edgeId: string, updates: { route?: string; label?: string }) => {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                label: updates.label ?? updates.route ?? edge.label,
                data: { ...(edge.data as object), route: updates.route },
              }
            : edge
        )
      );
    },
    [setEdges]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
    },
    [setEdges]
  );

  const handleVersionSelect = useCallback(
    (version: WorkflowVersion) => {
      const graph = version.graph_json as WorkflowGraph;
      setNodes(graphToNodes(graph));
      setEdges(graphToEdges(graph));
      setCurrentVersionId(version.id);
      setCurrentVersionNumber(version.version_number);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      toast.info(`Loaded version ${version.version_number}`);
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    },
    [setNodes, setEdges, fitView]
  );

  const handleExport = useCallback(() => {
    const graph = toGraph(nodes, edges);
    const payload = {
      format: "aegis-workflow-v1",
      workflow_id: workflowId,
      name: workflowName,
      version_number: currentVersionNumber,
      graph_json: graph,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = workflowName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "workflow";
    anchor.href = url;
    anchor.download = `${safeName}-${workflowId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
  }, [nodes, edges, workflowId, workflowName, currentVersionNumber]);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
        const payload = await readWorkflowExportFile(file);
        const graph = payload.graph_json;
        setNodes(graphToNodes(graph));
        setEdges(graphToEdges(graph));
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setCurrentVersionId(undefined);
        lastSavedGraphRef.current = "";
        toast.success(
          payload.name
            ? `Imported "${payload.name}" — save to persist`
            : "Workflow imported — save to persist"
        );
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
      } catch (error) {
        const message =
          error instanceof WorkflowImportError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Import failed";
        toast.error(message);
      }
    },
    [setNodes, setEdges, fitView]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeId(selNodes[0]?.id ?? null);
      setSelectedEdgeId(selEdges[0]?.id ?? null);
      if (selNodes[0] || selEdges[0]) setRightTab("configure");
    },
    []
  );

  const handleSave = useCallback(
    async (saveAsNewVersion = false) => {
      setIsSaving(true);
      try {
        const graph = toGraph(nodes, edges);
        const version = await api.saveVersion(workflowId, {
          graph_json: graph,
          save_as_new_version: saveAsNewVersion,
        });
        setCurrentVersionId(version.id);
        setCurrentVersionNumber(version.version_number);
        lastSavedGraphRef.current = JSON.stringify(graph);
        toast.success(saveAsNewVersion ? "Saved as new version" : "Workflow saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save workflow");
      } finally {
        setIsSaving(false);
      }
    },
    [workflowId, nodes, edges]
  );

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setLiveEvents([]);
    setRun(null);
    setActiveNodeId(null);
    setRightTab("results");

    try {
      const graphKey = JSON.stringify(toGraph(nodes, edges));
      if (graphKey !== lastSavedGraphRef.current) {
        await handleSave(false);
      }

      if (!currentVersionId) {
        throw new Error("Save the workflow before running");
      }
      if (!inputText.trim()) {
        throw new Error("Enter input text before running");
      }

      const createdRun = await api.createRun({
        workflow_id: workflowId,
        version_id: currentVersionId,
        input_text: inputText.trim(),
      });
      setRun(createdRun);
      setCurrentRunId(createdRun.id);
      toast.info("Workflow started");

      const streamedNodeResults: WorkflowRun["node_results"] = [];

      const source = api.streamRun(createdRun.id, (event) => {
        setLiveEvents((prev) => [...prev.slice(-49), event]);

        if (event.type === "node_started") {
          setActiveNodeId(String(event.node_id));
        }
        if (event.type === "node_completed") {
          setActiveNodeId(null);
          streamedNodeResults.push({
            id: String(event.node_id),
            node_id: String(event.node_id),
            node_type: "unknown",
            node_label: String(event.node_label || event.node_id),
            status: "completed",
            output: (event.output as string | null | undefined) ?? null,
            evaluation_scores: (event.evaluation_scores as Record<string, unknown> | null) ?? null,
            guardrail_status: (event.guardrail_status as string | null) ?? null,
            latency_ms: (event.latency_ms as number | null) ?? null,
          });
        }
        if (event.type === "run_completed") {
          toast.success("Workflow completed");
          setRun({
            ...createdRun,
            status: "completed",
            final_output: (event.final_output as string | null) ?? createdRun.final_output,
            metrics_json: (event.metrics as Record<string, unknown> | null) ?? createdRun.metrics_json,
            node_results:
              (event.node_results as WorkflowRun["node_results"]) ?? streamedNodeResults,
          });
        }
        if (event.type === "run_failed") {
          toast.error(String(event.error || "Workflow failed"));
          setRun({
            ...createdRun,
            status: "failed",
            final_output: String(event.error || "Workflow failed"),
            node_results: streamedNodeResults,
          });
        }
        if (event.type === "run_cancelled") {
          toast.warning("Workflow cancelled");
          setRun({ ...createdRun, status: "cancelled", node_results: streamedNodeResults });
        }
        if (
          event.type === "run_completed" ||
          event.type === "run_failed" ||
          event.type === "run_cancelled" ||
          event.type === "stream_end"
        ) {
          setIsRunning(false);
          setActiveNodeId(null);
          source.close();
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start workflow");
      setIsRunning(false);
    }
  }, [workflowId, currentVersionId, inputText, nodes, edges, handleSave]);

  const handleStop = async () => {
    if (!currentRunId) return;
    try {
      await api.cancelRun(currentRunId);
      toast.warning("Stopping workflow...");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel run");
    }
  };

  const handleDeleteSelection = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      if (selectedNodeId) {
        deleteElements({ nodes: [{ id: selectedNodeId }] });
        setSelectedNodeId(null);
      } else if (selectedEdgeId) {
        handleDeleteEdge(selectedEdgeId);
      }
      return;
    }
    deleteElements({
      nodes: selectedNodes.map((n) => ({ id: n.id })),
      edges: selectedEdges.map((e) => ({ id: e.id })),
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [nodes, edges, selectedNodeId, selectedEdgeId, deleteElements, handleDeleteEdge]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave(false);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        handleDeleteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handleDeleteSelection]);

  const sourceNodeData = selectedEdge
    ? (nodes.find((n) => n.id === selectedEdge.source)?.data as NodeData | undefined)
    : undefined;

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur-md md:gap-3 md:px-4">
        <Link
          href="/"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
          title="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:hidden"
          onClick={() => setLeftSidebarOpen(true)}
          aria-label="Open workflow tools"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-primary sm:flex">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">{workflowName}</h1>
            <p className="text-xs text-muted">
              {nodes.length} nodes · {edges.length} edges
              {currentVersionNumber != null && ` · v${currentVersionNumber}`}
              {isRunning && (
                <span className="ml-2 inline-flex items-center gap-1 text-warning">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                  Running
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="mx-1 hidden h-6 w-px bg-border md:block" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden shrink-0 text-xs font-medium text-muted lg:inline">Input</span>
          <Input
            className="h-9"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Workflow input…"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={isSaving}
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{isSaving ? "Saving…" : "Save"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="hidden md:inline-flex"
          >
            New Version
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" size="sm" onClick={handleImportClick} title="Import workflow JSON">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} title="Export workflow JSON">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="h-4 w-4" />
              <span className="hidden sm:inline">Stop</span>
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={nodes.length === 0}>
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Run</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setRightSidebarOpen(true)}
            aria-label="Open configure panel"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <CanvasSidebar
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          onAddNode={handleAddNode}
          workflowId={workflowId}
          currentVersionId={currentVersionId}
          onSelectVersion={handleVersionSelect}
          mobileOpen={leftSidebarOpen}
          onMobileClose={() => setLeftSidebarOpen(false)}
        />

        <div ref={reactFlowWrapper} className="relative flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            snapToGrid
            snapGrid={[20, 20]}
            defaultEdgeOptions={{ type: "smoothstep" }}
            connectionLineStyle={{ stroke: "var(--canvas-connection)", strokeWidth: 2 }}
            onSelectionChange={handleSelectionChange}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="canvas-flow bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--canvas-grid)"
            />
            <Controls
              showInteractive={false}
              className="!rounded-xl !border-border !bg-surface-elevated/95 !shadow-xl"
            />
            <MiniMap
              nodeColor={minimapNodeColor}
              maskColor="rgba(6, 8, 13, 0.8)"
              className="!rounded-xl !border-border !bg-surface-elevated/90"
            />

            {nodes.length === 0 && (
              <Panel position="top-center" className="mt-24">
                <div className="panel border-dashed px-8 py-6 text-center">
                  <p className="text-sm font-medium text-foreground">Empty canvas</p>
                  <p className="mt-1 text-xs text-muted">
                    Add a Trigger and End node, then connect your agent steps between them
                  </p>
                </div>
              </Panel>
            )}

            <Panel position="bottom-left" className="!m-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-8 shadow-lg"
                onClick={() => fitView({ padding: 0.2, duration: 300 })}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 shadow-lg"
                onClick={handleDeleteSelection}
                disabled={!selectedNodeId && !selectedEdgeId}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </Panel>
          </ReactFlow>
        </div>

        {rightSidebarOpen && (
          <button
            type="button"
            aria-label="Close configure panel"
            className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={() => setRightSidebarOpen(false)}
          />
        )}
        <div
          className={cn(
            "flex w-[340px] shrink-0 flex-col border-l border-border bg-surface",
            "lg:relative lg:translate-x-0",
            rightSidebarOpen
              ? "fixed inset-y-0 right-0 z-40 shadow-2xl lg:shadow-none"
              : "hidden lg:flex"
          )}
        >
          <div className="flex items-center border-b border-border lg:hidden">
            <span className="flex-1 px-4 py-3 text-sm font-medium text-foreground">
              {rightTab === "configure" ? "Configure" : "Results"}
            </span>
            <button
              type="button"
              onClick={() => setRightSidebarOpen(false)}
              className="px-4 py-3 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setRightTab("configure")}
              className={cn("tab-trigger", rightTab === "configure" && "tab-trigger-active")}
            >
              <Settings2 className="h-4 w-4" />
              Configure
            </button>
            <button
              type="button"
              onClick={() => setRightTab("results")}
              className={cn("tab-trigger", rightTab === "results" && "tab-trigger-active")}
            >
              <Play className="h-4 w-4" />
              Results
              {isRunning && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === "configure" ? (
              <div className="space-y-4 p-4">
                {selectedEdge ? (
                  <EdgeInspector
                    edge={selectedEdge}
                    sourceLabel={(nodes.find((n) => n.id === selectedEdge.source)?.data as NodeData)?.label}
                    targetLabel={(nodes.find((n) => n.id === selectedEdge.target)?.data as NodeData)?.label}
                    routerRoutes={
                      sourceNodeData?.nodeType === "router"
                        ? sourceNodeData.routes
                        : sourceNodeData?.nodeType === "classifier"
                          ? sourceNodeData.categories
                          : sourceNodeData?.nodeType === "if"
                            ? ["true", "false"]
                            : sourceNodeData?.nodeType === "switch"
                              ? [
                                  ...(sourceNodeData.switchCases || []),
                                  sourceNodeData.switchDefault || "default",
                                ]
                              : undefined
                    }
                    onChange={handleEdgeChange}
                    onDelete={handleDeleteEdge}
                  />
                ) : (
                  <NodeInspector
                    nodeId={selectedNodeId}
                    data={selectedData}
                    workflowId={workflowId}
                    onChange={handleNodeDataChange}
                  />
                )}
              </div>
            ) : (
              <RunResultsPanel
                embedded
                run={run}
                liveEvents={liveEvents}
                isRunning={isRunning}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface/60 px-4 py-2 text-xs text-muted">
        <span className="hidden sm:inline">⌘S save · Delete remove selection · Drag nodes onto canvas</span>
        <span className="sm:hidden">Tap panels to configure & run</span>
        <span className={cn("font-medium", isRunning ? "text-warning" : "text-muted")}>
          {isRunning ? "Executing…" : "Ready"}
        </span>
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}