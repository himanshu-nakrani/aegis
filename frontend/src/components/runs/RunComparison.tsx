"use client";

import { useEffect, useState } from "react";
import { GitCompare } from "lucide-react";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { Button } from "@/components/ui/button";
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
    api.getEvalHistory(workflowId).then(setHistory);
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

  if (history.length < 2) {
    return (
      <div className={embedded ? "space-y-2" : "rounded-xl border border-slate-800 bg-slate-900/80 p-4"}>
        {!embedded && (
          <div className="flex items-center gap-2 text-slate-400">
            <GitCompare className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Compare Runs</span>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Run the workflow at least twice with evaluation to compare scores.
        </p>
      </div>
    );
  }

  return (
    <div className={embedded ? "flex flex-col gap-3" : "flex w-80 flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4"}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Compare Runs
          </span>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Run A (baseline)</label>
        <select
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
          value={runA}
          onChange={(e) => setRunA(e.target.value)}
        >
          <option value="">Select run...</option>
          {history.map((entry) => (
            <option key={entry.run_id} value={entry.run_id}>
              {new Date(entry.created_at).toLocaleString()} —{" "}
              {entry.scores.aggregate_score?.toFixed(2) ?? "—"}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Run B (compare)</label>
        <select
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
          value={runB}
          onChange={(e) => setRunB(e.target.value)}
        >
          <option value="">Select run...</option>
          {history.map((entry) => (
            <option key={entry.run_id} value={entry.run_id}>
              {new Date(entry.created_at).toLocaleString()} —{" "}
              {entry.scores.aggregate_score?.toFixed(2) ?? "—"}
            </option>
          ))}
        </select>
      </div>

      <Button
        size="sm"
        variant="secondary"
        onClick={handleCompare}
        disabled={loading || !runA || !runB || runA === runB}
      >
        {loading ? "Comparing..." : "Compare"}
      </Button>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {comparison && (
        <div className="space-y-3 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-slate-950 p-2">
              <p className="font-medium text-slate-300">Run A (v{comparison.run_a_version})</p>
              {comparison.run_a_scores && (
                <EvalScoresChart scores={comparison.run_a_scores} compact />
              )}
            </div>
            <div className="rounded-md bg-slate-950 p-2">
              <p className="font-medium text-slate-300">Run B (v{comparison.run_b_version})</p>
              {comparison.run_b_scores && (
                <EvalScoresChart
                  scores={comparison.run_b_scores}
                  delta={comparison.delta}
                  compact
                />
              )}
            </div>
          </div>

          {(comparison.run_a_output || comparison.run_b_output) && (
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium text-slate-400">Output A</p>
                <p className="line-clamp-3 text-slate-500">{comparison.run_a_output}</p>
              </div>
              <div>
                <p className="font-medium text-slate-400">Output B</p>
                <p className="line-clamp-3 text-slate-500">{comparison.run_b_output}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}