"use client";

import { useCallback, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";

export interface GraphSnapshot {
  nodes: Node[];
  edges: Edge[];
}

interface UseGraphHistoryOptions {
  nodesRef: React.MutableRefObject<Node[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  capacity?: number;
}

interface UseGraphHistoryReturn {
  record: (coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

const DEFAULT_CAPACITY = 100;
const COALESCE_WINDOW_MS = 800;

/**
 * Push-before-mutate undo/redo for the workflow graph.
 *
 * The integrator calls `record()` explicitly BEFORE each graph mutation — this
 * hook never records automatically via effects. Snapshots are deep-cloned from
 * the passed refs (state arrays are pure JSON-safe persisted data; display
 * callbacks are injected in separate memos downstream, so no stripping needed).
 *
 * Stacks live in refs so record/undo/redo stay useCallback-stable; a version
 * counter (useState) is bumped on every stack mutation to keep canUndo/canRedo
 * reactive.
 */
export function useGraphHistory({
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  capacity = DEFAULT_CAPACITY,
}: UseGraphHistoryOptions): UseGraphHistoryReturn {
  const pastRef = useRef<GraphSnapshot[]>([]);
  const futureRef = useRef<GraphSnapshot[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Bumped on every stack mutation to make canUndo/canRedo reactive.
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const snapshot = useCallback(
    (): GraphSnapshot => ({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current),
    }),
    [nodesRef, edgesRef]
  );

  const record = useCallback(
    (coalesceKey?: string) => {
      const now = Date.now();
      // Coalesce only when the SAME key was recorded within the window. A record
      // with a different key or no key always records and resets coalescing.
      if (
        coalesceKey !== undefined &&
        coalesceKey === lastKeyRef.current &&
        now - lastTimeRef.current < COALESCE_WINDOW_MS
      ) {
        lastTimeRef.current = now;
        return;
      }
      lastKeyRef.current = coalesceKey ?? null;
      lastTimeRef.current = now;

      pastRef.current.push(snapshot());
      if (pastRef.current.length > capacity) {
        pastRef.current.shift(); // drop oldest
      }
      futureRef.current = [];
      bump();
    },
    [snapshot, capacity, bump]
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    futureRef.current.push(snapshot());
    const prev = pastRef.current.pop() as GraphSnapshot;
    // Any explicit record after this restore should start a fresh coalesce group.
    lastKeyRef.current = null;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    bump();
  }, [snapshot, setNodes, setEdges, bump]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    pastRef.current.push(snapshot());
    const next = futureRef.current.pop() as GraphSnapshot;
    lastKeyRef.current = null;
    setNodes(next.nodes);
    setEdges(next.edges);
    bump();
  }, [snapshot, setNodes, setEdges, bump]);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    lastKeyRef.current = null;
    lastTimeRef.current = 0;
    bump();
  }, [bump]);

  return {
    record,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    clear,
  };
}
