/**
 * Pure graph helpers for the workflow canvas: id allocation, grouping-frame
 * geometry, edge splicing, and React Flow <-> persisted WorkflowGraph
 * conversion (incl. the unsaved-changes signature). No React, no state —
 * extracted from WorkflowCanvas.tsx so they can be read and tested alone.
 */
import type { Edge, Node } from "@xyflow/react";
import { flowNodeTypeForData } from "@/components/canvas/nodes/node-types";
import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import type { NodeData, WorkflowGraph } from "@/types/workflow";

export function minimapNodeColor(node: Node): string {
  const nodeType = (node.data as NodeData)?.nodeType;
  return CATEGORY_COLOR_VAR[categorize(nodeType ?? "agent")];
}

export function nextNodeId(existingNodes: Node[]): string {
  let max = 0;
  for (const node of existingNodes) {
    const match = /^node_(\d+)$/.exec(node.id);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `node_${max + 1}`;
}

export function isTerminalRunStatus(status: string | null | undefined): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export const DEFAULT_NODE_W = 208;
export const DEFAULT_NODE_H = 76;

// Grouping-frame geometry (shared by creation + live refit so they stay in sync).
export const GROUP_PAD = 28;
export const GROUP_LABEL_ROOM = 16; // extra top padding so the label clears members
export const MIN_GROUP_W = 180;
export const MIN_GROUP_H = 120;
// A collapsed frame renders as a compact card (display-only size override).
export const COLLAPSED_GROUP_W = 200;
export const COLLAPSED_GROUP_H = 64;

/** Node types that cannot be spliced into an edge (no free source+target pair). */
export const SPLICE_INELIGIBLE = new Set(["trigger", "end", "note", "group"]);
export function isSpliceEligibleType(nodeType: string | undefined): boolean {
  return !!nodeType && !SPLICE_INELIGIBLE.has(nodeType);
}

export function nodeSize(node: Node): { w: number; h: number } {
  return {
    w: node.measured?.width ?? node.width ?? DEFAULT_NODE_W,
    h: node.measured?.height ?? node.height ?? DEFAULT_NODE_H,
  };
}

/** Absolute (canvas) top-left of a node, accounting for a group parent's offset. */
export function absolutePosition(node: Node, byId: Map<string, Node>): { x: number; y: number } {
  if (node.parentId) {
    const parent = byId.get(node.parentId);
    if (parent) {
      return { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y };
    }
  }
  return { x: node.position.x, y: node.position.y };
}

/**
 * Live-refit a grouping frame around its members (Task 1). Recomputes the frame
 * bounding box from members' relative positions + dimensions (+ padding, min
 * size), then moves the frame and shifts every member by the inverse so their
 * ABSOLUTE positions never jump — the frame moves around the content, the
 * content stays put. Returns a new nodes array, or the same array if nothing
 * changed. No history side effects: callers fold this into an existing snapshot.
 */
export function refitGroupNodes(nds: Node[], groupId: string): Node[] {
  const group = nds.find((n) => n.id === groupId);
  if (!group || (group.data as NodeData).nodeType !== "group") return nds;
  const children = nds.filter((n) => n.parentId === groupId);
  if (children.length === 0) return nds;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    const s = nodeSize(child);
    // Child positions are already relative to the group's top-left.
    minX = Math.min(minX, child.position.x);
    minY = Math.min(minY, child.position.y);
    maxX = Math.max(maxX, child.position.x + s.w);
    maxY = Math.max(maxY, child.position.y + s.h);
  }

  const padTop = GROUP_PAD + GROUP_LABEL_ROOM;
  // Shift so the content sits at (GROUP_PAD, padTop) inside the refitted frame.
  const dx = minX - GROUP_PAD;
  const dy = minY - padTop;
  const width = Math.max(maxX - minX + GROUP_PAD * 2, MIN_GROUP_W);
  const height = Math.max(maxY - minY + GROUP_PAD + padTop, MIN_GROUP_H);

  const curW = typeof group.style?.width === "number" ? group.style.width : undefined;
  const curH = typeof group.style?.height === "number" ? group.style.height : undefined;
  if (dx === 0 && dy === 0 && curW === width && curH === height) return nds;

  const newGroupX = group.position.x + dx;
  const newGroupY = group.position.y + dy;
  return nds.map((n) => {
    if (n.id === groupId) {
      return {
        ...n,
        position: { x: newGroupX, y: newGroupY },
        style: { ...(n.style ?? {}), width, height },
        data: { ...(n.data as NodeData), groupWidth: width, groupHeight: height },
      };
    }
    if (n.parentId === groupId) {
      return { ...n, position: { x: n.position.x - dx, y: n.position.y - dy } };
    }
    return n;
  });
}

/** Squared distance from point P to segment AB, clamped to the segment. */
export function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Splice a node into an existing edge: A→B becomes A→N + N→B, with the original
 * edge removed. The upstream segment A→N inherits A→B's route/label/data (the
 * route belongs to the upstream branch); N→B is a fresh edge. Returns the new
 * edge array, or null when the target edge is missing or would self-loop.
 */
