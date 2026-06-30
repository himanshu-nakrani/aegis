"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shield, Sparkles } from "lucide-react";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { EvalTrendChart } from "@/components/results/EvalTrendChart";
import { GuardrailEventsPanel } from "@/components/results/GuardrailEventsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

interface WorkflowQualityPanelProps {
  workflowId: string;
}

export function WorkflowQualityPanel({ workflowId }: WorkflowQualityPanelProps) {
  const {
    data: quality,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workflowQuality(workflowId),
    queryFn: () => api.getWorkflowQuality(workflowId),
  });

  if (loading) {
    return <p className="text-sm text-muted">Loading quality metrics…</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load quality metrics"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!quality) return null;

  const dimensionScores = {
    faithfulness: quality.avg_dimension_scores.faithfulness,
    helpfulness: quality.avg_dimension_scores.helpfulness,
    relevance: quality.avg_dimension_scores.relevance,
    toxicity: quality.avg_dimension_scores.toxicity,
    aggregate_score:
      quality.eval_trend.length > 0
        ? quality.eval_trend[quality.eval_trend.length - 1]?.aggregate
        : undefined,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Quality</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      {!quality.graph_config.has_quality_nodes && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
          Add Evaluation or Guardrail nodes to track quality on this workflow.
        </p>
      )}

      {quality.graph_config.has_quality_nodes && (
        <div className="flex flex-wrap gap-2">
          {quality.graph_config.eval_node_count > 0 && (
            <Badge variant="accent">
              <Sparkles className="mr-1 h-3 w-3" />
              {quality.graph_config.eval_node_count} eval
            </Badge>
          )}
          {quality.graph_config.guardrail_node_count > 0 && (
            <Badge variant="outline">
              <Shield className="mr-1 h-3 w-3" />
              {quality.graph_config.guardrail_node_count} guardrails
            </Badge>
          )}
        </div>
      )}

      {quality.eval_regression?.detected && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-1 text-xs">
              <p className="font-medium text-foreground">Eval regression detected</p>
              <p className="text-muted">{quality.eval_regression.message}</p>
              {quality.eval_regression.latest_run_id && (
                <Link
                  href={`/runs/${quality.eval_regression.latest_run_id}`}
                  className="text-primary hover:underline"
                >
                  View latest run
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {quality.eval_run_count > 0 ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface px-3 py-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{quality.eval_run_count} eval runs</Badge>
            {quality.eval_pass_rate != null && (
              <Badge variant="success">{Math.round(quality.eval_pass_rate * 100)}% pass rate</Badge>
            )}
            {quality.eval_fail_count > 0 && (
              <Badge variant="destructive">{quality.eval_fail_count} below threshold</Badge>
            )}
          </div>
          <EvalTrendChart points={quality.eval_trend} />
          {dimensionScores.aggregate_score != null && (
            <EvalScoresChart scores={dimensionScores} compact />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">No evaluation scores yet. Run the workflow with an Evaluation node.</p>
      )}

      {quality.guardrail_stats.total_events > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-surface px-3 py-3">
          <p className="text-xs font-medium text-muted">Guardrail activity</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-success">{quality.guardrail_stats.passed}</p>
              <p className="text-muted">passed</p>
            </div>
            <div>
              <p className="text-warning">{quality.guardrail_stats.warned}</p>
              <p className="text-muted">warned</p>
            </div>
            <div>
              <p className="text-destructive">{quality.guardrail_stats.failed}</p>
              <p className="text-muted">failed</p>
            </div>
          </div>
          {quality.recent_guardrail_events.length > 0 && (
            <GuardrailEventsPanel events={quality.recent_guardrail_events} compact />
          )}
        </div>
      )}

      {quality.graph_config.eval_nodes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Eval nodes</p>
          {quality.graph_config.eval_nodes.map((node) => (
            <div key={node.node_id} className="text-xs text-foreground">
              {node.label}
              {node.threshold != null && (
                <span className="text-muted"> · threshold {node.threshold}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <Link href="/observability">
        <Button variant="outline" size="sm" className="w-full">
          Full observability
        </Button>
      </Link>
    </div>
  );
}