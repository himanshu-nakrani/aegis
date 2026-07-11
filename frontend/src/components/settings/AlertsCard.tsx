"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

const METRICS = [
  { value: "failure_rate", label: "Failure rate", hint: "0–1 over window" },
  { value: "eval_avg", label: "Avg eval score", hint: "1–5, use < operator" },
  { value: "guardrail_blocks", label: "Guardrail blocks", hint: "count over window" },
  { value: "cost_usd", label: "Cost (USD)", hint: "sum over window" },
];

/** Alert rules: evaluated every scheduler tick; breaches fire the webhook. */
export function AlertsCard() {
  const queryClient = useQueryClient();
  const [metric, setMetric] = useState("failure_rate");
  const [operator, setOperator] = useState<"gt" | "lt">("gt");
  const [threshold, setThreshold] = useState("0.5");
  const [windowMinutes, setWindowMinutes] = useState("60");
  const [channelUrl, setChannelUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    <GlassCard className="overflow-hidden p-0">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted" />
          <CardTitle as="h2">Alerts</CardTitle>
        </div>
        <p className="text-caption">
          Rules are evaluated every scheduler tick (~60s). Breaches are logged and sent to the
          webhook URL if provided.
        </p>
      </CardHeader>
      <div className="space-y-4 px-6 pb-6">
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
              <span className="font-mono text-xs text-foreground">
                {rule.metric} {rule.operator === "gt" ? ">" : "<"} {rule.threshold} · {rule.window_minutes}m
                {rule.channel_url ? " · webhook" : ""}
              </span>
              <div className="flex items-center gap-2">
                {rule.last_fired_at && (
                  <Badge variant="warning">
                    fired {new Date(rule.last_fired_at).toLocaleTimeString()}
                  </Badge>
                )}
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
      </div>
    </GlassCard>
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
    <GlassCard className="overflow-hidden p-0">
      <CardHeader>
        <CardTitle as="h2">Operational config</CardTitle>
        <p className="text-caption">
          Env-driven knobs (RETENTION_*, ONLINE_EVAL_SAMPLE_RATE, OTEL_*). Edit backend/.env and
          restart to change.
        </p>
      </CardHeader>
      <div className="space-y-1.5 px-6 pb-6">
        {Object.entries(OPS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between font-mono text-xs">
            <span className="text-muted">{label}</span>
            <span className="text-foreground">
              {typeof data[key] === "boolean" ? (data[key] ? "enabled" : "disabled") : String(data[key] ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