export function spliceNodeIntoEdge(
  eds: Edge[],
  nodeId: string,
  edgeId: string,
  makeFreshEdge: (source: string, target: string) => Edge
): Edge[] | null {
  const edge = eds.find((e) => e.id === edgeId);
  if (!edge) return null;
  if (edge.source === nodeId || edge.target === nodeId) return null;
  const upstream: Edge = {
    ...edge,
    id: `e-${edge.source}-${nodeId}-${Date.now()}`,
    target: nodeId,
    targetHandle: null,
  };
  const downstream = makeFreshEdge(nodeId, edge.target);
  return [...eds.filter((e) => e.id !== edgeId), upstream, downstream];
}

export function toGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data as NodeData,
      // Grouping membership round-trips through the normal save (backend
      // tolerates it). Positions are already parent-relative when parentId is set.
      ...(node.parentId ? { parentId: node.parentId } : {}),
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

/**
 * Keys the canvas injects into `node.data` for rendering only — run state,
 * telemetry, diff rings and interaction callbacks (see `displayNodes` below and
 * `ExtendedNodeData` in nodes/BaseNode.tsx). They never belong to the persisted
 * graph, so the unsaved-changes comparison must not see them.
 */
export const EPHEMERAL_NODE_DATA_KEYS = new Set([
  "isActive",
  "hasError",
  "errorMessage",
  "runtimeState",
  "startedAt",
  "category",
  "diffKind",
  "isRenaming",
  "peekAvailable",
  "telemetry",
  "showTelemetry",
  "pinned",
  "lintIssues",
  "onQuickAdd",
  "onDuplicate",
  "onDelete",
  "onRenameCommit",
  "onRenameCancel",
  "onPeekOutput",
  "onToggleCollapse",
  "memberCount",
  "aggregateStatus",
]);

/**
 * Stable, persisted-only projection of the graph, used as the "is this edited?"
 * signature. React Flow keeps plenty of state on its node/edge objects that is
 * not part of the workflow — `selected`, `dragging`, `measured`/`width`/
 * `height` — and the canvas layers display-only fields into `data`; comparing
 * raw React Flow state made a bare node click read as an unsaved edit and
 * raised the browser's "Leave site?" guard on a read-only visit. Keys are
 * emitted in sorted order so re-created objects can't differ by key order
 * alone, and functions/undefined are dropped.
 */
export function persistedNodeData(data: NodeData): Record<string, unknown> {
  const source = (data ?? {}) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (EPHEMERAL_NODE_DATA_KEYS.has(key)) continue;
    const value = source[key];
    if (value === undefined || typeof value === "function") continue;
    out[key] = value;
  }
  return out;
}

/**
 * Serialized `persistedNodeData`, cached by `node.data` identity. React Flow
 * replaces node objects on every drag frame but keeps `data` by reference, so
 * the per-node sort + stringify only re-runs for nodes whose data was edited.
 */
export const persistedNodeDataJsonCache = new WeakMap<object, string>();

export function persistedNodeDataJson(data: NodeData): string {
  const key = data as unknown as object | null | undefined;
  if (key === null || key === undefined || typeof key !== "object") {
    return JSON.stringify(persistedNodeData(data));
  }
  let json = persistedNodeDataJsonCache.get(key);
  if (json === undefined) {
    json = JSON.stringify(persistedNodeData(data));
    persistedNodeDataJsonCache.set(key, json);
  }
  return json;
}

export function graphSignature(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      parentId: node.parentId,
      position: { x: node.position.x, y: node.position.y },
      data: persistedNodeDataJson(node.data as NodeData),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === "string" ? edge.label : undefined,
      // `route` is the only persisted edge datum; displayEdges adds render-only
      // keys (active/failed/sourceNodeType…) that must not count as edits.
      route: (edge.data as { route?: string } | undefined)?.route,
    })),
  });
}

export function graphToNodes(graph: WorkflowGraph): Node[] {
  return (graph.nodes || []).map((node) => {
    const data = node.data as NodeData;
    const built: Node = {
      id: node.id,
      type: flowNodeTypeForData(data),
      position: node.position,
      data,
    };
    if (node.parentId) built.parentId = node.parentId;
    // A grouping frame is sized via node.style (React Flow reads it for the
    // parent box); node.style is not serialized, so rebuild it from data.
    if (data.nodeType === "group") {
      built.style = { width: data.groupWidth ?? 320, height: data.groupHeight ?? 200 };
    }
    return built;
  });
}

export function graphToEdges(graph: WorkflowGraph): Edge[] {
  return (graph.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    // Error-branch edges (data.route === "error") originate from the node's
    // bottom "error" handle. sourceHandle isn't persisted, so rebuild it from
    // the route on load — otherwise the edge would snap back to the right handle.
    ...(edge.data?.route === "error" ? { sourceHandle: "error" } : {}),
    label: edge.label,
    data: edge.data,
    labelStyle: { fill: "var(--fg-muted)", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "var(--surface-elevated)", fillOpacity: 0.95 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 4,
  }));
}
