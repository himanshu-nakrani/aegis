import type { NodeData, NodeResult, WorkflowGraph } from "@/types/workflow";

/** Enumerate node ids that can reach `targetId` by walking edges backwards. */
export function deriveUpstreamNodeIds(graph: WorkflowGraph | undefined, targetId: string): string[] {
  if (!graph) return [];
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }
  const seen = new Set<string>();
  const queue = [...(incoming.get(targetId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const src of incoming.get(id) ?? []) if (!seen.has(src)) queue.push(src);
  }
  return Array.from(seen);
}

/** Best-effort field names for a node's output, grounded on the last run's
 *  result shape when the output parses as a JSON object; else registry hints. */
export function outputFieldsFor(
  nodeData: NodeData | undefined,
  lastResult: NodeResult | undefined
): string[] {
  if (lastResult?.output) {
    try {
      const parsed = JSON.parse(lastResult.output);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.keys(parsed).slice(0, 12);
      }
    } catch {
      /* not JSON — fall through to config hints */
    }
  }
  if (!nodeData) return [];
  if (nodeData.nodeType === "extractor") return nodeData.extractFields ?? [];
  if (nodeData.nodeType === "input_schema") return (nodeData.inputFields ?? []).map((f) => f.key);
  return [];
}
