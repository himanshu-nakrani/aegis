"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const METRICS = [
  { value: "failure_rate", label: "Failure rate", hint: "0–1 over window" },
  { value: "eval_avg", label: "Avg eval score", hint: "1–5, use < operator" },
  { value: "guardrail_blocks", label: "Guardrail blocks", hint: "count over window" },
  { value: "cost_usd", label: "Cost (USD)", hint: "sum over window" },
  { value: "latency_p95", label: "Latency p95 (ms)", hint: "95th pct over window" },
  { value: "latency_p99", label: "Latency p99 (ms)", hint: "99th pct over window" },
];

/** Alert rules: evaluated every scheduler tick; breaches fire the webhook. */
export function AlertsCard() {
  const queryClient = useQueryClient();
  const [metric, setMetric] = useState("failure_rate");
  const [operator, setOperator] = useState<"gt" | "lt">("gt");
  const [threshold, setThreshold] = useState("0.5");
  const [windowMinutes, setWindowMinutes] = useState("60");
  const [comparison, setComparison] = useState<"absolute" | "baseline">("absolute");
  const [baselineWindow, setBaselineWindow] = useState("360");
  const [channelUrl, setChannelUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({ queryKey: ["alert-rules"], queryFn: api.listAlertRules });
  const { data: events = [] } = useQuery({
    queryKey: ["alert-events"],
    queryFn: api.listAlertEvents,
    refetchInterval: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    void queryClient.invalidateQueries({ queryKey: ["alert-events"] });
  };

  const create = async () => {
    if (saving) return;
    const value = Number(threshold);
    if (!Number.isFinite(value)) {
      toast.error("Threshold must be a number");
      return;
    }
    setSaving(true);
    try {
      await api.createAlertRule({
        workflow_id: null,
        metric,
        operator,
        threshold: value,
        window_minutes: Number(windowMinutes) || 60,
        comparison,
        baseline_window_minutes:
          comparison === "baseline" ? Number(baselineWindow) || 360 : null,
        channel_url: channelUrl.trim() || null,
        enabled: true,
      });
      refresh();
      toast.success("Alert rule created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      id="settings-alerts"
      title="Alerts"
      description="Evaluated every scheduler tick. Breaches log and hit the webhook if set."
    >
      <div className="grid gap-2 sm:grid-cols-5">
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger className="sm:col-span-2" aria-label="Alert metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={operator} onValueChange={(v) => setOperator(v as "gt" | "lt")}>
            <SelectTrigger aria-label="Comparison operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gt">&gt;</SelectItem>
              <SelectItem value="lt">&lt;</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="threshold"
            aria-label="Threshold"
          />
          <Input
            value={windowMinutes}
            onChange={(e) => setWindowMinutes(e.target.value)}
            placeholder="window (min)"
            aria-label="Window minutes"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-5">
          <Select
            value={comparison}
            onValueChange={(v) => setComparison(v as "absolute" | "baseline")}
          >
            <SelectTrigger className="sm:col-span-2" aria-label="Comparison mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="absolute">Absolute threshold</SelectItem>
              <SelectItem value="baseline">Anomaly (vs baseline ×)</SelectItem>
            </SelectContent>
          </Select>
          {comparison === "baseline" && (
            <Input
              className="sm:col-span-2"
              value={baselineWindow}
              onChange={(e) => setBaselineWindow(e.target.value)}
              placeholder="baseline window (min)"
              aria-label="Baseline window minutes"
            />
          )}
          <p className="self-center text-2xs text-subtle sm:col-span-1">
            {comparison === "baseline"
              ? "threshold = ratio (e.g. 2 = 2× baseline)"
              : "threshold = raw value"}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="Webhook URL (optional — Slack incoming webhook works)"
            className="flex-1"
            aria-label="Webhook URL"
          />
          <Button variant="outline" onClick={create} disabled={saving}>
            <Plus className="h-4 w-4" />
            {saving ? "Saving…" : "Add rule"}
          </Button>
        </div>

        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-input px-3 py-2"
            >
              <span
                className={cn(
                  "font-mono text-xs text-foreground",
                  !rule.enabled && "text-muted line-through"
                )}
              >
                {rule.metric} {rule.operator === "gt" ? ">" : "<"} {rule.threshold}
                {rule.comparison === "baseline" ? "× baseline" : ""} · {rule.window_minutes}m
                {rule.comparison === "baseline" && rule.baseline_window_minutes
                  ? ` / ${rule.baseline_window_minutes}m`
                  : ""}
                {rule.channel_url ? " · webhook" : ""}
              </span>
              <div className="flex items-center gap-2">
                {rule.last_fired_at && (
                  <Badge variant="warning">
                    fired {new Date(rule.last_fired_at).toLocaleTimeString()}
                  </Badge>
                )}
                <Switch
                  size="sm"
                  checked={rule.enabled}
                  disabled={togglingId === rule.id}
                  aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
                  onCheckedChange={async (next) => {
                    setTogglingId(rule.id);
                    try {
                      await api.updateAlertRule(rule.id, { enabled: next });
                      refresh();
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Failed to update rule"
                      );
                    } finally {
                      setTogglingId(null);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Delete rule"
                  disabled={deletingId === rule.id}
                  onClick={async () => {
                    setDeletingId(rule.id);
                    try {
                      await api.deleteAlertRule(rule.id);
                      refresh();
                      toast.success("Rule deleted");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to delete rule");
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  className="focus-ring text-muted transition-colors hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {rulesLoading ? (
            <LoadingState variant="list" label="Loading alert rules…" />
          ) : rules.length === 0 ? (
            <EmptyState
              compact
              icon={Bell}
              title="No alert rules yet"
              description="Add a rule above — breaches are logged and sent to your webhook."
            />
          ) : null}
        </div>

        {events.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-micro">Recent alert events</p>
            {events.slice(0, 5).map((event) => (
              <p key={event.id} className="font-mono text-xs text-warning">
                {event.fired_at ? new Date(event.fired_at).toLocaleString() : ""} — {event.message}
              </p>
            ))}
          </div>
        )}
    </SettingsSection>
  );
}

const OPS_LABELS: Record<string, string> = {
  retention_enabled: "Run retention purge",
  run_retention_days: "Retention window (days)",
  online_eval_sample_rate: "Online eval sample rate",
  otel_enabled: "OpenTelemetry export",
  otel_sample_rate: "OTel sample rate",
  schedule_poll_seconds: "Scheduler poll (s)",
  max_concurrent_runs: "Max concurrent runs",
};

/** Read-only operational knobs (env-driven; see backend .env). */
export function OpsConfigCard() {
  const { data } = useQuery({ queryKey: ["ops-config"], queryFn: api.getOpsConfig });
  if (!data) return null;
  return (
    <SettingsSection
      id="settings-ops"
      title="Operational config"
      description="Env-driven knobs. Edit backend/.env and restart to change."
    >
      <div className="space-y-1.5">
        {Object.entries(OPS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between font-mono text-xs">
            <span className="text-muted">{label}</span>
            <span className="text-foreground">
              {typeof data[key] === "boolean"
                ? data[key]
                  ? "enabled"
                  : "disabled"
                : String(data[key] ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
