"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2 } from "lucide-react";
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

  const { data: rules = [] } = useQuery({ queryKey: ["alert-rules"], queryFn: api.listAlertRules });
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
    const value = Number(threshold);
    if (!Number.isFinite(value)) {
      toast.error("Threshold must be a number");
      return;
    }
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
            <SelectTrigger className="sm:col-span-2">
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
            <SelectTrigger>
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
          <Button variant="outline" onClick={create}>
            <Plus className="h-4 w-4" />
            Add rule
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
                  onClick={() => {
                    void api.deleteAlertRule(rule.id).then(refresh);
                  }}
                  className="text-muted transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-muted">No alert rules yet.</p>}
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
