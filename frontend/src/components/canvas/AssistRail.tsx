"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, X, ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSlide } from "@/components/motion/PanelSlide";
import { cn } from "@/lib/utils";
import { api, type EditGraphResponse, type GraphDiff } from "@/lib/api";
import type { WorkflowGraph } from "@/types/workflow";

export interface AssistRailProps {
  /** Persisted workflow id, if the graph has been saved. Optional — the
   *  backend accepts a bare graph for unsaved drafts. */
  workflowId?: string;
  /** Current canvas graph, mirrored from WorkflowCanvas each render. */
  graph: WorkflowGraph;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called on Accept. The rail NEVER mutates the canvas itself — the caller
   *  swaps the graph and pushes undo history. */
  onApply: (graph: WorkflowGraph, diff: GraphDiff) => void;
  /** Optional: while a proposal is pending, the canvas can ring affected
   *  nodes via BaseNode's diffKind. Called with the diff when a proposal is
   *  live and with null when it is accepted / discarded. */
  onPreviewDiff?: (diff: GraphDiff | null) => void;
}

/** A single diff group (added / removed / changed) with affected labels. */
function DiffGroup({
  label,
  ids,
  labels,
  tone,
}: {
  label: string;
  ids: string[];
  labels: Map<string, string>;
  tone: "added" | "removed" | "changed";
}) {
  if (ids.length === 0) return null;
  const dot =
    tone === "added"
      ? "bg-success"
      : tone === "removed"
        ? "bg-destructive"
        : "bg-warning";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        <span className="text-2xs font-medium uppercase tracking-wider text-subtle">
          {label}
        </span>
        <span className="font-mono tabular-nums text-2xs text-muted">{ids.length}</span>
      </div>
      <ul className="ml-3 space-y-0.5">
        {ids.map((id) => (
          <li key={id} className="truncate font-mono text-xs text-muted" title={labels.get(id) ?? id}>
            {labels.get(id) ?? id}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Right-docked Assist rail: turns a natural-language instruction into a
 * reviewable graph proposal (api.editGraph), never auto-applying. Instrument
 * chrome — a thin bone-white left border, mono metadata, no chat bubbles or
 * avatars. Accept hands the proposed graph + diff to the caller; Discard
 * clears it. onPreviewDiff mirrors the pending diff so the canvas can ring
 * affected nodes.
 */
export function AssistRail({
  workflowId,
  graph,
  open,
  onOpenChange,
  onApply,
  onPreviewDiff,
}: AssistRailProps) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<EditGraphResponse | null>(null);

  // Label lookup for the *proposed* graph (covers added nodes) with a
  // fallback to the current graph for removed nodes that no longer exist.
  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of graph.nodes) map.set(node.id, node.data?.label ?? node.id);
    if (proposal) {
      for (const node of proposal.proposed_graph.nodes) {
        map.set(node.id, node.data?.label ?? node.id);
      }
    }
    return map;
  }, [graph, proposal]);

  const clearProposal = () => {
    setProposal(null);
    onPreviewDiff?.(null);
  };

  const propose = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    // Drop any stale proposal's ring before the new request lands.
    if (proposal) onPreviewDiff?.(null);
    try {
      const result = await api.editGraph({
        workflow_id: workflowId,
        graph,
        instruction: trimmed,
      });
      setProposal(result);
      onPreviewDiff?.(result.diff);
    } catch (error) {
      setProposal(null);
      onPreviewDiff?.(null);
      toast.error(error instanceof Error ? error.message : "Couldn't propose an edit");
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    onApply(proposal.proposed_graph, proposal.diff);
    toast.success("Applied AI edit");
    setInstruction("");
    clearProposal();
  };

  const discard = () => {
    clearProposal();
  };

  const diff = proposal?.diff;
  const changeCount =
    (diff?.added_node_ids.length ?? 0) +
    (diff?.removed_node_ids.length ?? 0) +
    (diff?.changed_node_ids.length ?? 0);
  const edgeDelta = (diff?.added_edges.length ?? 0) + (diff?.removed_edges.length ?? 0);

  return (
    <PanelSlide
      side="right"
      open={open}
      className="pointer-events-auto flex h-full w-[340px] flex-col border-l border-primary/70 bg-surface-overlay"
    >
      {/* Header — monochrome chrome */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted" aria-hidden />
          <span className="text-2xs font-medium uppercase tracking-wider text-subtle">
            AI Assist
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onOpenChange(false)}
          aria-label="Close AI assist"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Composer */}
      <div className="space-y-2 border-b border-border px-3.5 py-3">
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Describe an edit — e.g. add a guardrail before the LLM, make this branch retry twice…"
          className="min-h-[76px] text-sm"
          disabled={loading}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void propose();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-2xs text-subtle">
            {graph.nodes.length} node{graph.nodes.length === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            onClick={() => void propose()}
            disabled={loading || !instruction.trim()}
          >
            {loading ? "Proposing…" : "Propose edit"}
            {!loading && <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Proposal review */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {!proposal && !loading && (
          <EmptyState
            compact
            icon={Sparkles}
            title="No proposal yet"
            description="Describe a change and Aegis drafts a reviewable graph edit — nothing touches the canvas until you accept."
          />
        )}

        {loading && !proposal && (
          <p className="font-mono text-xs text-muted">Drafting a graph edit…</p>
        )}

        {proposal && (
          <div className="space-y-3">
            {/* Summary + metadata as mono caption, no bubbles */}
            <div className="space-y-1.5">
              <p className="text-2xs font-medium uppercase tracking-wider text-subtle">
                Proposed edit
              </p>
              <p className="text-sm leading-6 text-foreground">{proposal.summary}</p>
              <p className="font-mono tabular-nums text-2xs text-muted">
                {changeCount} node{changeCount === 1 ? "" : "s"}
                {edgeDelta > 0
                  ? ` · ${edgeDelta} edge${edgeDelta === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>

            {/* Diff readout — counts + affected node labels */}
            {diff && changeCount > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
                <DiffGroup
                  label="Added"
                  ids={diff.added_node_ids}
                  labels={labelById}
                  tone="added"
                />
                <DiffGroup
                  label="Removed"
                  ids={diff.removed_node_ids}
                  labels={labelById}
                  tone="removed"
                />
                <DiffGroup
                  label="Changed"
                  ids={diff.changed_node_ids}
                  labels={labelById}
                  tone="changed"
                />
              </div>
            )}

            {diff && changeCount === 0 && edgeDelta === 0 && (
              <p className="font-mono text-xs text-subtle">
                No structural change — edges and node configs are unchanged.
              </p>
            )}

            {/* Notes */}
            {proposal.notes.length > 0 && (
              <div className="space-y-1">
                <p className="text-2xs font-medium uppercase tracking-wider text-subtle">
                  Notes
                </p>
                <ul className="space-y-1">
                  {proposal.notes.map((note, i) => (
                    <li key={i} className="text-xs leading-5 text-muted">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accept / Discard */}
      {proposal && (
        <div className="flex items-center gap-2 border-t border-border px-3.5 py-3">
          <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={discard}>
            <RotateCcw className="h-3.5 w-3.5" />
            Discard
          </Button>
          <Button size="sm" className="flex-1 justify-center" onClick={accept}>
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
        </div>
      )}
    </PanelSlide>
  );
}
