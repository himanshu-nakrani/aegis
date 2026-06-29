"use client";

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
import {
  Maximize2,
  Play,
  Save,
  Settings2,
  Square,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { BaseNode } from "@/components/canvas/nodes/BaseNode";
import { CanvasSidebar } from "@/components/canvas/CanvasSidebar";
import { EdgeInspector } from "@/components/canvas/EdgeInspector";
import { DRAG_TYPE } from "@/components/canvas/NodePalette";
import { NodeInspector } from "@/components/canvas/NodeInspector";
import { RunResultsPanel } from "@/components/results/RunResultsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { NodeData, WorkflowGraph, WorkflowRun, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";

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
    labelStyle: { fill: "#94a3b8", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.9 },
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
  const { screenToFlowPosition, fitView, deleteElements } = useReactFlow();

  const initialNodes = useMemo<Node[]>(() => graphToNodes(initialGraph), [initialGraph]);
  const initialEdges = useMemo<Edge[]>(() => graphToEdges(initialGraph), [initialGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "versions" | "compare">("nodes");
  const [rightTab, setRightTab] = useState<"configure" | "results">("configure");
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
          animated: failed || isActive,
          style: failed
            ? { stroke: "#f43f5e", strokeWidth: 2 }
            : isActive
              ? { stroke: "#fbbf24", strokeWidth: 2 }
              : { stroke: "#475569", strokeWidth: 1.5 },
          labelStyle: { fill: "#94a3b8", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "#0f172a", fillOpacity: 0.9 },
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
      nodeCounter += 1;
      const id = `node_${nodeCounter}`;
      const newNode: Node = {
        id,
        type: "baseNode",
        position,
        data,
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [setNodes]
  );

  const handleAddNode = useCallback(
    (data: NodeData) => {
      nodeCounter += 1;
      addNodeAtPosition(data, {
        x: 120 + nodeCounter * 48,
        y: 120 + nodeCounter * 32,
      });
    },
    [addNodeAtPosition]
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

  const handleSave = async (saveAsNewVersion = false) => {
    setIsSaving(true);
    try {
      const version = await api.saveVersion(workflowId, {
        graph_json: toGraph(nodes, edges),
        save_as_new_version: saveAsNewVersion,
      });
      setCurrentVersionId(version.id);
      setCurrentVersionNumber(version.version_number);
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
    setRightTab("results");

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
  });

  const sourceNodeData = selectedEdge
    ? (nodes.find((n) => n.id === selectedEdge.source)?.data as NodeData | undefined)
    : undefined;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-4 border-b border-slate-800/80 bg-slate-950/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400">
            <Workflow className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">{workflowName}</h1>
            <p className="text-[11px] text-slate-500">
              {nodes.length} nodes · {edges.length} connections
              {currentVersionNumber != null && ` · v${currentVersionNumber}`}
            </p>
          </div>
        </div>

        <div className="mx-4 hidden h-8 w-px bg-slate-800 md:block" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Input
          </span>
          <Input
            className="h-9 border-slate-800 bg-slate-900/80"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Workflow input..."
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
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={nodes.length === 0}>
              <Play className="h-4 w-4" />
              Run
            </Button>
          )}
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
            connectionLineStyle={{ stroke: "#38bdf8", strokeWidth: 2 }}
            onSelectionChange={({ nodes: selNodes, edges: selEdges }) => {
              setSelectedNodeId(selNodes[0]?.id ?? null);
              setSelectedEdgeId(selEdges[0]?.id ?? null);
              if (selNodes[0] || selEdges[0]) setRightTab("configure");
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="canvas-flow bg-slate-950"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#1e293b"
            />
            <Controls
              showInteractive={false}
              className="!rounded-xl !border-slate-800 !bg-slate-900/90 !shadow-xl"
            />
            <MiniMap
              nodeColor={(n) => {
                const t = (n.data as NodeData)?.nodeType;
                const colors: Record<string, string> = {
                  agent: "#0ea5e9",
                  tool: "#8b5cf6",
                  evaluation: "#f59e0b",
                  guardrail: "#10b981",
                  router: "#f97316",
                  classifier: "#ec4899",
                  join: "#06b6d4",
                  summarizer: "#6366f1",
                  translator: "#3b82f6",
                  extractor: "#14b8a6",
                  transform: "#d946ef",
                  json_parse: "#84cc16",
                  delay: "#64748b",
                  note: "#eab308",
                };
                return colors[t ?? "agent"] ?? "#64748b";
              }}
              maskColor="rgba(2, 6, 23, 0.75)"
              className="!rounded-xl !border-slate-800 !bg-slate-900/80"
            />

            {nodes.length === 0 && (
              <Panel position="top-center" className="mt-24">
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-8 py-6 text-center backdrop-blur">
                  <p className="text-sm font-medium text-slate-300">Empty canvas</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Drag nodes from the sidebar or click to add your first agent step
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

        <div className="flex w-[340px] shrink-0 flex-col border-l border-slate-800/80 bg-slate-950/60">
          <div className="flex border-b border-slate-800/80">
            <button
              type="button"
              onClick={() => setRightTab("configure")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider transition",
                rightTab === "configure"
                  ? "border-b-2 border-sky-400 text-sky-300"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Settings2 className="h-4 w-4" />
              Configure
            </button>
            <button
              type="button"
              onClick={() => setRightTab("results")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider transition",
                rightTab === "results"
                  ? "border-b-2 border-sky-400 text-sky-300"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Play className="h-4 w-4" />
              Results
              {isRunning && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
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
                          : undefined
                    }
                    onChange={handleEdgeChange}
                    onDelete={handleDeleteEdge}
                  />
                ) : (
                  <NodeInspector
                    nodeId={selectedNodeId}
                    data={selectedData}
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

      <div className="flex items-center justify-between border-t border-slate-800/80 px-4 py-1.5 text-[10px] text-slate-600">
        <span>⌘S save · Delete remove selection · Drag nodes onto canvas</span>
        <span>{isRunning ? "Executing workflow…" : "Ready"}</span>
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