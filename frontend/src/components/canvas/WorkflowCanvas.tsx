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
  MousePointer2,
  PanelLeft,
  PenLine,
  Play,
  Plus,
  Settings2,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ConnectionLine } from "@/components/canvas/edges/ConnectionLine";
import { GradientEdge } from "@/components/canvas/edges/GradientEdge";
import { canvasNodeTypes, flowNodeTypeForData } from "@/components/canvas/nodes/node-types";
import { CanvasSidebar } from "@/components/canvas/CanvasSidebar";
import { type CanvasRailTab } from "@/components/canvas/CanvasRail";
import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import type { DiffKind } from "@/components/canvas/VersionDiffView";
import { EdgeInspector } from "@/components/canvas/EdgeInspector";
import { DRAG_TYPE } from "@/components/canvas/NodePalette";
import { QuickAddMenu } from "@/components/canvas/QuickAddMenu";
import {
  CanvasContextMenu,
  buildNodeRunMenuItems,
  type ContextMenuItem,
} from "@/components/canvas/CanvasContextMenu";
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
import { RunNodeResultCard } from "@/components/canvas/run/RunNodeResultCard";
import { PostRunTransport } from "@/components/canvas/run/RunProgressStrip";
import { RunDeck } from "@/components/canvas/run/RunDeck";
import { useRunReplay } from "@/components/canvas/run/useRunReplay";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
const NodeInspector = dynamic(
  () => import("@/components/canvas/NodeInspector").then((mod) => mod.NodeInspector),
  { ssr: false }
);
const RunResultsPanel = dynamic(
  () => import("@/components/results/RunResultsPanel").then((mod) => mod.RunResultsPanel),
  { ssr: false }
);
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import type { GraphDiff } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getNodeDefinition } from "@/lib/node-registry";
import { isEditableTarget, isInOverlay } from "@/lib/shortcuts";
import {
  formatValidationToast,
  getWorkflowValidationIssues,
} from "@/lib/workflow-validation";
import { readWorkflowExportFile, WorkflowImportError } from "@/lib/workflow-import";
import type { NodeData, WorkflowGraph, WorkflowRun, WorkflowVersion } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { useReducedMotionStrict } from "@/components/motion";
import { useQuery } from "@tanstack/react-query";
import { AssistRail } from "@/components/canvas/AssistRail";
import {
  ADD_NODE_EVENT,
  RUN_WORKFLOW_EVENT,
  TIDY_CANVAS_EVENT,
  FIT_VIEW_EVENT,
  OPEN_ASSIST_EVENT,
} from "@/components/layout/CommandPalette";

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

