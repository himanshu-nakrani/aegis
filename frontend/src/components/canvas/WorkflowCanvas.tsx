"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  type FinalConnectionState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Maximize2,
  Play,
  Plus,
  Save,
  Settings2,
  Shield,
  Square,
  Trash2,
  Upload,
  Wand2,
  PanelLeft,
  PanelRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ConnectionLine } from "@/components/canvas/edges/ConnectionLine";
import { GradientEdge } from "@/components/canvas/edges/GradientEdge";
import { canvasNodeTypes, flowNodeTypeForData } from "@/components/canvas/nodes/node-types";
import { CanvasSidebar } from "@/components/canvas/CanvasSidebar";
import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import type { DiffKind } from "@/components/canvas/VersionDiffView";
import { EdgeInspector } from "@/components/canvas/EdgeInspector";
import { DRAG_TYPE } from "@/components/canvas/NodePalette";
import { QuickAddMenu } from "@/components/canvas/QuickAddMenu";
const NodeInspector = dynamic(
  () => import("@/components/canvas/NodeInspector").then((mod) => mod.NodeInspector),
  { ssr: false }
);
const RunResultsPanel = dynamic(
  () => import("@/components/results/RunResultsPanel").then((mod) => mod.RunResultsPanel),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { isEditableTarget } from "@/lib/shortcuts";
import {
  formatValidationToast,
  getWorkflowValidationIssues,
} from "@/lib/workflow-validation";
import { readWorkflowExportFile, WorkflowImportError } from "@/lib/workflow-import";
import type { NodeData, WorkflowGraph, WorkflowRun, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { useReducedMotionStrict } from "@/components/motion";

const edgeTypes = { default: GradientEdge, smoothstep: GradientEdge };

function minimapNodeColor(node: Node): string {
  const nodeType = (node.data as NodeData)?.nodeType;
  return CATEGORY_COLOR_VAR[categorize(nodeType ?? "agent")];
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
    type: flowNodeTypeForData(node.data as NodeData),
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
    labelStyle: { fill: "var(--fg-muted)", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "var(--surface-elevated)", fillOpacity: 0.95 },
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
  const reduceMotion = useReducedMotionStrict();
  // React Flow viewport animations honor prefers-reduced-motion.
  const viewportAnimMs = reduceMotion ? 0 : 300;
  const { screenToFlowPosition, flowToScreenPosition, fitView, deleteElements, getViewport, setViewport } =
    useReactFlow();

  const initialNodes = useMemo<Node[]>(() => graphToNodes(initialGraph), [initialGraph]);
  const initialEdges = useMemo<Edge[]>(() => graphToEdges(initialGraph), [initialGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "data" | "quality" | "versions" | "compare">("nodes");
  const [rightTab, setRightTab] = useState<"configure" | "results">("configure");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{
    screen: { x: number; y: number };
    flow: { x: number; y: number };
    sourceNodeId?: string;
  } | null>(null);
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeIds: string[]; edgeIds: string[] } | null>(
    null
  );
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [canvasAnnouncement, setCanvasAnnouncement] = useState("");
  const [diffHighlights, setDiffHighlights] = useState<Record<string, DiffKind> | null>(null);
  const lastSavedGraphRef = useRef(JSON.stringify(toGraph(initialNodes, initialEdges)));
  const savedVersionIdRef = useRef(versionId);
  const [historicalVersionNumber, setHistoricalVersionNumber] = useState<number | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(toGraph(nodes, edges)) !== lastSavedGraphRef.current,
    [nodes, edges]
  );

  const validationIssues = useMemo(() => getWorkflowValidationIssues(nodes), [nodes]);

  const selectedNodeFieldErrors = useMemo(() => {
    if (!selectedNodeId) return {};
    const errors: Record<string, string> = {};
    for (const issue of validationIssues) {
      if (issue.nodeId === selectedNodeId) {
        errors[issue.field] = issue.message;
      }
    }
    return errors;
  }, [selectedNodeId, validationIssues]);
  const runSourceRef = useRef<{ close: () => void } | null>(null);
  const currentRunIdRef = useRef<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedData = selectedNode ? (selectedNode.data as NodeData) : null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const failedGuardrailIds = useMemo(() => {
    const ids = (run?.metrics_json?.failed_guardrails as string[] | undefined) || [];
    return new Set(ids);
  }, [run?.metrics_json]);

  const nodeErrorMessages = useMemo(() => {
    const map: Record<string, string> = {};
    const events =
      (run?.metrics_json?.guardrail_events as Array<{
        node_id: string;
        message?: string;
      }>) || [];
    for (const event of events) {
      if (event.message) map[event.node_id] = event.message;
    }
    failedGuardrailIds.forEach((id) => {
      if (!map[id]) map[id] = "Guardrail check failed";
    });
    for (const result of run?.node_results || []) {
      if (result.status === "failed" && result.output) {
        map[result.node_id] = result.output;
      }
    }
    return map;
  }, [run, failedGuardrailIds]);

  const activeEdgeIds = useMemo(() => {
    if (!isRunning || !activeNodeId) return new Set<string>();
    return new Set(
      edges
        .filter((edge) => edge.source === activeNodeId || edge.target === activeNodeId)
        .map((edge) => edge.id)
    );
  }, [edges, isRunning, activeNodeId]);

  const skipEdgeAnim = edges.length > 80;

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        const srcData = src?.data as NodeData | undefined;
        const tgtData = tgt?.data as NodeData | undefined;
        const failed =
          failedGuardrailIds.has(edge.source) || failedGuardrailIds.has(edge.target);
        return {
          ...edge,
          type: "default",
          animated: false,
          data: {
            ...(edge.data as Record<string, unknown> | undefined),
            sourceNodeType: srcData?.nodeType,
            targetNodeType: tgtData?.nodeType,
            active: !skipEdgeAnim && activeEdgeIds.has(edge.id),
            failed,
          },
          labelStyle: { fill: "var(--fg-muted)", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.95 },
        };
      }),
    [edges, nodes, activeEdgeIds, failedGuardrailIds, skipEdgeAnim]
  );

  const nodeTypes = useMemo(() => canvasNodeTypes, []);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  const addNodeAtPosition = useCallback(
    (data: NodeData, position: { x: number; y: number }) => {
      if (isMobileViewport) return; // layout locked on small screens
      let newId = "";
      setNodes((nds) => {
        newId = nextNodeId(nds);
        return [
          ...nds,
          {
            id: newId,
            type: flowNodeTypeForData(data),
            position,
            data,
          },
        ];
      });
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
    },
    [setNodes, isMobileViewport]
  );

  const handleAddNode = useCallback(
    (data: NodeData) => {
      if (isMobileViewport) return; // layout locked on small screens
      let newId = "";
      setNodes((nds) => {
        newId = nextNodeId(nds);
        const ordinal = Number.parseInt(newId.replace("node_", ""), 10);
        return [
          ...nds,
          {
            id: newId,
            type: flowNodeTypeForData(data),
            position: { x: 120 + ordinal * 48, y: 120 + ordinal * 32 },
            data,
          },
        ];
      });
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
    },
    [setNodes, isMobileViewport]
  );

  const makeEdge = useCallback(
    (sourceId: string, targetId: string): Edge => {
      const sourceNode = nodes.find((n) => n.id === sourceId);
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
          .filter((e) => e.source === sourceId)
          .map((e) => (e.data as { route?: string })?.route)
          .filter(Boolean);
        route = branchKeys.find((r) => !used.includes(r)) ?? branchKeys[0];
      }

      return {
        source: sourceId,
        target: targetId,
        id: `e-${sourceId}-${targetId}-${Date.now()}`,
        type: "smoothstep",
        label: route,
        data: route ? { route } : undefined,
        labelStyle: { fill: "var(--fg-muted)", fontSize: 11 },
        labelBgStyle: { fill: "var(--surface-elevated)", fillOpacity: 0.9 },
      };
    },
    [nodes, edges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setEdges((eds) => addEdge(makeEdge(connection.source, connection.target), eds));
    },
    [makeEdge, setEdges]
  );

  /** n8n-style: dropping a half-made connection on empty canvas opens the node picker. */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;
      if (connectionState.fromHandle?.type !== "source") return;
      const sourceId = connectionState.fromNode?.id;
      if (!sourceId) return;
      const client =
        "changedTouches" in event
          ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
          : { x: event.clientX, y: event.clientY };
      setQuickAdd({
        screen: client,
        flow: screenToFlowPosition(client),
        sourceNodeId: sourceId,
      });
    },
    [screenToFlowPosition]
  );

  /** Open the picker from a node's "+" button; new node lands one column right. */
  const openQuickAddFromNode = useCallback(
    (nodeId: string) => {
      if (isMobileViewport) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const flow = { x: node.position.x + 280, y: node.position.y };
      const screen = flowToScreenPosition(flow);
      setQuickAdd({ screen, flow, sourceNodeId: nodeId });
    },
    [nodes, flowToScreenPosition, isMobileViewport]
  );

  const openQuickAddAtCenter = useCallback(() => {
    if (isMobileViewport) return;
    const rect = reactFlowWrapper.current?.getBoundingClientRect();
    const screen = rect
      ? { x: rect.x + rect.width / 2 - 144, y: rect.y + rect.height / 2 - 160 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setQuickAdd({ screen, flow: screenToFlowPosition(screen) });
  }, [screenToFlowPosition, isMobileViewport]);

  /** Pan the viewport so a newly placed node is fully visible (the inspector
   *  column opens on selection and can otherwise hide it). */
  const ensureInView = useCallback(
    (flow: { x: number; y: number }) => {
      const rect = reactFlowWrapper.current?.getBoundingClientRect();
      if (!rect) return;
      const vp = getViewport();
      const screen = flowToScreenPosition(flow);
      const nodeW = 200 * vp.zoom;
      const nodeH = 96 * vp.zoom;
      const rightLimit = rect.right - 360 - 48; // inspector width + margin
      const leftLimit = rect.left + 24;
      const topLimit = rect.top + 24;
      const bottomLimit = rect.bottom - 48;
      let dx = 0;
      let dy = 0;
      if (screen.x + nodeW > rightLimit) dx = rightLimit - (screen.x + nodeW);
      else if (screen.x < leftLimit) dx = leftLimit - screen.x;
      if (screen.y + nodeH > bottomLimit) dy = bottomLimit - (screen.y + nodeH);
      else if (screen.y < topLimit) dy = topLimit - screen.y;
      if (dx !== 0 || dy !== 0) {
        void setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: reduceMotion ? 0 : 200 });
      }
    },
    [getViewport, setViewport, flowToScreenPosition, reduceMotion]
  );

  const handleQuickAddSelect = useCallback(
    (data: NodeData) => {
      if (!quickAdd || isMobileViewport) return;
      let newId = "";
      setNodes((nds) => {
        newId = nextNodeId(nds);
        return [
          ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
          {
            id: newId,
            type: flowNodeTypeForData(data),
            position: quickAdd.flow,
            data,
            selected: true,
          },
        ];
      });
      if (quickAdd.sourceNodeId) {
        const sourceId = quickAdd.sourceNodeId;
        setEdges((eds) => addEdge(makeEdge(sourceId, newId), eds));
      }
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
      setQuickAdd(null);
      ensureInView(quickAdd.flow);
    },
    [quickAdd, setNodes, setEdges, makeEdge, ensureInView, isMobileViewport]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (isMobileViewport) return;
      let newId = "";
      setNodes((nds) => {
        const src = nds.find((n) => n.id === nodeId);
        if (!src) return nds;
        newId = nextNodeId(nds);
        return [
          ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
          {
            ...src,
            id: newId,
            position: { x: src.position.x + 40, y: src.position.y + 48 },
            data: JSON.parse(JSON.stringify(src.data)) as NodeData,
            selected: true,
          },
        ];
      });
      if (newId) {
        setSelectedNodeId(newId);
        setSelectedEdgeId(null);
      }
    },
    [setNodes, isMobileViewport]
  );


  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isMobileViewport) return;
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
    [screenToFlowPosition, addNodeAtPosition, isMobileViewport]
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
      setHistoricalVersionNumber(
        version.id !== savedVersionIdRef.current ? version.version_number : null
      );
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      toast.info(`Loaded version ${version.version_number}`);
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs }), 50);
    },
    [setNodes, setEdges, fitView, viewportAnimMs]
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
    if (isDirty) {
      setImportConfirmOpen(true);
      return;
    }
    importInputRef.current?.click();
  }, [isDirty]);

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
        setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs }), 50);
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
    [setNodes, setEdges, fitView, viewportAnimMs]
  );

  const clearSelection = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowResults(false);
    setRightTab("configure");
  }, [setNodes, setEdges]);

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
      const issues = getWorkflowValidationIssues(nodes);
      if (issues.length > 0) {
        toast.error(formatValidationToast(issues));
        return;
      }
      setIsSaving(true);
      try {
        const graph = toGraph(nodes, edges);
        const version = await api.saveVersion(workflowId, {
          graph_json: graph,
          save_as_new_version: saveAsNewVersion,
        });
        setCurrentVersionId(version.id);
        setCurrentVersionNumber(version.version_number);
        savedVersionIdRef.current = version.id;
        setHistoricalVersionNumber(null);
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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => {
      runSourceRef.current?.close();
      runSourceRef.current = null;
    };
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLiveEvents([]);
    setRun(null);
    setActiveNodeId(null);
    setRightTab("results");
    setShowResults(true);

    try {
      const graph = toGraph(nodes, edges);
      const graphKey = JSON.stringify(graph);
      let versionId = currentVersionId;

      if (graphKey !== lastSavedGraphRef.current) {
        setIsSaving(true);
        try {
          const version = await api.saveVersion(workflowId, {
            graph_json: graph,
            save_as_new_version: false,
          });
          versionId = version.id;
          setCurrentVersionId(version.id);
          setCurrentVersionNumber(version.version_number);
          lastSavedGraphRef.current = graphKey;
        } finally {
          setIsSaving(false);
        }
      }

      if (!versionId) {
        throw new Error("Save the workflow before running");
      }
      if (!inputText.trim()) {
        throw new Error("Enter input text before running");
      }

      const createdRun = await api.createRun({
        workflow_id: workflowId,
        version_id: versionId,
        input_text: inputText.trim(),
      });
      setRun(createdRun);
      currentRunIdRef.current = createdRun.id;
      toast.info("Workflow started");

      runSourceRef.current?.close();
      runSourceRef.current = null;
      const streamedNodeResults: WorkflowRun["node_results"] = [];

      const stream = api.streamRun(
        createdRun.id,
        (event) => {
        setLiveEvents((prev) => [...prev.slice(-49), event]);

        if (event.type === "node_started") {
          setActiveNodeId(String(event.node_id));
          setCanvasAnnouncement(
            `Node ${String(event.node_label || event.node_id)} started`
          );
        }
        if (event.type === "node_completed") {
          setActiveNodeId(null);
          setCanvasAnnouncement(
            `Node ${String(event.node_label || event.node_id)} completed`
          );
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
          setCanvasAnnouncement("Workflow run completed");
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
          setCanvasAnnouncement(`Workflow run failed: ${String(event.error || "unknown error")}`);
          toast.error(String(event.error || "Workflow failed"));
          setRun({
            ...createdRun,
            status: "failed",
            final_output: String(event.error || "Workflow failed"),
            node_results: streamedNodeResults,
          });
        }
        if (event.type === "run_cancelled") {
          setCanvasAnnouncement("Workflow run cancelled");
          toast.warning("Workflow cancelled");
          setRun({ ...createdRun, status: "cancelled", node_results: streamedNodeResults });
        }
        if (event.type === "approval_required") {
          setCanvasAnnouncement("Human approval required");
          toast.message("Approval required — see Results panel");
          setRun((prev) => {
            const base = prev ?? createdRun;
            return {
              ...base,
              status: "awaiting_approval",
              metrics_json: {
                ...(base.metrics_json || {}),
                pending_approval: {
                  node_id: String(event.node_id || ""),
                  review: String(event.review || ""),
                },
              },
            };
          });
          setIsRunning(false);
          setActiveNodeId(null);
          setRightTab("results");
        }
        if (
          event.type === "run_completed" ||
          event.type === "run_failed" ||
          event.type === "run_cancelled" ||
          event.type === "stream_end"
        ) {
          setIsRunning(false);
          setActiveNodeId(null);
          stream.close();
          runSourceRef.current = null;
        }
      },
        () => {
          setIsRunning(false);
          setActiveNodeId(null);
          runSourceRef.current?.close();
          runSourceRef.current = null;
        }
      );
      runSourceRef.current = stream;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start workflow");
      setIsRunning(false);
      runSourceRef.current?.close();
      runSourceRef.current = null;
    }
  }, [workflowId, currentVersionId, inputText, nodes, edges, isRunning]);

  const handleStop = useCallback(async () => {
    const runId = currentRunIdRef.current;
    if (!runId) return;
    try {
      await api.cancelRun(runId);
      toast.warning("Stopping workflow…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel run");
    } finally {
      runSourceRef.current?.close();
      runSourceRef.current = null;
      setIsRunning(false);
      setActiveNodeId(null);
    }
  }, []);

  const handleTidyLayout = useCallback(() => {
    // Layer nodes left-to-right by graph depth (BFS from entry nodes).
    const adj = new Map<string, string[]>();
    const incoming = new Map<string, number>();
    for (const node of nodes) incoming.set(node.id, 0);
    for (const edge of edges) {
      adj.set(edge.source, [...(adj.get(edge.source) || []), edge.target]);
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    }
    const depth = new Map<string, number>();
    const queue = nodes.filter((n) => (incoming.get(n.id) || 0) === 0).map((n) => n.id);
    for (const id of queue) depth.set(id, 0);
    while (queue.length) {
      const id = queue.shift() as string;
      const d = (depth.get(id) || 0) + 1;
      if (d > nodes.length) continue; // cycle guard
      for (const next of adj.get(id) || []) {
        if ((depth.get(next) ?? -1) < d) {
          depth.set(next, d);
          queue.push(next);
        }
      }
    }
    const layers = new Map<number, string[]>();
    for (const node of nodes) {
      const d = depth.get(node.id) ?? 0;
      layers.set(d, [...(layers.get(d) || []), node.id]);
    }
    const maxRows = Math.max(...Array.from(layers.values()).map((ids) => ids.length));
    const positions = new Map<string, { x: number; y: number }>();
    layers.forEach((ids, d) => {
      const offset = ((maxRows - ids.length) * 140) / 2; // center shorter columns
      ids.forEach((id, i) => {
        positions.set(id, { x: 60 + d * 280, y: 60 + offset + i * 140 });
      });
    });
    setNodes((nds) =>
      nds.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      })
    );
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs }), 50);
  }, [nodes, edges, setNodes, fitView, viewportAnimMs]);

  const executeDelete = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      deleteElements({
        nodes: nodeIds.map((id) => ({ id })),
        edges: edgeIds.map((id) => ({ id })),
      });
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [deleteElements]
  );

  const handleDeleteSelection = useCallback(() => {
    if (isMobileViewport) return; // layout locked on small screens
    let nodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
    let edgeIds = edges.filter((e) => e.selected).map((e) => e.id);

    if (nodeIds.length === 0 && edgeIds.length === 0) {
      if (selectedNodeId) nodeIds = [selectedNodeId];
      else if (selectedEdgeId) edgeIds = [selectedEdgeId];
      else return;
    }

    if (nodeIds.length >= 1 || edgeIds.length >= 2) {
      setDeleteConfirm({ nodeIds, edgeIds });
      return;
    }
    executeDelete(nodeIds, edgeIds);
  }, [nodes, edges, selectedNodeId, selectedEdgeId, executeDelete, isMobileViewport]);

  /** Node-toolbar delete: confirm a single node by id. */
  const requestDeleteNode = useCallback((nodeId: string) => {
    setDeleteConfirm({ nodeIds: [nodeId], edgeIds: [] });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave(false);
      }
      if (isMobileViewport) return; // layout locked on small screens
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditableTarget(e.target)) {
        e.preventDefault();
        handleDeleteSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedNodeId && !isEditableTarget(e.target)) {
        e.preventDefault();
        handleDuplicateNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handleDeleteSelection, handleDuplicateNode, selectedNodeId, isMobileViewport]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...(node.data as NodeData),
          isActive: node.id === activeNodeId,
          hasError: failedGuardrailIds.has(node.id),
          errorMessage: nodeErrorMessages[node.id],
          diffKind: diffHighlights?.[node.id] ?? undefined,
          onQuickAdd: isMobileViewport ? undefined : openQuickAddFromNode,
          onDuplicate: isMobileViewport ? undefined : handleDuplicateNode,
          onDelete: isMobileViewport ? undefined : requestDeleteNode,
        },
      })),
    [
      nodes,
      activeNodeId,
      failedGuardrailIds,
      nodeErrorMessages,
      diffHighlights,
      isMobileViewport,
      openQuickAddFromNode,
      handleDuplicateNode,
      requestDeleteNode,
    ]
  );

  const sourceNodeData = selectedEdge
    ? (nodes.find((n) => n.id === selectedEdge.source)?.data as NodeData | undefined)
    : undefined;
  const editorStatus = isRunning
    ? "Running"
    : isDirty
      ? "Unsaved"
      : historicalVersionNumber != null
        ? `Viewing v${historicalVersionNumber}`
        : "Saved";
  const selectedLabel = selectedNode
    ? (selectedNode.data as NodeData).label || selectedNode.id
    : selectedEdge
      ? "Connection selected"
      : "Nothing selected";

  return (
    <div className="flex h-screen flex-col bg-background">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {canvasAnnouncement}
      </p>
      <div className="flex flex-col gap-2 border-b border-border bg-background px-3 py-2 md:gap-3 md:px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <Link
            href="/"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
            title="Back to workflows"
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

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-primary sm:flex">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">
                {workflowName}
                {isDirty && (
                  <span
                    className="ml-1.5 inline-block text-warning"
                    title="Unsaved changes"
                    aria-label="Unsaved changes"
                  >
                    •
                  </span>
                )}
              </h1>
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

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 lg:hidden"
            onClick={() => setRightSidebarOpen(true)}
            aria-label="Open configure panel"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden shrink-0 text-xs font-medium text-muted lg:inline">Input</span>
          <Input
            className="h-9 min-w-0 flex-1"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Workflow input…"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button
            variant="outline"
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
            New version
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
          ) : nodes.length === 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button size="sm" disabled>
                    <Play className="h-4 w-4" />
                    <span className="hidden sm:inline">Run</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Add at least one node to run this workflow</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="sm" onClick={handleRun}>
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Run</span>
            </Button>
          )}
        </div>
      </div>

        <div className="hidden items-center gap-3 border-b border-border bg-surface-elevated px-3 py-2 lg:flex">
          <Link
            href="/"
            className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-hover hover:text-foreground"
            title="Back to workflows"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1 border-r border-border pr-3">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-foreground">{workflowName}</h1>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 font-mono text-xs",
                  isRunning || isDirty ? "text-warning" : "text-success"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {editorStatus}
              </span>
            </div>
            <p className="truncate text-xs text-muted">
              {nodes.length} nodes · {edges.length} edges
              {currentVersionNumber != null && ` · v${currentVersionNumber}`} · {selectedLabel}
            </p>
          </div>
          <div className="hidden items-center gap-4 border-r border-border pr-4 font-mono text-xs text-muted xl:flex">
            <span>{nodes.length} nodes</span>
            <span>{edges.length} edges</span>
            {validationIssues.length > 0 && (
              <span className="text-warning">
                {validationIssues.length} issue{validationIssues.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-input px-2 py-1">
            <span className="text-xs text-subtle">Input</span>
            <Input
              className="h-8 w-56 border-0 bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Workflow input…"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={isSaving}>
            <Save className="h-4 w-4" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(true)}
            disabled={isSaving}
          >
            New version
          </Button>
          <Button variant="outline" size="sm" onClick={handleImportClick} title="Import workflow JSON">
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} title="Export workflow JSON">
            <Download className="h-4 w-4" />
          </Button>
          <motion.div layout>
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={handleStop}>
                <Square className="h-4 w-4" />
                Cancel
              </Button>
            ) : nodes.length === 0 ? (
              <Button size="sm" disabled>
                <Play className="h-4 w-4" />
                Run
              </Button>
            ) : (
              <Button size="sm" onClick={handleRun}>
                <Play className="h-4 w-4" />
                Run
              </Button>
            )}
          </motion.div>
        </div>

      <div className="relative flex flex-1 overflow-hidden">
        <CanvasSidebar
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          onAddNode={handleAddNode}
          workflowId={workflowId}
          currentVersionId={currentVersionId}
          onSelectVersion={handleVersionSelect}
          onDiffHighlight={setDiffHighlights}
          mobileOpen={leftSidebarOpen}
          onMobileClose={() => setLeftSidebarOpen(false)}
        />

        <div ref={reactFlowWrapper} className="canvas-bg relative flex-1">
          {(isMobileViewport || historicalVersionNumber != null) && (
            <div className="absolute inset-x-0 top-0 z-20 flex flex-col">
              {isMobileViewport && (
                <div className="border-b border-border bg-surface-elevated/95 px-4 py-2 text-center font-mono text-2xs text-muted">
                  Layout locked on small screens — open a larger screen to add, move, or connect
                  nodes.
                </div>
              )}
              {historicalVersionNumber != null && (
                <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-foreground">
                  You&apos;re viewing version {historicalVersionNumber}. Save to make this the
                  current version.
                </div>
              )}
            </div>
          )}
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            edgeTypes={memoizedEdgeTypes}
            nodesDraggable={!isMobileViewport}
            nodesConnectable={!isMobileViewport}
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode={null}
            panOnScroll
            connectionRadius={36}
            defaultEdgeOptions={{ type: "default" }}
            connectionLineComponent={ConnectionLine}
            onSelectionChange={handleSelectionChange}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            className="canvas-flow bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--canvas-grid)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={minimapNodeColor}
              nodeStrokeWidth={0}
              nodeBorderRadius={3}
              maskColor="rgba(6, 8, 13, 0.82)"
              className="!border-border !bg-surface-elevated/90 !shadow-elev-2"
            />

            {nodes.length === 0 && !isMobileViewport && (
              <Panel position="top-center" className="mt-32">
                <button
                  type="button"
                  onClick={openQuickAddAtCenter}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-12 py-10 text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-elevated">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Add first step…</span>
                  <span className="text-xs">Pick a trigger to start the workflow</span>
                </button>
              </Panel>
            )}

            <Panel position="bottom-left" className="!m-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 shadow-elev-1"
                onClick={() => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs })}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fit
              </Button>
              {!isMobileViewport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shadow-elev-1"
                  onClick={handleTidyLayout}
                  disabled={nodes.length === 0}
                  title="Auto-arrange nodes left to right"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Tidy
                </Button>
              )}
              {!isMobileViewport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shadow-elev-1"
                  onClick={handleDeleteSelection}
                  disabled={!selectedNodeId && !selectedEdgeId}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </Panel>
          </ReactFlow>
          {quickAdd && (
            <QuickAddMenu
              position={quickAdd.screen}
              preferTriggers={nodes.length === 0}
              onSelect={handleQuickAddSelect}
              onClose={() => setQuickAdd(null)}
            />
          )}
          <AnimatePresence>
            {!selectedNodeId && nodes.length > 0 && !isMobileViewport && (
              <motion.button
                key="run-fab"
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={handleRun}
                disabled={isRunning}
                className="absolute bottom-6 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-elev-2 transition-colors duration-fast hover:bg-primary-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                aria-label="Run workflow"
              >
                <Play className="h-5 w-5" />
              </motion.button>
            )}
          </AnimatePresence>
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
            "w-[360px] shrink-0 flex-col border-l border-border bg-surface-elevated",
            rightSidebarOpen
              ? "fixed inset-y-0 right-0 z-40 flex shadow-2xl"
              : selectedNodeId || selectedEdgeId || showResults
                ? "hidden lg:flex"
                : "hidden"
          )}
        >
          <div className="flex items-center border-b border-border lg:hidden">
            <span className="flex-1 px-4 py-3 text-sm font-medium text-foreground">
              {rightTab === "configure" ? "Configure" : "Results"}
            </span>
            <button
              type="button"
              onClick={() => setRightSidebarOpen(false)}
              aria-label="Close configure panel"
              className="px-4 py-3 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex border-b border-border bg-background/25">
            <div className="flex flex-1" role="tablist" aria-label="Canvas panels">
            <button
              type="button"
              role="tab"
              id="canvas-right-tab-configure"
              aria-selected={rightTab === "configure"}
              aria-controls="canvas-right-panel-configure"
              onClick={() => setRightTab("configure")}
              className={cn("tab-trigger", rightTab === "configure" && "tab-trigger-active")}
            >
              <Settings2 className="h-4 w-4" />
              Configure
            </button>
            <button
              type="button"
              role="tab"
              id="canvas-right-tab-results"
              aria-selected={rightTab === "results"}
              aria-controls="canvas-right-panel-results"
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
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Close panel"
              className="focus-ring hidden px-3 text-muted transition-colors hover:text-foreground lg:block"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === "configure" ? (
              <div
                role="tabpanel"
                id="canvas-right-panel-configure"
                aria-labelledby="canvas-right-tab-configure"
                className="space-y-4 p-4"
              >
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
                    onDelete={isMobileViewport ? undefined : handleDeleteEdge}
                  />
                ) : (
                  <NodeInspector
                    nodeId={selectedNodeId}
                    data={selectedData}
                    workflowId={workflowId}
                    fieldErrors={selectedNodeFieldErrors}
                    onChange={handleNodeDataChange}
                  />
                )}
              </div>
            ) : (
              <div
                role="tabpanel"
                id="canvas-right-panel-results"
                aria-labelledby="canvas-right-tab-results"
              >
                <RunResultsPanel
                  embedded
                  run={run}
                  liveEvents={liveEvents}
                  isRunning={isRunning}
                  onRunUpdate={setRun}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-1.5 font-mono text-xs text-muted">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              isRunning || isDirty ? "text-warning" : "text-success"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {editorStatus}
          </span>
          <span className="hidden truncate sm:inline">
            ⌘S save · ⌫ delete · drag nodes onto canvas
          </span>
          <span className="truncate sm:hidden">Tap panels to configure and run</span>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
          {validationIssues.length > 0 && (
            <span className="text-warning">{validationIssues.length} issue{validationIssues.length === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
        title="Delete selection?"
        description={
          deleteConfirm
            ? `This will remove ${deleteConfirm.nodeIds.length} node${deleteConfirm.nodeIds.length === 1 ? "" : "s"}${deleteConfirm.edgeIds.length > 0 ? ` and ${deleteConfirm.edgeIds.length} connection${deleteConfirm.edgeIds.length === 1 ? "" : "s"}` : ""}. This cannot be undone.`
            : ""
        }
        confirmLabel={
          deleteConfirm
            ? `Delete ${deleteConfirm.nodeIds.length + deleteConfirm.edgeIds.length} item${deleteConfirm.nodeIds.length + deleteConfirm.edgeIds.length === 1 ? "" : "s"}`
            : "Delete"
        }
        loadingLabel="Deleting…"
        variant="destructive"
        onConfirm={async () => {
          if (deleteConfirm) executeDelete(deleteConfirm.nodeIds, deleteConfirm.edgeIds);
          setDeleteConfirm(null);
        }}
      />

      <ConfirmDialog
        open={importConfirmOpen}
        onOpenChange={setImportConfirmOpen}
        title="Import workflow?"
        description="Importing replaces the current workflow. Unsaved changes will be lost."
        confirmLabel="Import and replace"
        loadingLabel="Importing…"
        variant="destructive"
        onConfirm={async () => {
          setImportConfirmOpen(false);
          importInputRef.current?.click();
        }}
      />
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
