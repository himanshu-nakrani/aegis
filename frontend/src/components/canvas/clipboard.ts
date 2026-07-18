import type { Edge, Node } from "@xyflow/react";

/**
 * Module-level in-memory clipboard for canvas copy/paste.
 *
 * Deliberate tradeoff vs the system clipboard: we keep the fragment in a plain
 * module variable rather than navigator.clipboard. This avoids permission
 * prompts and clipboard-read gating, and keeps rich Node/Edge objects intact
 * without JSON round-tripping through text/plain. The cost is that the buffer
 * is per-tab and does not survive a reload — acceptable for canvas paste.
 */

interface ClipboardStore {
  nodes: Node[];
  edges: Edge[];
}

let store: ClipboardStore | null = null;

const GRID = 20;

function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/**
 * Copy the selected nodes (and internal edges) into the module clipboard.
 * Only edges whose BOTH endpoints are in the selection are stored. Nodes are
 * deep-cloned and stripped of `selected`. Returns the number of nodes stored.
 */
export function copyToClipboard(selectedNodes: Node[], allEdges: Edge[]): number {
  const ids = new Set(selectedNodes.map((n) => n.id));
  const nodes = selectedNodes.map((n) => {
    const clone = structuredClone(n);
    delete clone.selected;
    return clone;
  });
  const edges = allEdges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => structuredClone(e));
  store = { nodes, edges };
  return nodes.length;
}

export function hasClipboard(): boolean {
  return store !== null && store.nodes.length > 0;
}

/** Matches WorkflowCanvas `nextNodeId`: scan `node_<n>` ids, return max+1 suffix. */
function nextNodeIndex(existingNodes: Node[]): number {
  let max = 0;
  for (const node of existingNodes) {
    const match = /^node_(\d+)$/.exec(node.id);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return max + 1;
}

/**
 * Shared materializer for both paste and bulk-duplicate.
 *
 * Deep-clones the fragment, computes its bounding-box top-left from node
 * positions, offsets every node so that top-left lands on `targetTopLeft`
 * (preserving relative layout), allocates fresh non-colliding `node_<n>` ids,
 * remaps edge source/target, and mints new `e-<src>-<tgt>-<n>` edge ids
 * following WorkflowCanvas `makeEdge`. Returned nodes are selected, edges are not.
 */
function materialize(
  fragmentNodes: Node[],
  fragmentEdges: Edge[],
  existingNodes: Node[],
  targetTopLeft: (bbox: { x: number; y: number }) => { x: number; y: number }
): { nodes: Node[]; edges: Edge[] } | null {
  if (fragmentNodes.length === 0) return null;

  // Bounding-box top-left of the source fragment.
  const minX = Math.min(...fragmentNodes.map((n) => n.position.x));
  const minY = Math.min(...fragmentNodes.map((n) => n.position.y));

  const anchor = targetTopLeft({ x: minX, y: minY });
  const dx = anchor.x - minX;
  const dy = anchor.y - minY;

  // Allocate new ids in a single deterministic pass; each is guaranteed unique
  // against existing nodes AND the others we mint here (the counter only grows).
  let counter = nextNodeIndex(existingNodes);
  const idMap = new Map<string, string>();

  const nodes: Node[] = fragmentNodes.map((n) => {
    const clone = structuredClone(n);
    const newId = `node_${counter}`;
    counter += 1;
    idMap.set(n.id, newId);
    clone.id = newId;
    clone.position = { x: clone.position.x + dx, y: clone.position.y + dy };
    clone.selected = true;
    return clone;
  });

  const edges: Edge[] = fragmentEdges.map((e, i) => {
    const clone = structuredClone(e);
    const source = idMap.get(e.source) ?? e.source;
    const target = idMap.get(e.target) ?? e.target;
    clone.source = source;
    clone.target = target;
    // Follow makeEdge's `e-<src>-<tgt>-<uniq>` scheme; `${Date.now()}-${i}`
    // keeps ids unique within this batch (Date.now alone collides in a loop).
    clone.id = `e-${source}-${target}-${Date.now()}-${i}`;
    clone.selected = false;
    return clone;
  });

  return { nodes, edges };
}

/**
 * Materialize the stored clipboard at `anchor` (snapped to the 20px grid),
 * WITHOUT consuming the clipboard. Returns null if the clipboard is empty.
 */
export function materializeClipboard(
  existingNodes: Node[],
  anchor: { x: number; y: number }
): { nodes: Node[]; edges: Edge[] } | null {
  if (!store || store.nodes.length === 0) return null;
  return materialize(store.nodes, store.edges, existingNodes, () => ({
    x: snapToGrid(anchor.x),
    y: snapToGrid(anchor.y),
  }));
}

/**
 * Duplicate a given selection in place, offset by the WorkflowCanvas duplicate
 * delta (+40, +48) from the fragment's top-left. Does not touch the clipboard.
 */
export function duplicateFragment(
  nodes: Node[],
  edges: Edge[],
  existingNodes: Node[]
): { nodes: Node[]; edges: Edge[] } | null {
  const ids = new Set(nodes.map((n) => n.id));
  const internalEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return materialize(nodes, internalEdges, existingNodes, (bbox) => ({
    x: bbox.x + 40,
    y: bbox.y + 48,
  }));
}