function isTerminalRunStatus(status: string | null | undefined): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
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
    deleteElements,
    getViewport,
    setViewport,
    setCenter,
  } = useReactFlow();

  const initialNodes = useMemo<Node[]>(() => graphToNodes(initialGraph), [initialGraph]);
  const initialEdges = useMemo<Edge[]>(() => graphToEdges(initialGraph), [initialGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [sidebarTab, setSidebarTab] = useState<CanvasRailTab>("nodes");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [canvasMode, setCanvasMode] = useState<"compose" | "run">("compose");
  const isRunLens = canvasMode === "run";
  const [runLensNodeId, setRunLensNodeId] = useState<string | null>(null);
  // Node the cursor is over in the run lens. Takes priority over selection so the
  // result card follows the hovered node; falls back to selection/active on leave.
  const [runLensHoverNodeId, setRunLensHoverNodeId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"configure" | "results">("configure");
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
  const [runLensAnchorRevision, setRunLensAnchorRevision] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState(workflowName);
  const [currentVersionId, setCurrentVersionId] = useState(versionId);
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [liveEvents, setLiveEvents] = useState<Array<Record<string, unknown>>>([]);
  const [observedStartNodeIds, setObservedStartNodeIds] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isRunStarting, setIsRunStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  // A run remains locked while a human decision is pending. `isRunning` tracks
  // active streaming only; this predicate protects the underlying graph for
  // the complete lifetime of a non-terminal run.
  const isRunLocked = isRunning || (!!run && !isTerminalRunStatus(run.status));
  const isCanvasReadOnly = isRunLens || isRunLocked;
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeIds: string[]; edgeIds: string[] } | null>(
    null
  );
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [canvasAnnouncement, setCanvasAnnouncement] = useState("");
  const [diffHighlights, setDiffHighlights] = useState<Record<string, DiffKind> | null>(null);
  const lastSavedGraphRef = useRef(JSON.stringify(toGraph(initialNodes, initialEdges)));
  const savedVersionIdRef = useRef(versionId);
  const [historicalVersionNumber, setHistoricalVersionNumber] = useState<number | null>(null);
  // MVP2: per-node telemetry overlay, pin/run-from-here, Assist rail, run replay.
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [pinnedOutputs, setPinnedOutputs] = useState<Record<string, string>>({});
  const [assistOpen, setAssistOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const replayInitRef = useRef(false);

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

  // The run input is shared by the persistent desktop controls.
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
  const runRecoveryTimerRef = useRef<number | null>(null);
  const runStartPendingRef = useRef(false);
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

  // Run replay: fetch the finished run's timeline (only while the transport is
  // open) and drive a pure scrubber controller. replayActive gates the memos.
  const replayRunId = run && !isRunLocked ? run.id : null;
  const timelineQuery = useQuery({
    queryKey: queryKeys.runTimeline(replayRunId ?? ""),
    queryFn: () => api.getRunTimeline(replayRunId as string),
    enabled: !!replayRunId && replayOpen,
    staleTime: 60_000,
  });
  const replay = useRunReplay({ timeline: timelineQuery.data });
  const replayActive = replayOpen && replay.steps.length > 0;

  // Per-node token/cost telemetry (for the on-canvas overlay), aggregated from
  // the run's LLM calls. Only fetched while the overlay is on.
  const telemetryRunId = run?.id ?? null;
  const llmCallsQuery = useQuery({
    queryKey: ["run-llm-calls", telemetryRunId] as const,
    queryFn: () => api.getRunLlmCalls(telemetryRunId as string),
    enabled: !!telemetryRunId && showTelemetry,
    staleTime: 60_000,
  });
  const llmCostByNode = useMemo(() => {
    const map: Record<string, { tokens: number; costUsd: number }> = {};
    for (const call of llmCallsQuery.data ?? []) {
      if (!call.node_id) continue;
      const prev = map[call.node_id] ?? { tokens: 0, costUsd: 0 };
      map[call.node_id] = {
        tokens: prev.tokens + (call.total_tokens ?? 0),
        costUsd: prev.costUsd + (call.cost_usd ?? 0),
      };
    }
    return map;
  }, [llmCallsQuery.data]);

  // Current graph, shared by the Assist rail and the inspector variable picker.
  const currentGraph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);

  // The Run Lens deliberately changes the canvas height. Let the flex layout
  // settle for two frames, then reframe the existing graph so lower nodes never
  // disappear behind the execution deck.
  useEffect(() => {
    let nextFrame: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        void fitView({
          padding: canvasMode === "run" ? 0.14 : 0.2,
          maxZoom: 1.2,
          duration: viewportAnimMs,
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (nextFrame != null) window.cancelAnimationFrame(nextFrame);
    };
  }, [canvasMode, fitView, viewportAnimMs]);

  // On opening replay, park the scrubber at the end (matches the final canvas)
  // so nothing jumps; the user scrubs back to watch. Reset when it closes.
  useEffect(() => {
    if (!replayOpen) {
      replayInitRef.current = false;
      return;
    }
    if (replay.steps.length > 0 && !replayInitRef.current) {
      replayInitRef.current = true;
      replay.setIndex(replay.steps.length - 1);
    }
  }, [replayOpen, replay.steps.length, replay.setIndex, replay]);

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
            active: replayActive
              ? !skipEdgeAnim &&
                (edge.source === replay.derived.currentNodeId ||
                  edge.target === replay.derived.currentNodeId)
              : !skipEdgeAnim && activeEdgeIds.has(edge.id),
            failed,
            sourceCompleted: replayActive
              ? !skipEdgeAnim && replay.derived.isSourceCompleted(edge.source)
              : !skipEdgeAnim && nodeRunResults[edge.source]?.status === "completed",
          },
          labelStyle: { fill: "var(--fg-muted)", fontSize: 11, fontWeight: 500 },
          labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.95 },
        };
      }),
    [
      edges,
      nodes,
      activeEdgeIds,
      failedGuardrailIds,
      skipEdgeAnim,
      nodeRunResults,
      replayActive,
      replay.derived,
    ]
  );

  const nodeTypes = useMemo(() => canvasNodeTypes, []);
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

  // Pointer drags record via onNodeDragStart (dragging === true on their
  // position changes). Arrow-key nudges arrive as position changes with
  // dragging !== true and no drag session — record those once, coalescing
  // held-arrow repeats under a shared key.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Run Lens permits selection so the operator can inspect a stage, but it
      // never forwards position/removal/replace changes into the editable graph.
      if (isCanvasReadOnly) {
        onNodesChange(changes.filter((change) => change.type === "select"));
        return;
      }
      const keyMove = changes.some(
        (c) => c.type === "position" && c.dragging !== true
      );
      if (keyMove) record("keymove");
      onNodesChange(changes);
    },
    [isCanvasReadOnly, onNodesChange, record]
  );

  const addNodeAtPosition = useCallback(
    (data: NodeData, position: { x: number; y: number }) => {
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
    [setNodes, record, setSelectedNodeId, setSelectedEdgeId]
  );

  const handleAddNode = useCallback(
    (data: NodeData) => {
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
    [setNodes, record, setSelectedNodeId, setSelectedEdgeId]
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
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const flow = { x: node.position.x + 280, y: node.position.y };
      const screen = flowToScreenPosition(flow);
      setQuickAdd({ screen, flow, sourceNodeId: nodeId });
    },
    [nodes, flowToScreenPosition]
  );

  const openQuickAddAtCenter = useCallback(() => {
    const rect = reactFlowWrapper.current?.getBoundingClientRect();
    const screen = rect
      ? { x: rect.x + rect.width / 2 - 144, y: rect.y + rect.height / 2 - 160 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setQuickAdd({ screen, flow: screenToFlowPosition(screen) });
  }, [screenToFlowPosition]);

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
      const inspectorInset = rightPanel.width + 48;
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
    [getViewport, setViewport, flowToScreenPosition, reduceMotion, rightPanel.width]
  );

  const handleQuickAddSelect = useCallback(
    (data: NodeData) => {
      if (!quickAdd) return;
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
    [quickAdd, setNodes, setEdges, makeEdge, ensureInView, record, setSelectedNodeId, setSelectedEdgeId]
  );

  /** Duplicate a set of nodes preserving intra-group connections. */
  const duplicateNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
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
    [setNodes, setEdges, record]
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
      if (isCanvasReadOnly) return;
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
    [
      isCanvasReadOnly,
      setNodes,
      setEdges,
      fitView,
      viewportAnimMs,
      history,
      setSelectedNodeId,
      setSelectedEdgeId,
    ]
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
    if (isCanvasReadOnly) return;
    if (isDirty) {
      setImportConfirmOpen(true);
      return;
    }
    importInputRef.current?.click();
  }, [isCanvasReadOnly, isDirty]);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (isCanvasReadOnly) return;
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
    [
      isCanvasReadOnly,
      setNodes,
      setEdges,
      fitView,
      viewportAnimMs,
      history,
      setSelectedNodeId,
      setSelectedEdgeId,
    ]
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
      if (canvasMode === "run" && selNodes[0]) setRunLensNodeId(selNodes[0].id);
      if ((selNodes[0] || selEdges[0]) && !isCanvasReadOnly) setRightTab("configure");
    },
    [canvasMode, isCanvasReadOnly]
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
    // Set true in the effect body (not just at useRef init): React 18 StrictMode
    // double-invokes effects on mount as setup → cleanup → setup, and the cleanup
    // flips this to false. Without re-setting it here, mountedRef stays false while
    // the component is very much mounted, so every handleRun bails at the
    // `if (!mountedRef.current) return` guard and a run hangs on "Starting".
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runSourceRef.current?.close();
      runSourceRef.current = null;
      if (runRecoveryTimerRef.current != null) {
        window.clearTimeout(runRecoveryTimerRef.current);
        runRecoveryTimerRef.current = null;
      }
    };
  }, []);

  const handleRun = useCallback(async (
    input: string,
    opts?: { startNodeId?: string; pinnedOutputs?: Record<string, string> }
  ) => {
    if (isRunLocked || runStartPendingRef.current) return;

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

    // Clear a previous terminal id before any await. Until createRun returns,
    // there is nothing safe to cancel, so the controls show a disabled
    // starting state rather than accidentally targeting the prior run.
    runStartPendingRef.current = true;
    currentRunIdRef.current = null;
    setIsRunStarting(true);

    // A run is its own working mode: preserve the editable graph while
    // shifting telemetry, output, and controls into the lower run lens. The
    // sidebar is hidden by the run-lens gate, so we leave sidebarOpen alone —
    // it restores to the user's choice when they return to compose.
    setCanvasMode("run");
    setAssistOpen(false);
    if (runRecoveryTimerRef.current != null) {
      window.clearTimeout(runRecoveryTimerRef.current);
      runRecoveryTimerRef.current = null;
    }
    setIsRunning(true);
    setLiveEvents([]);
    setObservedStartNodeIds([]);
    setQuickAdd(null);
    setContextMenu(null);
    setRenamingNodeId(null);
    setDeleteConfirm(null);
    setImportConfirmOpen(false);
    setRun(null);
    setReplayOpen(false);
    setActiveNodeId(null);
    setRunLensNodeId(null);
    setRunLensHoverNodeId(null);
    setNodeRunResults({});
    setOutputPeek(null);
    setRunStartedAt(Date.now());
    setRightTab("results");
    setShowResults(false);

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
        start_node_id: opts?.startNodeId,
        pinned_outputs: opts?.pinnedOutputs,
      });
      if (!mountedRef.current) {
        runStartPendingRef.current = false;
        return; // unmounted while createRun was in flight
      }
      setRun(createdRun);
      currentRunIdRef.current = createdRun.id;
      runStartPendingRef.current = false;
      setIsRunStarting(false);
      toast.info("Workflow started");

      runSourceRef.current?.close();
      runSourceRef.current = null;
      let streamClosed = false;
      // Track the last node that started so run_failed (which carries no
      // node_id) can attribute the failure to the node that was executing.
      let lastActiveNodeId: string | null = null;
      const streamedNodeResults: WorkflowRun["node_results"] = [];
      let recoveryNoticeShown = false;

      // The stream transport makes a few reconnect attempts itself. If that
      // budget is exhausted, reconcile the authoritative run record until it
      // reaches a terminal or approval state instead of stranding the canvas
      // in an unknowable pending state.
      const reconcileRunAfterStreamFailure = async (): Promise<void> => {
        if (!mountedRef.current || currentRunIdRef.current !== createdRun.id) return;

        try {
          const latestRun = await api.getRun(createdRun.id);
          if (!mountedRef.current || currentRunIdRef.current !== createdRun.id) return;

          setRun(latestRun);
          const recoveredNodeResults = latestRun.node_results ?? [];
          if (recoveredNodeResults.length) {
            setNodeRunResults((previous) => ({
              ...previous,
              ...Object.fromEntries(
                recoveredNodeResults.map((result) => [
                  result.node_id,
                  {
                    output: result.output ?? null,
                    latencyMs: result.latency_ms ?? null,
                    guardrailStatus: result.guardrail_status ?? null,
                    status: result.status,
                  },
                ])
              ),
            }));
          }

          if (isTerminalRunStatus(latestRun.status)) {
            setIsRunning(false);
            setActiveNodeId(null);
            currentRunIdRef.current = null;
            runRecoveryTimerRef.current = null;
            return;
          }
          if (latestRun.status === "awaiting_approval") {
            setIsRunning(false);
            setActiveNodeId(null);
            setRightTab("results");
            runRecoveryTimerRef.current = null;
            return;
          }

          // Keep the monitor live/locked while polling a still-active backend
          // run, even though its event transport is temporarily unavailable.
          setIsRunning(true);
        } catch {
          if (!recoveryNoticeShown) {
            recoveryNoticeShown = true;
            toast.warning("Live updates disconnected — checking run status…");
          }
        }

        if (!mountedRef.current || currentRunIdRef.current !== createdRun.id) return;
        runRecoveryTimerRef.current = window.setTimeout(() => {
          void reconcileRunAfterStreamFailure();
        }, 3_000);
      };

      const stream = api.streamRun(
        createdRun.id,
        (event) => {
        setLiveEvents((prev) => [
          ...prev.slice(-49),
          { ...event, received_at: new Date().toISOString() },
        ]);

        if (event.type === "node_started") {
          const startedNodeId = String(event.node_id);
          lastActiveNodeId = startedNodeId;
          setObservedStartNodeIds((previous) =>
            previous.includes(startedNodeId) ? previous : [...previous, startedNodeId]
          );
          setIsRunning(true);
          setActiveNodeId(startedNodeId);
          setRunLensNodeId(startedNodeId);
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
          event.type === "run_cancelled"
        ) {
          setIsRunning(false);
          setActiveNodeId(null);
          currentRunIdRef.current = null;
          if (runRecoveryTimerRef.current != null) {
            window.clearTimeout(runRecoveryTimerRef.current);
            runRecoveryTimerRef.current = null;
          }
          streamClosed = true;
          stream.close();
          runSourceRef.current = null;
        }
        // `stream_end` normally follows a terminal event. If it arrives on
        // its own (for example after an upstream reconnect), reconcile the
        // durable run instead of treating the transport close as a finished
        // workflow and leaving the graph locked on stale local state.
        if (event.type === "stream_end") {
          streamClosed = true;
          stream.close();
          runSourceRef.current = null;
          void reconcileRunAfterStreamFailure();
        }
      },
        () => {
          streamClosed = true;
          runSourceRef.current?.close();
          runSourceRef.current = null;
          void reconcileRunAfterStreamFailure();
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
      runStartPendingRef.current = false;
      setIsRunStarting(false);
      toast.error(error instanceof Error ? error.message : "Failed to start workflow");
      setIsRunning(false);
      runSourceRef.current?.close();
      runSourceRef.current = null;
      // If the run never got created (validation, save, or a 429 concurrency
      // rejection thrown by createRun), leave the run lens — an empty
      // "Starting" run must not linger on the canvas. A failure AFTER createRun
      // (e.g. stream setup) keeps run mode so the created run is still shown and
      // reconciled by the recovery path.
      if (!currentRunIdRef.current) {
        setRun(null);
        setActiveNodeId(null);
        setRunLensNodeId(null);
        setCanvasMode("compose");
      }
    }
  }, [workflowId, currentVersionId, nodes, edges, isRunLocked]);

  const handleStop = useCallback(async () => {
    if (isRunStarting) {
      toast.info("The run is still starting — try again in a moment.");
      return;
    }
    const runId = currentRunIdRef.current;
    if (!runId) return;
    let stopped = false;
    try {
      await api.cancelRun(runId);
      toast.warning("Stopping workflow…");
      setRun((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      currentRunIdRef.current = null;
      stopped = true;
    } catch (error) {
      // A run may have finished between the click and cancellation request.
      // Reconcile it before abandoning the active stream or recovery poll.
      try {
        const latestRun = await api.getRun(runId);
        setRun(latestRun);
        if (isTerminalRunStatus(latestRun.status)) {
          toast.info(`Run already ${latestRun.status}`);
          currentRunIdRef.current = null;
          stopped = true;
        } else {
          toast.error(error instanceof Error ? error.message : "Failed to cancel run");
        }
      } catch {
        toast.error(error instanceof Error ? error.message : "Failed to cancel run");
      }
    }

    if (stopped) {
      if (runRecoveryTimerRef.current != null) {
        window.clearTimeout(runRecoveryTimerRef.current);
        runRecoveryTimerRef.current = null;
      }
      runSourceRef.current?.close();
      runSourceRef.current = null;
      setIsRunning(false);
      setActiveNodeId(null);
    }
  }, [isRunStarting]);

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

  // MVP2 — pin output / run-from-here (authoring-only debugging).
  const handlePinOutput = useCallback((nodeId: string, output: string) => {
    setPinnedOutputs((prev) => {
      const next = { ...prev };
      if (nodeId in next) delete next[nodeId];
      else next[nodeId] = output;
      return next;
    });
  }, []);

  const handleRunFromHere = useCallback(
    (nodeId: string) => {
      void handleRun(runInput.composed, { startNodeId: nodeId, pinnedOutputs });
    },
    [handleRun, runInput.composed, pinnedOutputs]
  );

  // MVP2 — Assist rail: apply a proposed graph (with undo) / preview diff rings.
  const handleAssistApply = useCallback(
    (proposed: WorkflowGraph) => {
      record();
      setNodes(graphToNodes(proposed));
      setEdges(graphToEdges(proposed));
      setDiffHighlights(null);
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: viewportAnimMs }), 50);
    },
    [record, setNodes, setEdges, fitView, viewportAnimMs]
  );

  const handleAssistPreview = useCallback((diff: GraphDiff | null) => {
    if (!diff) {
      setDiffHighlights(null);
      return;
    }
    const map: Record<string, DiffKind> = {};
    diff.added_node_ids.forEach((id) => (map[id] = "added"));
    diff.removed_node_ids.forEach((id) => (map[id] = "removed"));
    diff.changed_node_ids.forEach((id) => (map[id] = "changed"));
    setDiffHighlights(map);
  }, []);

  // MVP2 — command-palette "Add node" drops a node from its registry type.
  const handleAddNodeFromType = useCallback(
    (nodeType: string) => {
      const def = getNodeDefinition(nodeType);
      if (!def) return;
      handleAddNode(structuredClone(def.defaultData));
    },
    [handleAddNode]
  );

  // MVP2 — canvas actions dispatched by the command palette (window events).
  useEffect(() => {
    const onAddNode = (e: Event) => {
      if (isCanvasReadOnly) return;
      const nodeType = (e as CustomEvent<{ nodeType?: string }>).detail?.nodeType;
      if (nodeType) handleAddNodeFromType(nodeType);
    };
    const onRun = () => {
      if (!isRunLocked && nodes.length > 0) void handleRun(runInput.composed);
    };
    const onTidy = () => {
      if (!isCanvasReadOnly) handleTidyLayout();
    };
    const onFit = () =>
      fitView({ padding: isRunLens ? 0.14 : 0.2, maxZoom: 1.2, duration: viewportAnimMs });
    const onAssist = () => {
      if (!isCanvasReadOnly) setAssistOpen(true);
    };
    window.addEventListener(ADD_NODE_EVENT, onAddNode as EventListener);
    window.addEventListener(RUN_WORKFLOW_EVENT, onRun);
    window.addEventListener(TIDY_CANVAS_EVENT, onTidy);
    window.addEventListener(FIT_VIEW_EVENT, onFit);
    window.addEventListener(OPEN_ASSIST_EVENT, onAssist);
    return () => {
      window.removeEventListener(ADD_NODE_EVENT, onAddNode as EventListener);
      window.removeEventListener(RUN_WORKFLOW_EVENT, onRun);
      window.removeEventListener(TIDY_CANVAS_EVENT, onTidy);
      window.removeEventListener(FIT_VIEW_EVENT, onFit);
      window.removeEventListener(OPEN_ASSIST_EVENT, onAssist);
    };
  }, [
    handleAddNodeFromType,
    handleRun,
    handleTidyLayout,
    fitView,
    viewportAnimMs,
    isRunLocked,
    nodes.length,
    runInput.composed,
    isRunLens,
    isCanvasReadOnly,
  ]);

  const executeDelete = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      if (isCanvasReadOnly) {
        setDeleteConfirm(null);
        return;
      }
      record();
      deleteElements({
        nodes: nodeIds.map((id) => ({ id })),
        edges: edgeIds.map((id) => ({ id })),
      });
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [isCanvasReadOnly, deleteElements, record, setSelectedNodeId, setSelectedEdgeId]
  );

  const handleDeleteSelection = useCallback(() => {
    if (isCanvasReadOnly) return;
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
  }, [isCanvasReadOnly, nodes, edges, selectedNodeIds, selectedEdgeIds, executeDelete]);

  /** Node-toolbar delete: confirm a single node by id. */
  const requestDeleteNode = useCallback(
    (nodeId: string) => {
      if (!isCanvasReadOnly) setDeleteConfirm({ nodeIds: [nodeId], edgeIds: [] });
    },
    [isCanvasReadOnly]
  );

  const handleCopy = useCallback(() => {
    const selected = nodesRef.current.filter((n) => n.selected || selectedNodeIds.includes(n.id));
    if (selected.length === 0) return;
    const count = copyToClipboard(selected, edgesRef.current);
    toast.success(`Copied ${count} node${count === 1 ? "" : "s"}`);
  }, [selectedNodeIds]);

  const handlePaste = useCallback(
    (anchorFlow?: { x: number; y: number }) => {
      if (!hasClipboard()) return;
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
    [screenToFlowPosition, record, setNodes, setEdges]
  );

  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.selected ? n : { ...n, selected: true })));
  }, [setNodes]);

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
      event.preventDefault();
      const screen = { x: event.clientX, y: event.clientY };
      setContextMenu({ kind, id, screen, flow: screenToFlowPosition(screen) });
    },
    [screenToFlowPosition]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
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
    [record, setEdges]
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
      // The runtime view is intentionally read-only. Selection remains useful,
      // but authoring shortcuts must not change the version being observed.
      if (isCanvasReadOnly) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (e.repeat) return; // holding ⌘S must not queue multiple saves
        handleSave(false);
      }
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
    undo,
    redo,
    handleCopy,
    handlePaste,
    isCanvasReadOnly,
  ]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const runResult = nodeRunResults[node.id];
        const guardrailFailed = failedGuardrailIds.has(node.id);

        // Replay overrides live run state while the scrubber is active.
        const replayState = replayActive ? replay.derived.nodeStates[node.id] : undefined;
        const nodeFailed = replayActive
          ? replayState === "failed"
          : runResult?.status === "failed" || guardrailFailed;
        let runtimeState: "failed" | "completed" | undefined;
        if (replayActive) {
          runtimeState =
            replayState === "failed"
              ? "failed"
              : replayState === "completed"
                ? "completed"
                : undefined;
        } else {
          const completed =
            !!runResult &&
            node.id !== activeNodeId &&
            runResult.status === "completed" &&
            !guardrailFailed;
          runtimeState = nodeFailed ? "failed" : completed ? "completed" : undefined;
        }
        const isActive = replayActive
          ? replay.derived.currentNodeId === node.id
          : node.id === activeNodeId;

        // Per-node telemetry chips (opt-in): replay uses its own snapshot; the
        // live/final view merges node latency with aggregated LLM token/cost.
        let telemetry: { tokens?: number; costUsd?: number; latencyMs?: number } | undefined;
        if (showTelemetry) {
          if (replayActive) {
            telemetry = replay.derived.nodeTelemetry[node.id];
          } else if (runResult) {
            const cost = llmCostByNode[node.id];
            telemetry = {
              latencyMs: runResult.latencyMs ?? undefined,
              tokens: cost?.tokens,
              costUsd: cost?.costUsd,
            };
          }
        }

        return {
          ...node,
          data: {
            ...(node.data as NodeData),
            isActive,
            hasError: nodeFailed,
            errorMessage: nodeErrorMessages[node.id] ?? (runResult?.status === "failed" ? runResult.output ?? undefined : undefined),
            diffKind: diffHighlights?.[node.id] ?? undefined,
            runtimeState,
            telemetry,
            showTelemetry,
            // Keep the runtime graph legible: it exposes stage state and
            // selection only, never authoring or debug controls.
            pinned: !isCanvasReadOnly && !!pinnedOutputs[node.id],
            peekAvailable: !isCanvasReadOnly && !!runResult,
            onPeekOutput: isCanvasReadOnly ? undefined : handlePeekOutput,
            isRenaming: !isCanvasReadOnly && node.id === renamingNodeId,
            onRenameCommit: isCanvasReadOnly ? undefined : handleRenameCommit,
            onRenameCancel: isCanvasReadOnly ? undefined : handleRenameCancel,
            onQuickAdd: isCanvasReadOnly ? undefined : openQuickAddFromNode,
            onDuplicate: isCanvasReadOnly ? undefined : handleDuplicateNode,
            onDelete: isCanvasReadOnly ? undefined : requestDeleteNode,
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
      openQuickAddFromNode,
      handleDuplicateNode,
      requestDeleteNode,
      replayActive,
      replay.derived,
      showTelemetry,
      pinnedOutputs,
      llmCostByNode,
      isCanvasReadOnly,
    ]
  );

  const sourceNodeData = selectedEdge
    ? (nodes.find((n) => n.id === selectedEdge.source)?.data as NodeData | undefined)
    : undefined;
  const editorStatus = isRunLocked
    ? run?.status === "awaiting_approval"
      ? "Review"
      : "Running"
    : isDirty
      ? "Unsaved"
      : historicalVersionNumber != null
        ? `Viewing v${historicalVersionNumber}`
        : "Saved";
  const runDeckNodes = useMemo(
    () =>
      nodes
        .filter((node) => (node.data as NodeData).nodeType !== "note")
        .map((node) => ({
          id: node.id,
          label: (node.data as NodeData).label || node.id,
        })),
    [nodes]
  );
  const runLensResultCard = useMemo(() => {
    if (!isRunLens) return null;

    // Hover wins so the card tracks whichever node the cursor is over; when not
    // hovering it falls back to the selected node, then the active (running) one.
    const nodeId = runLensHoverNodeId ?? runLensNodeId ?? activeNodeId;
    if (!nodeId) return null;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return null;

    const streamedResult = nodeRunResults[nodeId];
    const persistedResult = (run?.node_results ?? []).find((result) => result.node_id === nodeId);
    const result =
      streamedResult ??
      (persistedResult
        ? {
            output: persistedResult.output,
            latencyMs: persistedResult.latency_ms,
            guardrailStatus: persistedResult.guardrail_status,
            status: persistedResult.status,
          }
        : null);
    const isActive = isRunning && activeNodeId === nodeId;
    if (!result && !isActive) return null;

    return {
      nodeId,
      revision: runLensAnchorRevision,
      nodeLabel: (node.data as NodeData).label || nodeId,
      position: flowToScreenPosition({
        x: node.position.x + 6,
        y: node.position.y + 112,
      }),
      status: isActive ? "running" : result?.status ?? "pending",
      output: result?.output ?? null,
      latencyMs: result?.latencyMs ?? null,
    };
  }, [
    activeNodeId,
    flowToScreenPosition,
    isRunLens,
    isRunning,
    nodeRunResults,
    nodes,
    run?.node_results,
    runLensAnchorRevision,
    runLensNodeId,
    runLensHoverNodeId,
  ]);

  const openFullRunResults = useCallback(() => {
    // An actively streaming run stays in the deck. A paused approval can open
    // the inspector, but `isRunLocked` still keeps its graph read-only.
    if (isRunning) return;
    setCanvasMode("compose");
    setSidebarOpen(false);
    setRightTab("results");
    setShowResults(true);
  }, [isRunning]);

  const handleRunUpdate = useCallback((nextRun: WorkflowRun) => {
    setRun(nextRun);
    if (nextRun.status === "running") {
      // Approving a paused run resumes its existing stream. Return directly to
      // the Run Lens so the canvas remains a read-only monitor while it does.
      setIsRunning(true);
      setCanvasMode("run");
      setSidebarOpen(false);
      setAssistOpen(false);
      setShowResults(false);
      currentRunIdRef.current = nextRun.id;
      return;
    }
    if (nextRun.status === "completed" || nextRun.status === "failed" || nextRun.status === "cancelled") {
      setIsRunning(false);
      if (currentRunIdRef.current === nextRun.id) currentRunIdRef.current = null;
    }
  }, []);

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
        ...buildNodeRunMenuItems({
          nodeId,
          output: nodeRunResults[nodeId]?.output ?? null,
          pinned: !!pinnedOutputs[nodeId],
          onPinOutput: handlePinOutput,
          onRunFromHere: handleRunFromHere,
        }),
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
      <header className="relative z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface-elevated/95 px-4 shadow-[0_1px_0_var(--surface-highlight)] backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="focus-ring flex h-8 shrink-0 items-center gap-2 rounded-md px-1.5 text-foreground transition-colors hover:bg-surface-hover"
            title="Back to workflows"
          >
            <ArrowLeft className="h-4 w-4 text-muted" />
            <span className="text-base font-semibold tracking-tight">Aegis</span>
          </Link>
          <span className="h-5 w-px bg-border" aria-hidden />
          <div className="flex min-w-0 items-center gap-2">
            <WorkflowNameEditor
              workflowId={workflowId}
              name={displayName}
              onRenamed={setDisplayName}
              disabled={isCanvasReadOnly}
            />
            <span
              className={cn(
                "hidden shrink-0 items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.08em] sm:inline-flex",
                isRunLocked ? "text-active" : isDirty ? "text-warning" : "text-success"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full bg-current", isRunning && "animate-pulse")} />
              {isRunLocked ? (run?.status === "awaiting_approval" ? "Review" : "Live") : editorStatus}
            </span>
          </div>
        </div>

        <div
          className="absolute left-1/2 hidden -translate-x-1/2 items-center rounded-md border border-border bg-background/35 p-0.5 sm:flex"
          role="group"
          aria-label="Canvas mode"
        >
          <button
            type="button"
            onClick={() => setCanvasMode("compose")}
            disabled={isRunLocked}
            aria-pressed={!isRunLens}
            className={cn(
              "focus-ring rounded-[3px] px-4 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              !isRunLens ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
            )}
          >
            Compose
          </button>
          <button
            type="button"
            onClick={() => {
              setCanvasMode("run");
              setSidebarOpen(false);
              setAssistOpen(false);
            }}
            aria-pressed={isRunLens}
            className={cn(
              "focus-ring inline-flex items-center gap-2 rounded-[3px] px-4 py-1.5 text-sm transition-colors",
              isRunLens ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
            )}
          >
            Run
            {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-active" />}
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <RunControl
            isRunning={isRunLocked}
            isStarting={isRunStarting}
            disabled={nodes.length === 0}
            onRun={handleRun}
            onStop={handleStop}
            runInput={runInput}
          />
          {!isCanvasReadOnly && (
            <HeaderActions
              workflowId={workflowId}
              versionId={currentVersionId}
              onSave={() => handleSave(false)}
              onSaveAsNew={() => handleSave(true)}
              onImport={handleImportClick}
              onExport={handleExport}
              isSaving={isSaving}
            />
          )}
        </div>
      </header>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isRunLens && sidebarOpen && (
          <CanvasSidebar
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            onCollapse={() => setSidebarOpen(false)}
            onAddNode={handleAddNode}
            workflowId={workflowId}
            currentVersionId={currentVersionId}
            onSelectVersion={handleVersionSelect}
            onDiffHighlight={setDiffHighlights}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {!isRunLens && !sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show workflow tools"
                title="Show workflow tools"
                className="focus-ring absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-elevated text-muted shadow-elev-1 transition-colors duration-1 hover:bg-surface-hover hover:text-foreground"
              >
                <PanelLeft className="h-[17px] w-[17px]" strokeWidth={1.65} aria-hidden />
              </button>
            )}

            <div
              ref={reactFlowWrapper}
              className="canvas-bg relative min-w-0 flex-1"
          onPointerMove={(e) => {
            lastPointerRef.current = { x: e.clientX, y: e.clientY };
          }}
        >
          {historicalVersionNumber != null && (
            <div className="absolute inset-x-0 top-0 z-20 flex flex-col">
              <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-foreground">
                You&apos;re viewing version {historicalVersionNumber}. Save to make this the
                current version.
              </div>
            </div>
          )}
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={isCanvasReadOnly ? undefined : onEdgesChange}
            onConnect={isCanvasReadOnly ? undefined : onConnect}
            onConnectEnd={isCanvasReadOnly ? undefined : onConnectEnd}
            onDragOver={isCanvasReadOnly ? undefined : onDragOver}
            onDrop={isCanvasReadOnly ? undefined : onDrop}
            nodeTypes={nodeTypes}
            edgeTypes={memoizedEdgeTypes}
            nodesDraggable={!isCanvasReadOnly}
            nodesConnectable={!isCanvasReadOnly}
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode={null}
            panOnScroll
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1]}
            zoomOnDoubleClick={false}
            edgesReconnectable={!isCanvasReadOnly}
            onReconnect={isCanvasReadOnly ? undefined : onReconnect}
            onNodeDragStart={isCanvasReadOnly ? undefined : () => record()}
            onSelectionDragStart={isCanvasReadOnly ? undefined : () => record()}
            onMove={() => {
              // Peek position is computed once at open; panning/zooming detaches
              // it, so close it on any viewport move.
              if (outputPeek) setOutputPeek(null);
            }}
            onMoveEnd={() => {
              if (isRunLens && (runLensNodeId || activeNodeId)) {
                setRunLensAnchorRevision((revision) => revision + 1);
              }
            }}
            onNodeDoubleClick={isCanvasReadOnly ? undefined : (_, node) => setRenamingNodeId(node.id)}
            onNodeMouseEnter={isRunLens ? (_, node) => setRunLensHoverNodeId(node.id) : undefined}
            onNodeMouseLeave={isRunLens ? () => setRunLensHoverNodeId(null) : undefined}
            onNodeContextMenu={isCanvasReadOnly ? undefined : (e, node) => openContextMenu("node", e, node.id)}
            onEdgeContextMenu={isCanvasReadOnly ? undefined : (e, edge) => openContextMenu("edge", e, edge.id)}
            onPaneContextMenu={isCanvasReadOnly ? undefined : (e) => openContextMenu("pane", e as React.MouseEvent)}
            onSelectionContextMenu={isCanvasReadOnly ? undefined : (e) => openContextMenu("selection", e)}
            connectionRadius={36}
            defaultEdgeOptions={{ type: "default" }}
            connectionLineComponent={ConnectionLine}
            onSelectionChange={handleSelectionChange}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1.35 }}
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
            {!isRunLens && (
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
            )}

            {!isCanvasReadOnly && nodes.length === 0 && (
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

            {!isCanvasReadOnly && !isRunning && replayRunId && (
              <Panel position="top-center" className="!mt-3">
                {replayOpen ? (
                  timelineQuery.isLoading || replay.steps.length === 0 ? (
                    <div className="rounded-full glass-panel px-3 py-1.5 font-mono text-2xs text-muted shadow-elev-2">
                      Loading replay…
                    </div>
                  ) : (
                    <PostRunTransport replay={replay} onClose={() => setReplayOpen(false)} />
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplayOpen(true)}
                    className="focus-ring flex items-center gap-1.5 rounded-full glass-panel px-3 py-1.5 text-xs text-muted shadow-elev-2 transition-colors duration-1 hover:text-foreground"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Replay run
                  </button>
                )}
              </Panel>
            )}

            {!isCanvasReadOnly && (
              <Panel position="bottom-left" className="!m-4">
                <CanvasToolbar
                  onTidy={handleTidyLayout}
                  onDelete={handleDeleteSelection}
                  deleteDisabled={selectionCount === 0}
                  tidyDisabled={nodes.length === 0}
                  animMs={viewportAnimMs}
                  showTelemetry={showTelemetry}
                  onToggleTelemetry={setShowTelemetry}
                />
              </Panel>
            )}
          </ReactFlow>
          {isRunLens && runLensResultCard && (
            <RunNodeResultCard
              key={`${runLensResultCard.nodeId}-${runLensResultCard.revision}`}
              position={runLensResultCard.position}
              nodeLabel={runLensResultCard.nodeLabel}
              status={runLensResultCard.status}
              output={runLensResultCard.output}
              latencyMs={runLensResultCard.latencyMs}
            />
          )}
          {!isCanvasReadOnly && quickAdd && (
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
          {!isCanvasReadOnly && contextMenu && (
            <CanvasContextMenu
              position={contextMenu.screen}
              items={buildContextMenuItems(contextMenu)}
              onClose={() => setContextMenu(null)}
            />
          )}
          {!isCanvasReadOnly && outputPeek && nodeRunResults[outputPeek.nodeId] && (
            <NodeOutputPeek
              position={outputPeek.screen}
              nodeLabel={
                ((nodes.find((n) => n.id === outputPeek.nodeId)?.data as NodeData | undefined)
                  ?.label ?? outputPeek.nodeId)
              }
              output={nodeRunResults[outputPeek.nodeId].output ?? ""}
              latencyMs={nodeRunResults[outputPeek.nodeId].latencyMs}
              guardrailStatus={nodeRunResults[outputPeek.nodeId].guardrailStatus}
              runId={run?.id ?? null}
              nodeId={outputPeek.nodeId}
              pinned={!!pinnedOutputs[outputPeek.nodeId]}
              onPinOutput={handlePinOutput}
              onRunFromHere={handleRunFromHere}
              onClose={() => setOutputPeek(null)}
            />
          )}
          {!isCanvasReadOnly && (
            <div className="absolute inset-y-0 right-0 z-20 flex">
              <AssistRail
                open={assistOpen}
                onOpenChange={setAssistOpen}
                workflowId={workflowId}
                graph={currentGraph}
                onApply={handleAssistApply}
                onPreviewDiff={handleAssistPreview}
              />
            </div>
          )}
        </div>

        <div
          style={{ width: rightPanel.width }}
          className={cn(
            // animate-panel-in replays whenever the panel flips from
            // display:none to visible — an enter-only slide with no
            // AnimatePresence wrapper around the resizable flex column.
            "animate-panel-in relative shrink-0 flex-col border-l border-border bg-surface-elevated",
            !isRunLens && ((!isCanvasReadOnly && selectionCount > 0) || showResults) ? "flex" : "hidden"
          )}
        >
          <div
            {...rightPanel.handleProps}
            className="absolute inset-y-0 -left-px z-10 block w-[3px] cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/30"
          />
          <div className="flex border-b border-border bg-background/25">
            <div className="flex flex-1" role="tablist" aria-label="Canvas panels">
            <button
              type="button"
              role="tab"
              id="canvas-right-tab-configure"
              aria-selected={rightTab === "configure"}
              aria-controls="canvas-right-panel-configure"
              onClick={() => setRightTab("configure")}
              disabled={isCanvasReadOnly}
              className={cn(
                "tab-trigger disabled:cursor-not-allowed disabled:opacity-45",
                rightTab === "configure" && "tab-trigger-active"
              )}
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
                <span className="h-2 w-2 animate-pulse rounded-full bg-active" />
              )}
            </button>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Close panel"
              className="focus-ring px-3 text-muted transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === "configure" && !isCanvasReadOnly ? (
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
                    onDelete={handleDeleteEdge}
                  />
                ) : (
                  <NodeInspector
                    nodeId={selectedNodeId}
                    data={selectedData}
                    workflowId={workflowId}
                    fieldErrors={selectedNodeFieldErrors}
                    onChange={handleNodeDataChange}
                    graph={currentGraph}
                    lastRunResults={run?.node_results}
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
                  onRunUpdate={handleRunUpdate}
                />
              </div>
            )}
          </div>
        </div>
        </div>
          {isRunLens && (
            <RunDeck
              nodes={runDeckNodes}
              run={run}
              liveEvents={liveEvents}
              observedStartNodeIds={observedStartNodeIds}
              isRunning={isRunning}
              isStarting={isRunStarting}
              activeNodeId={activeNodeId}
              selectedNodeId={runLensNodeId}
              nodeRunResults={nodeRunResults}
              startedAt={runStartedAt}
              onStop={handleStop}
              onSelectNode={setRunLensNodeId}
              onOpenTrace={openFullRunResults}
              className="h-[42%] min-h-[320px] lg:min-h-[360px]"
              approvalSlot={
                run?.status === "awaiting_approval" ? (
                  <button
                    type="button"
                    onClick={openFullRunResults}
                    className="focus-ring inline-flex h-7 items-center rounded-md border border-active/40 bg-active/10 px-2 text-2xs font-medium text-active transition-colors duration-1 hover:bg-active/15"
                  >
                    Review approval
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>

      {isRunLens ? (
        <span data-tour="status-bar" className="sr-only">
          Run status is shown in the execution deck.
        </span>
      ) : (
        <CanvasStatusBar
          editorStatus={editorStatus}
          statusTone={isRunning ? "active" : isDirty ? "warning" : "success"}
          hint="⌘S save · ⌫ delete · ⌘Z undo · right-click for actions"
          nodeCount={nodes.length}
          edgeCount={edges.length}
          selectionCount={selectionCount}
          issues={validationIssues.map((issue) => ({ nodeId: issue.nodeId, message: issue.message }))}
          onIssueClick={focusNode}
        />
      )}

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
