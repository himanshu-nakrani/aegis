"use client";

import type { EvalScores } from "@/types/workflow";
import { cn } from "@/lib/utils";

const SCORE_KEYS = [
  { key: "faithfulness", label: "Faithfulness", color: "bg-primary" },
  { key: "helpfulness", label: "Helpfulness", color: "bg-accent" },
  { key: "relevance", label: "Relevance", color: "bg-success" },
  { key: "toxicity", label: "Toxicity", color: "bg-destructive", invert: true },
] as const;

interface EvalScoresChartProps {
  scores: EvalScores;
  delta?: Record<string, number | null>;
  compact?: boolean;
}

function scoreValue(scores: EvalScores, key: string): number | null {
  const val = scores[key as keyof EvalScores];
  return typeof val === "number" ? val : null;
}

function formatDelta(value: number | null | undefined) {
  if (value == null) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function radarPoints(scores: EvalScores): string {
  const cx = 60;
  const cy = 60;
  const maxR = 45;
  const angles = SCORE_KEYS.map((_, i) => (Math.PI * 2 * i) / SCORE_KEYS.length - Math.PI / 2);

  return angles
    .map((angle, i) => {
      const key = SCORE_KEYS[i];
      let val = scoreValue(scores, key.key) ?? 0;
      if ("invert" in key && key.invert) val = 6 - val;
      const r = (val / 5) * maxR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");
}

export function EvalScoresChart({ scores, delta, compact }: EvalScoresChartProps) {
  const aggregate = scoreValue(scores, "aggregate_score");

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {aggregate != null && (
        <div className="flex items-baseline justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wider text-amber-200/80">
            Aggregate
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-100">{aggregate.toFixed(2)}</span>
            <span className="text-xs text-amber-200/60">/ 5</span>
            {delta?.aggregate_score != null && (
              <span
                className={cn(
                  "text-xs font-medium",
                  delta.aggregate_score > 0 ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {formatDelta(delta.aggregate_score)}
              </span>
            )}
          </div>
        </div>
      )}

      {!compact && (
        <div className="flex justify-center">
          <svg viewBox="0 0 120 120" className="h-28 w-28">
            {[1, 2, 3, 4, 5].map((ring) => (
              <circle
                key={ring}
                cx="60"
                cy="60"
                r={(ring / 5) * 45}
                fill="none"
                stroke="#334155"
                strokeWidth="0.5"
              />
            ))}
            {SCORE_KEYS.map((_, i) => {
              const angle = (Math.PI * 2 * i) / SCORE_KEYS.length - Math.PI / 2;
              const x = 60 + 45 * Math.cos(angle);
              const y = 60 + 45 * Math.sin(angle);
              return <line key={i} x1="60" y1="60" x2={x} y2={y} stroke="#334155" strokeWidth="0.5" />;
            })}
            <polygon
              points={radarPoints(scores)}
              fill="rgba(251, 191, 36, 0.25)"
              stroke="#fbbf24"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      )}

      <div className="space-y-2">
        {SCORE_KEYS.map((item) => {
          const { key, label, color } = item;
          const invert = "invert" in item && item.invert;
          const raw = scoreValue(scores, key);
          const display = raw == null ? null : invert ? 6 - raw : raw;
          const pct = display != null ? (display / 5) * 100 : 0;
          const keyDelta = delta?.[key];

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {raw ?? "—"}
                    {invert && raw != null && (
                      <span className="ml-1 text-muted">(lower is better)</span>
                    )}
                  </span>
                  {keyDelta != null && (
                    <span
                      className={cn(
                        "font-medium",
                        invert
                          ? keyDelta < 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                          : keyDelta > 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                      )}
                    >
                      {formatDelta(keyDelta)}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className={cn("h-full rounded-full transition-all", color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {scores.reasoning && (
        <p className="text-xs italic text-muted">{scores.reasoning}</p>
      )}
    </div>
  );
}