"use client";

import { useEffect, useState } from "react";
import { GitCompare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { formatRelativeTime } from "@/lib/format-date";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { EvalHistoryEntry, RunCompareResponse } from "@/types/workflow";

interface RunComparisonProps {
  workflowId: string;
  embedded?: boolean;
}

export function RunComparison({ workflowId, embedded = false }: RunComparisonProps) {
  const [history, setHistory] = useState<EvalHistoryEntry[]>([]);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [comparison, setComparison] = useState<RunCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getEvalHistory(workflowId)
      .then(setHistory)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load eval history");
        setHistory([]);
      });
  }, [workflowId]);

  const handleCompare = async () => {
    if (!runA || !runB || runA === runB) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.compareRuns(workflowId, runA, runB);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  if (error && history.length < 2) {
    return (
      <EmptyState
        compact
        variant="error"
        icon={GitCompare}
        title="Couldn't load eval history"
        description={error}
        className={embedded ? "py-6" : undefined}
      />
    );
  }

  if (history.length < 2) {
    return (
      <EmptyState
        compact
        icon={GitCompare}
        title="Not enough eval runs"
        description="Run the workflow at least twice with an evaluation node to compare scores."
        className={embedded ? "py-6" : undefined}
      />
    );
  }

  return (
    <div className={embedded ? "flex flex-col gap-3" : "panel flex w-80 flex-col gap-3 p-4"}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground">Compare runs</span>
        </div>
      )}

      <div className="space-y-2">
        <Label>Run A (baseline)</Label>
        <Select value={runA || undefined} onValueChange={setRunA}>
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="Select run…" />
          </SelectTrigger>
          <SelectContent>
            {history.map((entry) => (
              <SelectItem key={entry.run_id} value={entry.run_id}>
                {formatRelativeTime(entry.created_at)} ·{" "}
                {entry.scores.aggregate_score?.toFixed(2) ?? "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Run B (compare)</Label>
        <Select value={runB || undefined} onValueChange={setRunB}>
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="Select run…" />
          </SelectTrigger>
          <SelectContent>
            {history.map((entry) => (
              <SelectItem key={entry.run_id} value={entry.run_id}>
                {formatRelativeTime(entry.created_at)} ·{" "}
                {entry.scores.aggregate_score?.toFixed(2) ?? "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" onClick={handleCompare} disabled={loading || !runA || !runB || runA === runB}>
        {loading ? "Comparing…" : "Compare"}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {comparison && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background p-2">
              <p className="font-medium text-foreground">Run A (v{comparison.run_a_version})</p>
              {comparison.run_a_scores && <EvalScoresChart scores={comparison.run_a_scores} compact />}
            </div>
            <div className="rounded-lg border border-border bg-background p-2">
              <p className="font-medium text-foreground">Run B (v{comparison.run_b_version})</p>
              {comparison.run_b_scores && (
                <EvalScoresChart scores={comparison.run_b_scores} delta={comparison.delta} compact />
              )}
            </div>
          </div>

          {(comparison.run_a_output || comparison.run_b_output) && (
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium text-muted">Output A</p>
                <p className="line-clamp-3 text-foreground">{comparison.run_a_output}</p>
              </div>
              <div>
                <p className="font-medium text-muted">Output B</p>
                <p className="line-clamp-3 text-foreground">{comparison.run_b_output}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}