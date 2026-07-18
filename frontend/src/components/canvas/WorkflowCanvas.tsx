"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  ClipboardPaste,
  Maximize2,
  Minus,
  MousePointer2,
  PenLine,
  Play,
  Plus,
  Settings2,
  Shield,
  Trash2,
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
import { CanvasContextMenu, type ContextMenuItem } from "@/components/canvas/CanvasContextMenu";
import { useGraphHistory } from "@/components/canvas/useGraphHistory";
import {
  copyToClipboard,
  hasClipboard,
  materializeClipboard,
  duplicateFragment,
} from "@/components/canvas/clipboard";
import { WorkflowNameEditor } from "@/components/canvas/chrome/WorkflowNameEditor";
import { HeaderActions } from "@/components/canvas/chrome/HeaderActions";
import { CanvasStatusBar } from "@/components/canvas/chrome/CanvasStatusBar";
import { CanvasToolbar } from "@/components/canvas/chrome/CanvasToolbar";
import { RunControl } from "@/components/canvas/run/RunControl";
import { useRunInput } from "@/components/canvas/run/useRunInput";
import { NodeOutputPeek } from "@/components/canvas/run/NodeOutputPeek";
import { RunProgressStrip } from "@/components/canvas/run/RunProgressStrip";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
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
import { api } from "@/lib/api";
import { isEditableTarget, isInOverlay } from "@/lib/shortcuts";
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
  const {
    screenToFlowPosition,
    flowToScreenPosition,
    fitView,
    zoomIn,
    zoomOut,
    deleteElements,
    getViewport,
    setViewport,
    setCenter,
  } = useReactFlow();

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    kind: "node" | "edge" | "pane" | "selection";
    id?: string;
    screen: { x: number; y: number };
    flow: { x: number; y: number };
  } | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [nodeRunResults, setNodeRunResults] = useState<
    Record<
      string,
      { output: string | null; latencyMs: number | null; guardrailStatus: string | null; status: string }
    >
  >({});
  const [outputPeek, setOutputPeek] = useState<{ nodeId: string; screen: { x: number; y: number } } | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState(workflowName);
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

  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Live refs so history/paste snapshots read fresh state synchronously.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const history = useGraphHistory({ nodesRef, edgesRef, setNodes, setEdges });
  const record = history.record;
  const undo = history.undo;
  const redo = history.redo;

  const rightPanel = useResizablePanel({
    storageKey: "aegis:panel:right",
    defaultWidth: 360,
    min: 320,
    max: 520,
    side: "right",
  });

  // Single run-input instance shared by both RunControl headers (desktop +
  // mobile) so their stored input never diverges.
  const runInput = useRunInput(workflowId, nodes);

  // Single-selection views drive the inspectors; multi-selection drives bulk ops.
  const selectedNodeId =
    selectedNodeIds.length === 1 && selectedEdgeIds.length === 0 ? selectedNodeIds[0] : null;
  const selectedEdgeId =
    selectedEdgeIds.length === 1 && selectedNodeIds.length === 0 ? selectedEdgeIds[0] : null;
  const selectionCount = selectedNodeIds.length + selectedEdgeIds.length;

  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIds(id ? [id] : []);
    if (id) setSelectedEdgeIds([]);
  }, []);
  const setSelectedEdgeId = useCallback((id: string | null) => {
    setSelectedEdgeIds(id ? [id] : []);
    if (id) setSelectedNodeIds([]);
  }, []);


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
  // Flipped false on unmount so awaited run steps can bail instead of starting
  // a stream (or touching state) after the component is gone.
  const mountedRef = useRef(true);
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
            sourceCompleted:
              !skipEdgeAnim && nodeRunResults[edge.source]?.status === "completed",
          },
          labelStyle: { fill: "var(--fg-muted)", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.95 },
        };
      }),
    [edges, nodes, activeEdgeIds, failedGuardrailIds, skipEdgeAnim, nodeRunResults]
  );

  const nodeTypes = useMemo(() => canvasNodeTypes, []);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  // Pointer drags record via onNodeDragStart (dragging === true on their
  // position changes). Arrow-key nudges arrive as position changes with
  // dragging !== true and no drag session — record those once, coalescing
  // held-arrow repeats under a shared key.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const keyMove = changes.some(
        (c) => c.type === "position" && c.dragging !== true
      );
      if (keyMove) record("keymove");
      onNodesChange(changes);
    },
    [onNodesChange, record]
  );

  const addNodeAtPosition = useCallback(
    (data: NodeData, position: { x: number; y: number }) => {
      if (isMobileViewport) return; // layout locked on small screens
      record();
      const newId = nextNodeId(nodesRef.current);
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        {
          id: newId,
          type: flowNodeTypeForData(data),
          position,
          data,
          selected: true,
        },
      ]);
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
    },
    [setNodes, isMobileViewport, record, setSelectedNodeId, setSelectedEdgeId]
  );

  const handleAddNode = useCallback(
    (data: NodeData) => {
      if (isMobileViewport) {
        // Palette taps reach here on mobile; give feedback instead of failing silently.
        toast.info("Layout locked on small screens — open a larger screen to add nodes");
        return;
      }
      record();
      const newId = nextNodeId(nodesRef.current);
      const ordinal = Number.parseInt(newId.replace("node_", ""), 10);
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        {
          id: newId,
          type: flowNodeTypeForData(data),
          position: { x: 120 + ordinal * 48, y: 120 + ordinal * 32 },
          data,
          selected: true,
        },
      ]);
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
    },
    [setNodes, isMobileViewport, record, setSelectedNodeId, setSelectedEdgeId]
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
                : sourceData?.nodeType === "guardrail" &&
                    sourceData.rules?.fail_behavior === "route"
                  ? [
                      sourceData.rules.pass_route || "pass",
                      sourceData.rules.failure_route || "failed",
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
      // addEdge dedupes an identical connection (same endpoints + handles);
      // don't record a phantom undo entry when it would be a no-op.
      const isDuplicate = edgesRef.current.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          (e.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (connection.targetHandle ?? null)
      );
      if (isDuplicate) return;
      record();
      setEdges((eds) => addEdge(makeEdge(connection.source, connection.target), eds));
    },
    [makeEdge, setEdges, record]
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
      // The inspector column occupies rightPanel.width on large screens once a
      // node is selected. Only reserve that space when it will actually show.
      const inspectorVisible =
        !isMobileViewport && window.matchMedia("(min-width: 1024px)").matches;
      const inspectorInset = inspectorVisible ? rightPanel.width + 48 : 48;
      const rightLimit = rect.right - inspectorInset; // inspector width + margin
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
    [getViewport, setViewport, flowToScreenPosition, reduceMotion, isMobileViewport, rightPanel.width]
  );

  const handleQuickAddSelect = useCallback(
    (data: NodeData) => {
      if (!quickAdd || isMobileViewport) return;
      record();
      const newId = nextNodeId(nodesRef.current);
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        {
          id: newId,
          type: flowNodeTypeForData(data),
          position: quickAdd.flow,
          data,
          selected: true,
        },
      ]);
      if (quickAdd.sourceNodeId) {
        const sourceId = quickAdd.sourceNodeId;
        setEdges((eds) => addEdge(makeEdge(sourceId, newId), eds));
      }
      setSelectedNodeId(newId);
      setSelectedEdgeId(null);
      setQuickAdd(null);
      ensureInView(quickAdd.flow);
    },
    [quickAdd, setNodes, setEdges, makeEdge, ensureInView, isMobileViewport, record, setSelectedNodeId, setSelectedEdgeId]
  );

  /** Duplicate a set of nodes preserving intra-group connections. */
  const duplicateNodes = useCallback(
    (nodeIds: string[]) => {
      if (isMobileViewport || nodeIds.length === 0) return;
      const idSet = new Set(nodeIds);
      const fragment = duplicateFragment(
        nodesRef.current.filter((n) => idSet.has(n.id)),
        edgesRef.current,
        nodesRef.current
      );
      if (!fragment) return;
      record();
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...fragment.nodes,
      ]);
      if (fragment.edges.length > 0) {
        setEdges((eds) => [
          ...eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
          ...fragment.edges,
        ]);
      }
    },
    [setNodes, setEdges, isMobileViewport, record]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => duplicateNodes([nodeId]),
    [duplicateNodes]
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
      record(`data:${nodeId}`);
      setNodes((nds) => nds.map((node) => (node.id === nodeId ? { ...node, data } : node)));
    },
    [setNodes, record]
  );

  const handleEdgeChange = useCallback(
    (edgeId: string, updates: { route?: string; label?: string }) => {
      record(`edge:${edgeId}`);
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
    [setEdges, record]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      record();
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
    },
    [setEdges, record, setSelectedEdgeId]
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
      history.clear();
      toast.info(`Loaded version ${version.version_number}`);
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs }), 50);
    },
    [setNodes, setEdges, fitView, viewportAnimMs, history, setSelectedNodeId, setSelectedEdgeId]
  );

  const handleExport = useCallback(() => {
    const graph = toGraph(nodes, edges);
    const payload = {
      format: "aegis-workflow-v1",
      workflow_id: workflowId,
      name: displayName,
      version_number: currentVersionNumber,
      graph_json: graph,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = displayName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "workflow";
    anchor.href = url;
    anchor.download = `${safeName}-${workflowId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
  }, [nodes, edges, workflowId, displayName, currentVersionNumber]);

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
        setCurrentVersionNumber(null);
        setHistoricalVersionNumber(null);
        savedVersionIdRef.current = undefined;
        history.clear();
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
    [setNodes, setEdges, fitView, viewportAnimMs, history, setSelectedNodeId, setSelectedEdgeId]
  );

  const clearSelection = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowResults(false);
    setRightTab("configure");
  }, [setNodes, setEdges, setSelectedNodeId, setSelectedEdgeId]);

  const handleSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeIds(selNodes.map((n) => n.id));
      setSelectedEdgeIds(selEdges.map((e) => e.id));
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
      mountedRef.current = false;
      runSourceRef.current?.close();
      runSourceRef.current = null;
    };
  }, []);

  const handleRun = useCallback(async (input: string) => {
    if (isRunning) return;

    // Validate + input checks BEFORE any autosave or UI reset so we don't
    // persist a broken graph or clear results only to bail immediately.
    const issues = getWorkflowValidationIssues(nodes);
    if (issues.length > 0) {
      toast.error(formatValidationToast(issues));
      return;
    }
    if (!input.trim()) {
      toast.error("Enter input text before running");
      return;
    }

    setIsRunning(true);
    setLiveEvents([]);
    setRun(null);
    setActiveNodeId(null);
    setNodeRunResults({});
    setOutputPeek(null);
    setRunStartedAt(Date.now());
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
          savedVersionIdRef.current = version.id;
          setHistoricalVersionNumber(null);
          lastSavedGraphRef.current = graphKey;
        } finally {
          setIsSaving(false);
        }
      }
      if (!mountedRef.current) return; // unmounted mid-save

      if (!versionId) {
        throw new Error("Save the workflow before running");
      }

      const createdRun = await api.createRun({
        workflow_id: workflowId,
        version_id: versionId,
        input_text: input.trim(),
      });
      if (!mountedRef.current) return; // unmounted while createRun was in flight
      setRun(createdRun);
      currentRunIdRef.current = createdRun.id;
      toast.info("Workflow started");

      runSourceRef.current?.close();
      runSourceRef.current = null;
      let streamClosed = false;
      // Track the last node that started so run_failed (which carries no
      // node_id) can attribute the failure to the node that was executing.
      let lastActiveNodeId: string | null = null;
      const streamedNodeResults: WorkflowRun["node_results"] = [];

      const stream = api.streamRun(
        createdRun.id,
        (event) => {
        setLiveEvents((prev) => [...prev.slice(-49), event]);

        if (event.type === "node_started") {
          lastActiveNodeId = String(event.node_id);
          setActiveNodeId(String(event.node_id));
          setCanvasAnnouncement(
            `Node ${String(event.node_label || event.node_id)} started`
          );
        }
        if (event.type === "node_completed") {
          setActiveNodeId(null);
          // Backend contract: node_completed carries a status field
          // ("completed" | "failed"); default to "completed" for older streams.
          const nodeStatus = (event.status as string | undefined) ?? "completed";
          setCanvasAnnouncement(
            `Node ${String(event.node_label || event.node_id)} ${nodeStatus}`
          );
          setNodeRunResults((prev) => ({
            ...prev,
            [String(event.node_id)]: {
              output: (event.output as string | null | undefined) ?? null,
              latencyMs: (event.latency_ms as number | null) ?? null,
              guardrailStatus: (event.guardrail_status as string | null) ?? null,
              status: nodeStatus,
            },
          }));
          streamedNodeResults.push({
            id: String(event.node_id),
            node_id: String(event.node_id),
            node_type: "unknown",
            node_label: String(event.node_label || event.node_id),
            status: nodeStatus,
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
          const errorMessage = String(event.error || "Workflow failed");
          setCanvasAnnouncement(`Workflow run failed: ${errorMessage}`);
          toast.error(errorMessage);
          // Attribute the failure to the node that was executing so the canvas
          // shows a red border + error bubble on it.
          const failedNodeId =
            (event.node_id != null ? String(event.node_id) : null) ?? lastActiveNodeId;
          if (failedNodeId) {
            setNodeRunResults((prev) => ({
              ...prev,
              [failedNodeId]: {
                output: prev[failedNodeId]?.output ?? errorMessage,
                latencyMs: prev[failedNodeId]?.latencyMs ?? null,
                guardrailStatus: prev[failedNodeId]?.guardrailStatus ?? null,
                status: "failed",
              },
            }));
          }
          setRun({
            ...createdRun,
            status: "failed",
            final_output: errorMessage,
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
          streamClosed = true;
          stream.close();
          runSourceRef.current = null;
        }
      },
        () => {
          setIsRunning(false);
          setActiveNodeId(null);
          streamClosed = true;
          runSourceRef.current?.close();
          runSourceRef.current = null;
        }
      );
      // Only retain the stream handle if it hasn't already terminated
      // synchronously (a fast terminal event fires before this assignment).
      if (!streamClosed && mountedRef.current) {
        runSourceRef.current = stream;
      } else {
        stream.close();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start workflow");
      setIsRunning(false);
      runSourceRef.current?.close();
      runSourceRef.current = null;
    }
  }, [workflowId, currentVersionId, nodes, edges, isRunning]);

  const handleStop = useCallback(async () => {
    const runId = currentRunIdRef.current;
    if (!runId) return;
    // Closing the stream in finally means the run_cancelled event never
    // arrives, leaving run.status stuck on "running". Optimistically reflect
    // the cancellation in local state and reset the running UI instead.
    try {
      await api.cancelRun(runId);
      toast.warning("Stopping workflow…");
      setRun((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      currentRunIdRef.current = null;
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
    if (nodes.length === 0) return;
    record();
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
  }, [nodes, edges, setNodes, fitView, viewportAnimMs, record]);

  const executeDelete = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      record();
      deleteElements({
        nodes: nodeIds.map((id) => ({ id })),
        edges: edgeIds.map((id) => ({ id })),
      });
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [deleteElements, record, setSelectedNodeId, setSelectedEdgeId]
  );

  const handleDeleteSelection = useCallback(() => {
    if (isMobileViewport) return; // layout locked on small screens
    let nodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
    let edgeIds = edges.filter((e) => e.selected).map((e) => e.id);

    if (nodeIds.length === 0 && edgeIds.length === 0) {
      if (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
        nodeIds = selectedNodeIds;
        edgeIds = selectedEdgeIds;
      } else return;
    }

    if (nodeIds.length >= 1 || edgeIds.length >= 2) {
      setDeleteConfirm({ nodeIds, edgeIds });
      return;
    }
    executeDelete(nodeIds, edgeIds);
  }, [nodes, edges, selectedNodeIds, selectedEdgeIds, executeDelete, isMobileViewport]);

  /** Node-toolbar delete: confirm a single node by id. */
  const requestDeleteNode = useCallback((nodeId: string) => {
    setDeleteConfirm({ nodeIds: [nodeId], edgeIds: [] });
  }, []);

  const handleCopy = useCallback(() => {
    const selected = nodesRef.current.filter((n) => n.selected || selectedNodeIds.includes(n.id));
    if (selected.length === 0) return;
    const count = copyToClipboard(selected, edgesRef.current);
    toast.success(`Copied ${count} node${count === 1 ? "" : "s"}`);
  }, [selectedNodeIds]);

  const handlePaste = useCallback(
    (anchorFlow?: { x: number; y: number }) => {
      if (isMobileViewport || !hasClipboard()) return;
      let anchor = anchorFlow;
      if (!anchor) {
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        const screen =
          lastPointerRef.current ??
          (rect
            ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
            : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
        anchor = screenToFlowPosition(screen);
      }
      const fragment = materializeClipboard(nodesRef.current, anchor);
      if (!fragment) return;
      record();
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...fragment.nodes,
      ]);
      setEdges((eds) => [
        ...eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
        ...fragment.edges,
      ]);
    },
    [isMobileViewport, screenToFlowPosition, record, setNodes, setEdges]
  );

  const handleSelectAll = useCallback(() => {
    if (isMobileViewport) return;
    setNodes((nds) => nds.map((n) => (n.selected ? n : { ...n, selected: true })));
  }, [setNodes, isMobileViewport]);

  /** Center a node and select it (validation-issue click-through). */
  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
      setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
      void setCenter(node.position.x + 100, node.position.y + 48, {
        zoom: 1,
        duration: viewportAnimMs,
      });
    },
    [setNodes, setEdges, setCenter, viewportAnimMs]
  );

  const openContextMenu = useCallback(
    (
      kind: "node" | "edge" | "pane" | "selection",
      event: React.MouseEvent | MouseEvent,
      id?: string
    ) => {
      if (isMobileViewport) return;
      event.preventDefault();
      const screen = { x: event.clientX, y: event.clientY };
      setContextMenu({ kind, id, screen, flow: screenToFlowPosition(screen) });
    },
    [isMobileViewport, screenToFlowPosition]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      if (isMobileViewport) return;
      // Dropping the edge back on the same handles is a no-op — skip recording.
      if (
        connection.source === oldEdge.source &&
        connection.target === oldEdge.target &&
        (connection.sourceHandle ?? null) === (oldEdge.sourceHandle ?? null) &&
        (connection.targetHandle ?? null) === (oldEdge.targetHandle ?? null)
      ) {
        return;
      }
      record();
      setEdges((eds) => {
        let next = reconnectEdge(oldEdge, connection, eds, { shouldReplaceId: false });
        if (connection.source !== oldEdge.source) {
          // New source may not share the old branch semantics — recompute.
          const sourceData = nodesRef.current.find((n) => n.id === connection.source)
            ?.data as NodeData | undefined;
          const branchKeys =
            sourceData?.nodeType === "router"
              ? sourceData.routes
              : sourceData?.nodeType === "classifier"
                ? sourceData.categories
                : sourceData?.nodeType === "if"
                  ? ["true", "false"]
                  : sourceData?.nodeType === "switch"
                    ? [...(sourceData.switchCases || []), sourceData.switchDefault || "default"]
                    : sourceData?.nodeType === "guardrail" &&
                        sourceData.rules?.fail_behavior === "route"
                      ? [
                          sourceData.rules.pass_route || "pass",
                          sourceData.rules.failure_route || "failed",
                        ]
                      : undefined;
          const used = next
            .filter((e) => e.source === connection.source && e.id !== oldEdge.id)
            .map((e) => (e.data as { route?: string })?.route)
            .filter(Boolean);
          const route = branchKeys?.length
            ? (branchKeys.find((r) => !used.includes(r)) ?? branchKeys[0])
            : undefined;
          next = next.map((e) =>
            e.id === oldEdge.id
              ? {
                  ...e,
                  label: route,
                  data: route ? { ...(e.data as object), route } : undefined,
                }
              : e
          );
        }
        return next;
      });
    },
    [isMobileViewport, record, setEdges]
  );

  const handleRenameCommit = useCallback(
    (nodeId: string, label: string) => {
      const current = nodesRef.current.find((n) => n.id === nodeId);
      // Committing an unchanged label is a no-op — don't record a phantom entry.
      if (current && (current.data as NodeData).label === label) {
        setRenamingNodeId(null);
        return;
      }
      record();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...(n.data as NodeData), label } } : n
        )
      );
      setRenamingNodeId(null);
    },
    [record, setNodes]
  );
  const handleRenameCancel = useCallback(() => setRenamingNodeId(null), []);

  const handlePeekOutput = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const screen = flowToScreenPosition({
        x: node.position.x + 210,
        y: node.position.y,
      });
      setOutputPeek({ nodeId, screen });
    },
    [flowToScreenPosition]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Never let global shortcuts fire while focus rests inside a Radix
      // overlay (dialog/popover/menu) — the target is a button, not editable.
      if (isInOverlay(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (e.repeat) return; // holding ⌘S must not queue multiple saves
        handleSave(false);
      }
      if (isMobileViewport) return; // layout locked on small screens
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditableTarget(e.target)) {
        e.preventDefault();
        handleDeleteSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedNodeIds.length > 0 && !isEditableTarget(e.target)) {
        e.preventDefault();
        duplicateNodes(selectedNodeIds);
      }
      if ((e.metaKey || e.ctrlKey) && !isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((key === "z" && e.shiftKey) || key === "y") {
          e.preventDefault();
          redo();
        } else if (key === "c") {
          if (selectedNodeIds.length > 0) {
            e.preventDefault();
            handleCopy();
          }
        } else if (key === "v") {
          if (hasClipboard()) {
            e.preventDefault();
            handlePaste();
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleSave,
    handleDeleteSelection,
    duplicateNodes,
    selectedNodeIds,
    isMobileViewport,
    undo,
    redo,
    handleCopy,
    handlePaste,
  ]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const runResult = nodeRunResults[node.id];
        const guardrailFailed = failedGuardrailIds.has(node.id);
        const nodeFailed = runResult?.status === "failed" || guardrailFailed;
        const completed =
          !!runResult &&
          node.id !== activeNodeId &&
          runResult.status === "completed" &&
          !guardrailFailed;
        const runtimeState = nodeFailed
          ? ("failed" as const)
          : completed
            ? ("completed" as const)
            : undefined;
        return {
          ...node,
          data: {
            ...(node.data as NodeData),
            isActive: node.id === activeNodeId,
            hasError: nodeFailed,
            errorMessage: nodeErrorMessages[node.id] ?? (runResult?.status === "failed" ? runResult.output ?? undefined : undefined),
            diffKind: diffHighlights?.[node.id] ?? undefined,
            runtimeState,
            peekAvailable: !!runResult,
            onPeekOutput: handlePeekOutput,
            isRenaming: node.id === renamingNodeId,
            onRenameCommit: handleRenameCommit,
            onRenameCancel: handleRenameCancel,
            onQuickAdd: isMobileViewport ? undefined : openQuickAddFromNode,
            onDuplicate: isMobileViewport ? undefined : handleDuplicateNode,
            onDelete: isMobileViewport ? undefined : requestDeleteNode,
          },
        };
      }),
    [
      nodes,
      activeNodeId,
      failedGuardrailIds,
      nodeErrorMessages,
      diffHighlights,
      nodeRunResults,
      renamingNodeId,
      handlePeekOutput,
      handleRenameCommit,
      handleRenameCancel,
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
  const selectedLabel =
    selectionCount > 1
      ? `${selectionCount} selected`
      : selectedNode
        ? (selectedNode.data as NodeData).label || selectedNode.id
        : selectedEdge
          ? "Connection selected"
          : "Nothing selected";

  const buildContextMenuItems = (menu: {
    kind: "node" | "edge" | "pane" | "selection";
    id?: string;
    flow: { x: number; y: number };
    screen: { x: number; y: number };
  }): ContextMenuItem[] => {
    if (menu.kind === "node" && menu.id) {
      const nodeId = menu.id;
      return [
        { label: "Rename", icon: PenLine, onSelect: () => setRenamingNodeId(nodeId) },
        {
          label: "Duplicate",
          icon: Copy,
          shortcut: "⌘D",
          onSelect: () => duplicateNodes([nodeId]),
        },
        {
          label: "Copy",
          icon: ClipboardPaste,
          shortcut: "⌘C",
          onSelect: () => {
            const node = nodesRef.current.find((n) => n.id === nodeId);
            if (node) {
              copyToClipboard([node], edgesRef.current);
              toast.success("Copied 1 node");
            }
          },
        },
        { label: "Add next node", icon: Plus, onSelect: () => openQuickAddFromNode(nodeId) },
        "separator",
        {
          label: "Delete",
          icon: Trash2,
          shortcut: "⌫",
          danger: true,
          onSelect: () => requestDeleteNode(nodeId),
        },
      ];
    }
    if (menu.kind === "edge" && menu.id) {
      const edgeId = menu.id;
      return [
        {
          label: "Edit label",
          icon: PenLine,
          onSelect: () => {
            setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
            setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edgeId })));
          },
        },
        "separator",
        {
          label: "Delete connection",
          icon: Trash2,
          danger: true,
          onSelect: () => handleDeleteEdge(edgeId),
        },
      ];
    }
    if (menu.kind === "selection") {
      const count = selectionCount;
      return [
        {
          label: `Duplicate ${count} item${count === 1 ? "" : "s"}`,
          icon: Copy,
          shortcut: "⌘D",
          onSelect: () => duplicateNodes(selectedNodeIds),
        },
        { label: "Copy", icon: ClipboardPaste, shortcut: "⌘C", onSelect: handleCopy },
        "separator",
        {
          label: `Delete ${count} item${count === 1 ? "" : "s"}`,
          icon: Trash2,
          shortcut: "⌫",
          danger: true,
          onSelect: handleDeleteSelection,
        },
      ];
    }
    return [
      {
        label: "Add node here",
        icon: Plus,
        onSelect: () => setQuickAdd({ screen: menu.screen, flow: menu.flow }),
      },
      {
        label: "Paste here",
        icon: ClipboardPaste,
        shortcut: "⌘V",
        disabled: !hasClipboard(),
        onSelect: () => handlePaste(menu.flow),
      },
      { label: "Select all", icon: MousePointer2, onSelect: handleSelectAll },
      "separator",
      { label: "Tidy layout", icon: Wand2, onSelect: handleTidyLayout },
      {
        label: "Fit view",
        icon: Maximize2,
        onSelect: () => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs }),
      },
    ];
  };

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
                {displayName}
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

        <div className="flex shrink-0 items-center justify-between gap-2">
          <HeaderActions
            onSave={() => handleSave(false)}
            onSaveAsNew={() => handleSave(true)}
            onImport={handleImportClick}
            onExport={handleExport}
            isSaving={isSaving}
          />
          <RunControl
            isRunning={isRunning}
            disabled={nodes.length === 0}
            onRun={handleRun}
            onStop={handleStop}
            runInput={runInput}
          />
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
              <WorkflowNameEditor
                workflowId={workflowId}
                name={displayName}
                onRenamed={setDisplayName}
              />
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
          <RunControl
            isRunning={isRunning}
            disabled={nodes.length === 0}
            onRun={handleRun}
            onStop={handleStop}
            runInput={runInput}
          />
          <HeaderActions
            onSave={() => handleSave(false)}
            onSaveAsNew={() => handleSave(true)}
            onImport={handleImportClick}
            onExport={handleExport}
            isSaving={isSaving}
          />
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />

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

        <div
          ref={reactFlowWrapper}
          className="canvas-bg relative flex-1"
          onPointerMove={(e) => {
            lastPointerRef.current = { x: e.clientX, y: e.clientY };
          }}
        >
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
          {/* Vignette: quiet radial darkening at pane edges. Sits over the wrapper,
              never over the pane, so React Flow hit-testing is untouched. */}
          <div
            aria-hidden
            className="canvas-vignette pointer-events-none absolute inset-0 z-[1]"
          />
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={handleNodesChange}
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
            selectionOnDrag={!isMobileViewport}
            selectionMode={SelectionMode.Partial}
            panOnDrag={isMobileViewport ? true : [1]}
            zoomOnDoubleClick={false}
            edgesReconnectable={!isMobileViewport}
            onReconnect={onReconnect}
            onNodeDragStart={() => record()}
            onSelectionDragStart={() => record()}
            onMove={() => {
              // Peek position is computed once at open; panning/zooming detaches
              // it, so close it on any viewport move.
              if (outputPeek) setOutputPeek(null);
            }}
            onNodeDoubleClick={(_, node) => {
              if (!isMobileViewport) setRenamingNodeId(node.id);
            }}
            onNodeContextMenu={(e, node) => openContextMenu("node", e, node.id)}
            onEdgeContextMenu={(e, edge) => openContextMenu("edge", e, edge.id)}
            onPaneContextMenu={(e) => openContextMenu("pane", e as React.MouseEvent)}
            onSelectionContextMenu={(e) => openContextMenu("selection", e)}
            connectionRadius={36}
            defaultEdgeOptions={{ type: "default" }}
            connectionLineComponent={ConnectionLine}
            onSelectionChange={handleSelectionChange}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            className="canvas-flow bg-background"
            proOptions={{ hideAttribution: true }}
          >
            {/* Two stacked layers (unique id per layer) for a quiet blueprint feel:
                a fine dot grid, plus a coarse line grid every ~110px underneath. */}
            <Background
              id="canvas-grid-coarse"
              variant={BackgroundVariant.Lines}
              gap={110}
              lineWidth={0.5}
              color="var(--canvas-grid)"
              className="opacity-40"
            />
            <Background
              id="canvas-grid-fine"
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.25}
              color="var(--canvas-grid)"
            />
            <MiniMap
              nodeColor={minimapNodeColor}
              nodeStrokeWidth={0}
              nodeBorderRadius={3}
              /* Theme-aware mask — dark hardcode looked like a white “screen” in light mode */
              maskColor="color-mix(in srgb, var(--bg) 78%, transparent)"
              pannable
              zoomable
              className="!overflow-hidden !rounded-lg !border !border-border !bg-surface-elevated !shadow-elev-1"
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
                  <span className="mt-1 flex items-center gap-1.5 text-2xs text-subtle">
                    <span>or press</span>
                    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-2xs">
                      ⌘K
                    </kbd>
                  </span>
                </button>
              </Panel>
            )}

            {isRunning && runStartedAt != null && (
              <Panel position="top-center" className="!mt-3">
                <RunProgressStrip
                  completed={Object.keys(nodeRunResults).length}
                  total={nodes.filter((n) => (n.data as NodeData).nodeType !== "note").length}
                  activeLabel={
                    activeNodeId
                      ? ((nodes.find((n) => n.id === activeNodeId)?.data as NodeData | undefined)
                          ?.label ?? activeNodeId)
                      : null
                  }
                  startedAt={runStartedAt}
                  onStop={handleStop}
                />
              </Panel>
            )}

            <Panel position="bottom-left" className="!m-4">
              {isMobileViewport ? (
                <div
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-elev-1"
                  role="group"
                  aria-label="Zoom"
                >
                  <button
                    type="button"
                    className="focus-ring flex h-8 w-8 items-center justify-center border-b border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    onClick={() => zoomIn({ duration: viewportAnimMs })}
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="focus-ring flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    onClick={() => zoomOut({ duration: viewportAnimMs })}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <CanvasToolbar
                  onTidy={handleTidyLayout}
                  onDelete={handleDeleteSelection}
                  deleteDisabled={selectionCount === 0}
                  tidyDisabled={nodes.length === 0}
                  animMs={viewportAnimMs}
                />
              )}
            </Panel>
          </ReactFlow>
          {quickAdd && (
            <QuickAddMenu
              position={quickAdd.screen}
              preferTriggers={nodes.length === 0}
              onSelect={handleQuickAddSelect}
              onClose={() => setQuickAdd(null)}
              workflowId={workflowId}
              sourceNodeId={quickAdd.sourceNodeId}
              graphContext={{
                nodes: nodes.map((n) => {
                  const d = n.data as NodeData;
                  return { id: n.id, nodeType: d.nodeType, label: d.label };
                }),
                edges: edges.map((e) => ({
                  source: e.source,
                  target: e.target,
                  route: (e.data as { route?: string } | undefined)?.route,
                })),
              }}
            />
          )}
          {contextMenu && (
            <CanvasContextMenu
              position={contextMenu.screen}
              items={buildContextMenuItems(contextMenu)}
              onClose={() => setContextMenu(null)}
            />
          )}
          {outputPeek && nodeRunResults[outputPeek.nodeId] && (
            <NodeOutputPeek
              position={outputPeek.screen}
              nodeLabel={
                ((nodes.find((n) => n.id === outputPeek.nodeId)?.data as NodeData | undefined)
                  ?.label ?? outputPeek.nodeId)
              }
              output={nodeRunResults[outputPeek.nodeId].output ?? ""}
              latencyMs={nodeRunResults[outputPeek.nodeId].latencyMs}
              guardrailStatus={nodeRunResults[outputPeek.nodeId].guardrailStatus}
              runId={currentRunIdRef.current}
              onClose={() => setOutputPeek(null)}
            />
          )}
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
          style={{ width: rightPanel.width }}
          className={cn(
            // animate-panel-in replays whenever the panel flips from
            // display:none to visible — an enter-only slide with no
            // AnimatePresence wrapper around the resizable flex column.
            "animate-panel-in relative shrink-0 flex-col border-l border-border bg-surface-elevated",
            rightSidebarOpen
              ? "fixed inset-y-0 right-0 z-40 flex max-w-[85vw] shadow-2xl"
              : selectionCount > 0 || showResults
                ? "hidden lg:flex"
                : "hidden"
          )}
        >
          {!rightSidebarOpen && (
            <div
              {...rightPanel.handleProps}
              className="absolute inset-y-0 -left-px z-10 hidden w-[3px] cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/30 lg:block"
            />
          )}
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
                {selectionCount > 1 ? (
                  <div className="space-y-3 rounded-lg border border-dashed border-border p-4 text-center">
                    <MousePointer2 className="mx-auto h-5 w-5 text-muted" aria-hidden />
                    <p className="text-sm font-medium text-foreground">{selectionCount} items selected</p>
                    <p className="text-xs text-muted">
                      Drag to move together, ⌘D duplicates, ⌘C copies, ⌫ deletes.
                    </p>
                  </div>
                ) : selectedEdge ? (
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
                              : sourceNodeData?.nodeType === "guardrail" &&
                                  sourceNodeData.rules?.fail_behavior === "route"
                                ? [
                                    sourceNodeData.rules.pass_route || "pass",
                                    sourceNodeData.rules.failure_route || "failed",
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

      <CanvasStatusBar
        editorStatus={editorStatus}
        statusTone={isRunning || isDirty ? "warning" : "success"}
        hint={
          isMobileViewport
            ? "Tap panels to configure and run"
            : "⌘S save · ⌫ delete · ⌘Z undo · right-click for actions"
        }
        nodeCount={nodes.length}
        edgeCount={edges.length}
        selectionCount={selectionCount}
        issues={validationIssues.map((issue) => ({ nodeId: issue.nodeId, message: issue.message }))}
        onIssueClick={focusNode}
      />

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
        title="Delete selection?"
        description={
          deleteConfirm
            ? `This will remove ${deleteConfirm.nodeIds.length} node${deleteConfirm.nodeIds.length === 1 ? "" : "s"}${deleteConfirm.edgeIds.length > 0 ? ` and ${deleteConfirm.edgeIds.length} connection${deleteConfirm.edgeIds.length === 1 ? "" : "s"}` : ""}. You can undo this with ⌘Z.`
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
