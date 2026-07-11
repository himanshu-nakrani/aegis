"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, Gauge, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

/** Cost, latency percentiles, failure clusters, and version quality trends. */
export function OperationsPanel() {
  const { data: costs } = useQuery({
    queryKey: ["observability-costs"],
    queryFn: api.getObservabilityCosts,
    refetchInterval: 60_000,
  });
  const { data: errors } = useQuery({
    queryKey: ["observability-errors"],
    queryFn: api.getObservabilityErrors,
    refetchInterval: 60_000,
  });

  return (
    <section className="section-block space-y-4">
      <h2 className="section-heading">Operations</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Gauge,
            label: "Latency p50",
            value: costs?.latency_p50_ms != null ? `${costs.latency_p50_ms} ms` : "—",
          },
          {
            icon: Gauge,
            label: "Latency p95",
            value: costs?.latency_p95_ms != null ? `${costs.latency_p95_ms} ms` : "—",
          },
          {
            icon: DollarSign,
            label: "Cost (recent runs)",
            value:
              typeof costs?.total_cost_usd === "number" && costs.total_cost_usd > 0
                ? `$${costs.total_cost_usd.toFixed(4)}`
                : "—",
          },
          {
            icon: TrendingUp,
            label: "Tokens (recent runs)",
            value: costs?.total_tokens ? costs.total_tokens.toLocaleString() : "—",
          },
        ].map((tile) => (
          <GlassCard key={tile.label} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-micro">{tile.label}</p>
              <tile.icon className="h-4 w-4 text-muted" />
            </div>
            <p className="mt-2 text-xl font-semibold text-foreground">{tile.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle as="h3" className="text-base">
              Failure clusters
            </CardTitle>
            <span className="font-mono text-xs text-muted">
              {errors?.failed_runs_scanned ?? 0} failed runs scanned
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {(errors?.clusters || []).length === 0 && (
              <p className="text-sm text-muted">No failures in the recent window. 🎉</p>
            )}
            {(errors?.clusters || []).slice(0, 6).map((cluster) => (
              <Link
                key={cluster.signature}
                href={`/runs/${cluster.sample_run_id}`}
                className="focus-ring flex items-start gap-3 rounded-md border border-border bg-surface-input p-2.5 transition-colors hover:border-border-strong"
              >
                <span className="mt-0.5 flex h-6 w-8 shrink-0 items-center justify-center rounded bg-destructive/10 font-mono text-xs font-semibold text-destructive">
                  {cluster.count}×
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs text-foreground">
                    {cluster.signature}
                  </span>
                  <span className="block text-xs text-muted">
                    {cluster.workflows.join(", ")}
                    {cluster.last_seen
                      ? ` · last ${new Date(cluster.last_seen).toLocaleString()}`
                      : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle as="h3" className="text-base">
              Cost by workflow · eval by version
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted" />
          </div>
          <div className="mt-3 space-y-1.5">
            {(costs?.top_workflows_by_cost || [])
              .filter((w) => w.cost_usd > 0 || w.failures > 0)
              .slice(0, 5)
              .map((w) => (
                <div
                  key={w.workflow}
                  className="flex items-center justify-between gap-2 font-mono text-xs"
                >
                  <span className="truncate text-foreground">{w.workflow}</span>
                  <span className="shrink-0 text-muted">
                    {w.runs} runs · ${w.cost_usd.toFixed(4)}
                    {w.failures > 0 ? ` · ${w.failures} failed` : ""}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            {(costs?.version_eval_trend || []).slice(0, 4).map((trend) => (
              <div key={trend.workflow} className="font-mono text-xs">
                <span className="text-foreground">{trend.workflow}</span>
                <span className="text-muted">
                  {" "}
                  {trend.versions
                    .map((v) => `v${v.version}: ${v.avg_eval}`)
                    .join(" → ")}
                </span>
              </div>
            ))}
            {(costs?.version_eval_trend || []).length === 0 && (
              <p className="text-xs text-muted">
                Version quality trends appear once multiple versions have eval scores.
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
