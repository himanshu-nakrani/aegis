"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionStrict } from "@/components/motion";
import {
  Zap,
  GitBranch,
  Sparkles,
  Database,
  Plug,
  Shield,
  Workflow,
  MousePointerClick,
} from "lucide-react";
import {
  categorize,
  CATEGORY_COLOR_VAR,
  CATEGORY_LABEL,
  type NodeCategory,
} from "@/components/canvas/nodes/category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { EXPRESSION_HINT, getNodeDefinition } from "@/lib/node-registry";
import { cn } from "@/lib/utils";
import type {
  ConditionOperator,
  EvalPreset,
  GuardrailFailBehavior,
  GuardrailMode,
  GuardrailType,
  HttpMethod,
  NodeData,
  SearchProvider,
  StructuredCondition,
  SummaryStyle,
  IntegrationType,
  TriggerType,
} from "@/types/workflow";

interface NodeInspectorProps {
  nodeId: string | null;
  data: NodeData | null;
  workflowId?: string;
  fieldErrors?: Record<string, string>;
  onChange: (nodeId: string, data: NodeData) => void;
}

const CRON_ERROR_MESSAGE =
  "Invalid cron expression. Use 5 fields: minute hour day-of-month month day-of-week. Example: 0 9 * * 1-5 (weekdays at 9am).";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function InspectorDetails({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted hover:text-foreground">
        {title}
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

/** Function-style nodes that execute through the retry/timeout wrapper. */
const RELIABILITY_NODE_TYPES = new Set([
  "tool",
  "http_request",
  "code",
  "transform",
  "json_parse",
  "set_fields",
  "kb_retrieve",
  "memory_store",
  "memory_retrieve",
  "integration",
  "integration_slack",
  "integration_discord",
  "integration_email",
  "integration_postgres",
  "sub_workflow",
]);

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at 9:00 UTC", value: "0 9 * * *" },
  { label: "Weekdays at 9:00 UTC", value: "0 9 * * 1-5" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
];

function GuardrailPreviewPanel({
  rules,
}: {
  rules: NodeData["rules"];
}) {
  const sampleId = useId();
  const [sample, setSample] = useState("Sample output to validate against guardrail rules.");
  const [result, setResult] = useState<{
    passed: boolean;
    message: string;
    would_block: boolean;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await api.previewGuardrail(
        sample,
        (rules || {}) as Record<string, unknown>
      );
      setResult(response);
    } catch {
      setResult({ passed: false, message: "Preview request failed", would_block: false });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-surface px-3 py-3">
      <Label htmlFor={sampleId} className="text-xs">Test sample</Label>
      <Textarea id={sampleId} rows={3} value={sample} onChange={(e) => setSample(e.target.value)} />
      <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
        {testing ? "Testing…" : "Test guardrail"}
      </Button>
      {result && (
        <p className={`text-xs ${result.passed ? "text-success" : "text-destructive"}`}>
          {result.message}
          {result.would_block && " — would block workflow"}
        </p>
      )}
    </div>
  );
}

function TriggerScheduleFields({
  cron,
  workflowId,
  onCronChange,
  fieldError,
}: {
  cron: string;
  workflowId?: string;
  onCronChange: (value: string) => void;
  fieldError?: string;
}) {
  const presetId = useId();
  const cronId = useId();
  const [previewRuns, setPreviewRuns] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lastFiredAt, setLastFiredAt] = useState<string | null>(null);

  useEffect(() => {
    const expr = cron.trim();
    if (!expr) {
      setPreviewRuns([]);
      setPreviewError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      api
        .previewCron(expr)
        .then((result) => {
          setPreviewRuns(result.next_runs);
          setPreviewError(null);
        })
        .catch(() => {
          setPreviewRuns([]);
          setPreviewError(CRON_ERROR_MESSAGE);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [cron]);

  useEffect(() => {
    if (!workflowId) {
      setLastFiredAt(null);
      return;
    }
    api
      .getWorkflowSchedule(workflowId)
      .then((info) => setLastFiredAt(info.last_fired_at))
      .catch(() => setLastFiredAt(null));
  }, [workflowId, cron]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={presetId}>Preset</Label>
        <Select onValueChange={onCronChange}>
          <SelectTrigger id={presetId} className="w-full">
            <SelectValue placeholder="Choose a preset…" />
          </SelectTrigger>
          <SelectContent>
            {CRON_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={cronId} required>Cron expression</Label>
        <Input
          id={cronId}
          value={cron}
          onChange={(e) => onCronChange(e.target.value)}
          placeholder="0 9 * * 1-5"
          className={fieldError ? "border-destructive" : undefined}
        />
        <p className="form-hint">Standard 5-field cron (UTC). Background scheduler fires runs automatically.</p>
        <FieldError message={fieldError} />
      </div>
      {previewError ? (
        <p className="text-xs text-destructive">{previewError}</p>
      ) : previewRuns.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2">
          <p className="text-xs font-medium text-muted">Next runs (UTC)</p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {previewRuns.map((runAt) => (
              <li key={runAt}>{new Date(runAt).toLocaleString()}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {lastFiredAt && (
        <p className="text-xs text-muted">
          Last scheduled run: {new Date(lastFiredAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ConditionFields({
  label,
  condition,
  onChange,
}: {
  label: string;
  condition: StructuredCondition;
  onChange: (c: StructuredCondition) => void;
}) {
  const leftId = useId();
  const operatorId = useId();
  const rightId = useId();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface px-3 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="space-y-2">
        <Label htmlFor={leftId}>Left value</Label>
        <Input
          id={leftId}
          value={condition.left}
          onChange={(e) => onChange({ ...condition, left: e.target.value })}
          placeholder="{{input.priority}}"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={operatorId}>Operator</Label>
        <Select
          value={condition.operator}
          onValueChange={(value) =>
            onChange({ ...condition, operator: value as ConditionOperator })
          }
        >
          <SelectTrigger id={operatorId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eq">Equals</SelectItem>
            <SelectItem value="neq">Not equals</SelectItem>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="not_contains">Not contains</SelectItem>
            <SelectItem value="empty">Is empty</SelectItem>
            <SelectItem value="not_empty">Is not empty</SelectItem>
            <SelectItem value="gt">Greater than</SelectItem>
            <SelectItem value="lt">Less than</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!["empty", "not_empty"].includes(condition.operator) && (
        <div className="space-y-2">
          <Label htmlFor={rightId}>Right value</Label>
          <Input
            id={rightId}
            value={condition.right || ""}
            onChange={(e) => onChange({ ...condition, right: e.target.value })}
          />
        </div>
      )}
      <p className="form-hint">{EXPRESSION_HINT}</p>
    </div>
  );
}

function InspectorMotionShell({
  reduce,
  nodeId,
  children,
}: {
  reduce: boolean;
  nodeId: string;
  children: ReactNode;
}) {
  if (reduce) {
    return (
      <div key={nodeId} className="flex flex-col gap-4">
        {children}
      </div>
    );
  }
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={nodeId}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-4"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function NodeInspector({
  nodeId,
  data,
  workflowId,
  fieldErrors = {},
  onChange,
}: NodeInspectorProps) {
  const reduce = useReducedMotionStrict();
  const [evalPresets, setEvalPresets] = useState<EvalPreset[]>([]);
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    api.listEvalPresets().then(setEvalPresets).catch(() => {});
    api.listCredentials().then(setCredentials).catch(() => {});
    api.listWorkflows().then((rows) => setWorkflows(rows.map((w) => ({ id: w.id, name: w.name })))).catch(() => {});
  }, []);

  const ICON_BY_CAT = {
    trigger: Zap,
    logic: GitBranch,
    llm: Sparkles,
    data: Database,
    integration: Plug,
    quality: Shield,
    flow: Workflow,
  } as const;

  function CategoryIcon({ category }: { category: NodeCategory }) {
    const Icon = ICON_BY_CAT[category];
    return <Icon className="h-4 w-4" />;
  }

  const baseId = useId();
  const fieldId = (name: string) => `${baseId}-${name}`;

  if (!nodeId || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface-input">
          <MousePointerClick className="h-5 w-5 text-muted" />
        </div>
        <div className="space-y-1">
          <h3 className="text-heading">No selection</h3>
          <p className="text-caption mx-auto max-w-[260px] leading-relaxed">
            Click a node on the canvas to configure it, or drag a new node from the sidebar.
          </p>
        </div>
        <div className="mt-2 w-full max-w-[260px] space-y-1.5">
          {[
            { key: "⌘K", label: "Search actions" },
            { key: "⌘S", label: "Save workflow" },
            { key: "?", label: "Keyboard shortcuts" },
          ].map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-input/70 px-3 py-1.5 text-left"
            >
              <span className="text-caption">{row.label}</span>
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-2xs text-muted">
                {row.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const update = (patch: Partial<NodeData>) => onChange(nodeId, { ...data, ...patch });
  const nodeDef = getNodeDefinition(data.nodeType, data.label);
  const cat = categorize(data.nodeType);
  const catColor = CATEGORY_COLOR_VAR[cat];

  const handlePresetChange = (presetId: string) => {
    const preset = evalPresets.find((p) => p.id === presetId);
    const isCustom = preset?.source === "custom";
    update({
      evalPreset: !presetId || isCustom ? undefined : presetId,
      evalCustomPresetId: isCustom ? presetId : undefined,
      criteria: preset?.criteria ?? data.criteria,
      scoreWeights: preset?.score_weights,
    });
  };

  return (
    <InspectorMotionShell reduce={reduce} nodeId={nodeId}>
        <div className="relative flex items-center gap-3 overflow-hidden border-b border-border px-5 py-4">
          <span
            className="absolute inset-y-0 left-0 w-[3px]"
            style={{ background: catColor }}
            aria-hidden
          />
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{
              background: `color-mix(in srgb, ${catColor} 14%, transparent)`,
              color: catColor,
            }}
          >
            <CategoryIcon category={cat} />
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <span className="text-micro" style={{ color: catColor }}>
              {CATEGORY_LABEL[cat]}
            </span>
            <Input
              className="text-body-lg h-7 border-transparent bg-transparent px-1 shadow-none focus-visible:border-border"
              value={data.label}
              onChange={(e) => update({ label: e.target.value })}
              aria-label="Node label"
            />
            {nodeDef?.description && (
              <p className="text-caption mt-0.5 line-clamp-2">{nodeDef.description}</p>
            )}
          </div>
        </div>

        <div className="space-y-4 px-4">

      {data.nodeType === "trigger" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("trigger-type")}>Trigger type</Label>
            <Select
              value={data.triggerType || "manual"}
              onValueChange={(value) => update({ triggerType: value as TriggerType })}
            >
              <SelectTrigger id={fieldId("trigger-type")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (run from UI)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="schedule">Schedule</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data.triggerType === "schedule" && (
            <TriggerScheduleFields
              cron={data.scheduleCron || ""}
              workflowId={workflowId}
              onCronChange={(value) => update({ scheduleCron: value })}
              fieldError={fieldErrors.scheduleCron}
            />
          )}
          {data.triggerType === "webhook" && workflowId && (
            <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2">
              <p className="text-xs font-medium text-muted">Ingress endpoint</p>
              <code className="mt-1 block break-all text-xs text-foreground">
                POST {(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}
                /api/workflows/{workflowId}/trigger
              </code>
              <p className="mt-2 form-hint">
                Send JSON: {`{"input": {"message": "..."}}`} — or call{" "}
                <code className="text-xs">api.triggerWorkflow(id, {"{ input }"})</code>
              </p>
            </div>
          )}
        </>
      )}

      {data.nodeType === "input_schema" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("input-fields")}>Input fields (comma-separated keys)</Label>
          <Input
            id={fieldId("input-fields")}
            value={(data.inputFields || []).map((f) => f.key).join(", ")}
            onChange={(e) =>
              update({
                inputFields: e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean)
                  .map((key) => ({ key, type: "string" as const, required: key === "message" })),
              })
            }
            placeholder="message, priority, user_email"
          />
          <p className="form-hint">
            Structures run input after Trigger. Use JSON run input or webhook payload.
          </p>
        </div>
      )}

      {data.nodeType === "if" && (
        <ConditionFields
          label="IF condition"
          condition={data.ifCondition || { left: "{{last_output}}", operator: "not_empty" }}
          onChange={(ifCondition) => update({ ifCondition })}
        />
      )}

      {data.nodeType === "filter" && (
        <ConditionFields
          label="Filter condition"
          condition={data.filterCondition || { left: "{{last_output}}", operator: "not_empty" }}
          onChange={(filterCondition) => update({ filterCondition })}
        />
      )}

      {data.nodeType === "switch" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("switch-value")}>Value to match</Label>
            <Input
              id={fieldId("switch-value")}
              value={data.switchValue || "{{last_output}}"}
              onChange={(e) => update({ switchValue: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("switch-cases")}>Cases (comma-separated)</Label>
            <Input
              id={fieldId("switch-cases")}
              value={(data.switchCases || []).join(", ")}
              onChange={(e) =>
                update({
                  switchCases: e.target.value
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("switch-default")}>Default route</Label>
            <Input
              id={fieldId("switch-default")}
              value={data.switchDefault || "default"}
              onChange={(e) => update({ switchDefault: e.target.value })}
            />
          </div>
          <p className="form-hint">Label outgoing edges with case names + default route.</p>
        </>
      )}

      {data.nodeType === "code" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("code")}>Python code</Label>
          <Textarea
            id={fieldId("code")}
            rows={8}
            value={data.code || "result = last_output"}
            onChange={(e) => update({ code: e.target.value })}
            className="font-mono text-xs"
            placeholder={"result = last_output\n# input, steps, memory, last_output available"}
          />
          <p className="form-hint">Set <code className="text-xs">result</code> to return a value. No imports.</p>
        </div>
      )}

      {data.nodeType === "memory_store" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("memory-namespace")}>Namespace</Label>
            <Input
              id={fieldId("memory-namespace")}
              value={data.memoryNamespace || "default"}
              onChange={(e) => update({ memoryNamespace: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("memory-key")}>Key</Label>
            <Input
              id={fieldId("memory-key")}
              value={data.memoryKey || "{{input.text}}"}
              onChange={(e) => update({ memoryKey: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("memory-value")}>Value</Label>
            <Input
              id={fieldId("memory-value")}
              value={data.memoryValue || "{{last_output}}"}
              onChange={(e) => update({ memoryValue: e.target.value })}
            />
          </div>
          <label htmlFor={fieldId("memory-persistent")} className="flex items-center gap-2 text-sm text-muted">
            <input
              id={fieldId("memory-persistent")}
              type="checkbox"
              checked={Boolean(data.memoryPersistent)}
              onChange={(e) => update({ memoryPersistent: e.target.checked })}
            />
            Persist across runs (Cognis-style)
          </label>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "memory_retrieve" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("retrieve-namespace")}>Namespace</Label>
            <Input
              id={fieldId("retrieve-namespace")}
              value={data.memoryNamespace || "default"}
              onChange={(e) => update({ memoryNamespace: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("retrieve-key")}>Key</Label>
            <Input
              id={fieldId("retrieve-key")}
              value={data.memoryKey || "{{input.text}}"}
              onChange={(e) => update({ memoryKey: e.target.value })}
            />
          </div>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "kb_retrieve" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-source")}>Document source</Label>
            <Select
              value={data.kbSource || "inline"}
              onValueChange={(value) =>
                update({ kbSource: value as "inline" | "workflow" })
              }
            >
              <SelectTrigger id={fieldId("kb-source")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inline">Inline (configured below)</SelectItem>
                <SelectItem value="workflow">Workflow knowledge base</SelectItem>
              </SelectContent>
            </Select>
            {data.kbSource === "workflow" && (
              <p className="form-hint">Add documents in the sidebar Data tab.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-query")}>Query</Label>
            <Input
              id={fieldId("kb-query")}
              value={data.kbQuery || "{{last_output}}"}
              onChange={(e) => update({ kbQuery: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-topk")}>Top K</Label>
            <Input
              id={fieldId("kb-topk")}
              type="number"
              min={1}
              max={10}
              value={data.kbTopK ?? 3}
              onChange={(e) => update({ kbTopK: Number(e.target.value) || 3 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-method")}>Retrieval method</Label>
            <Select
              value={data.kbMethod || "bm25"}
              onValueChange={(value) =>
                update({
                  kbMethod: value as "embedding" | "bm25" | "tfidf" | "keyword",
                })
              }
            >
              <SelectTrigger id={fieldId("kb-method")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="embedding">Vector embedding</SelectItem>
                <SelectItem value="bm25">BM25</SelectItem>
                <SelectItem value="tfidf">TF-IDF cosine</SelectItem>
                <SelectItem value="keyword">Keyword overlap</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(data.kbSource || "inline") === "inline" && (
            <div className="space-y-2">
              <Label htmlFor={fieldId("kb-documents")}>Documents (one per line: id|title|text)</Label>
              <Textarea
                id={fieldId("kb-documents")}
                rows={6}
                value={(data.kbDocuments || [])
                  .map((d) => `${d.id}|${d.title || ""}|${d.text}`)
                  .join("\n")}
                onChange={(e) => {
                  const kbDocuments = e.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [id, title, ...rest] = line.split("|");
                      return { id: id.trim(), title: title?.trim(), text: rest.join("|").trim() };
                    });
                  update({ kbDocuments });
                }}
                placeholder="doc1|FAQ|How to reset password..."
              />
            </div>
          )}
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "sub_workflow" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("subworkflow-id")}>Target workflow</Label>
            <Select
              value={data.subWorkflowId || undefined}
              onValueChange={(value) => update({ subWorkflowId: value })}
            >
              <SelectTrigger id={fieldId("subworkflow-id")} className="w-full">
                <SelectValue placeholder="Select workflow…" />
              </SelectTrigger>
              <SelectContent>
                {workflows
                  .filter((w) => w.id !== workflowId)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("subworkflow-input")}>Input to child workflow</Label>
            <Input
              id={fieldId("subworkflow-input")}
              value={data.subWorkflowInput || "{{last_output}}"}
              onChange={(e) => update({ subWorkflowInput: e.target.value })}
            />
          </div>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "integration" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("integration-type")}>Integration type</Label>
            <Select
              value={data.integrationType || "slack"}
              onValueChange={(value) =>
                update({ integrationType: value as IntegrationType })
              }
            >
              <SelectTrigger id={fieldId("integration-type")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="postgres">Postgres</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("credential-name")} required>Credential</Label>
            <Select
              value={data.credentialName || undefined}
              onValueChange={(name) => {
                const match = credentials.find((c) => c.name === name);
                update({ credentialName: name, credentialId: match?.id });
              }}
            >
              <SelectTrigger
                id={fieldId("credential-name")}
                className={cn("w-full", fieldErrors.credentialName && "border-destructive")}
              >
                <SelectValue placeholder="Select credential…" />
              </SelectTrigger>
              <SelectContent>
                {credentials
                  .filter((c) => c.type === (data.integrationType || "slack"))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.credentialName} />
            <p className="form-hint">Create credentials in Settings.</p>
          </div>
          {data.integrationType === "slack" && (
            <div className="space-y-2">
              <Label htmlFor={fieldId("integration-message")}>Message</Label>
              <Textarea
                id={fieldId("integration-message")}
                rows={3}
                value={data.integrationMessage || "{{last_output}}"}
                onChange={(e) => update({ integrationMessage: e.target.value })}
              />
            </div>
          )}
          {data.integrationType === "email" && (
            <>
              <div className="space-y-2">
                <Label htmlFor={fieldId("integration-subject")}>Subject</Label>
                <Input
                  id={fieldId("integration-subject")}
                  value={data.integrationSubject || ""}
                  onChange={(e) => update({ integrationSubject: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={fieldId("integration-body")}>Body</Label>
                <Textarea
                  id={fieldId("integration-body")}
                  rows={4}
                  value={data.integrationBody || "{{last_output}}"}
                  onChange={(e) => update({ integrationBody: e.target.value })}
                />
              </div>
            </>
          )}
          {data.integrationType === "postgres" && (
            <div className="space-y-2">
              <Label htmlFor={fieldId("integration-query")} required>SQL query (read-only)</Label>
              <Textarea
                id={fieldId("integration-query")}
                rows={4}
                value={data.integrationQuery || "SELECT 1"}
                onChange={(e) => update({ integrationQuery: e.target.value })}
                className={cn(
                  "font-mono text-xs",
                  fieldErrors.integrationQuery && "border-destructive"
                )}
              />
              <FieldError message={fieldErrors.integrationQuery} />
            </div>
          )}
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "human_approval" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("content-to-review")}>Content to review</Label>
          <Textarea id={fieldId("content-to-review")}
            rows={4}
            value={data.approvalReview || "{{last_output}}"}
            onChange={(e) => update({ approvalReview: e.target.value })}
          />
          <p className="form-hint">
            Run pauses until approved from the run detail page. {EXPRESSION_HINT}
          </p>
        </div>
      )}

      {data.nodeType === "set_fields" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("fields-key-template-per-line")}>Fields (key=template per line)</Label>
          <Textarea id={fieldId("fields-key-template-per-line")}
            rows={5}
            value={Object.entries(data.setFields || {})
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")}
            onChange={(e) => {
              const setFields: Record<string, string> = {};
              for (const line of e.target.value.split("\n")) {
                const idx = line.indexOf("=");
                if (idx > 0) {
                  setFields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
                }
              }
              update({ setFields });
            }}
            placeholder={"summary={{steps.agent_1.output}}\npriority=high"}
          />
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </div>
      )}

      {data.nodeType === "end" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("output-description")}>Output description</Label>
          <Textarea id={fieldId("output-description")}
            rows={3}
            value={data.endDescription || ""}
            onChange={(e) => update({ endDescription: e.target.value })}
            placeholder="Describe what this workflow returns"
          />
          <p className="form-hint">
            The End node receives the last step&apos;s output as the workflow result.
          </p>
        </div>
      )}

      {data.nodeType === "agent" && (
        <div className="space-y-2">
          <Label required>Instruction</Label>
          <Textarea
            rows={5}
            value={data.instruction || ""}
            onChange={(e) => update({ instruction: e.target.value })}
            placeholder="You are a helpful assistant…"
            className={fieldErrors.instruction ? "border-destructive" : undefined}
          />
          <FieldError message={fieldErrors.instruction} />
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </div>
      )}

      {data.nodeType === "tool" && data.toolType === "search" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("search-provider")}>Search provider</Label>
          <Select
            value={data.searchProvider || "google"}
            onValueChange={(value) => update({ searchProvider: value as SearchProvider })}
          >
            <SelectTrigger id={fieldId("search-provider")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google Search (default)</SelectItem>
              <SelectItem value="exa">EXA</SelectItem>
              <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {data.nodeType === "evaluation" && (
        <>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={fieldId("eval-strategy")}>Eval strategy</Label>
              <Select
                value={data.evalType || "llm"}
                onValueChange={(value) =>
                  update({
                    evalType: value as "llm" | "exact" | "substring" | "regex" | "embedding",
                    evalExecutionMode:
                      value === "llm" ? data.evalExecutionMode || "parallel" : "parallel",
                  })
                }
              >
                <SelectTrigger id={fieldId("eval-strategy")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llm">LLM grading (Gemini)</SelectItem>
                  <SelectItem value="exact">Exact match</SelectItem>
                  <SelectItem value="substring">Substring match</SelectItem>
                  <SelectItem value="regex">Regex match</SelectItem>
                  <SelectItem value="embedding">Embedding similarity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(data.evalType || "llm") === "llm" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("eval-preset")}>Eval preset</Label>
                <Select
                  value={data.evalCustomPresetId || data.evalPreset || undefined}
                  onValueChange={handlePresetChange}
                >
                  <SelectTrigger id={fieldId("eval-preset")} className="w-full">
                    <SelectValue placeholder="Custom criteria" />
                  </SelectTrigger>
                  <SelectContent>
                    {evalPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                        {preset.source === "custom" ? " (custom)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={fieldId("pass-threshold-aggregate-1-5")}>Pass threshold (aggregate 1–5)</Label>
              <Input id={fieldId("pass-threshold-aggregate-1-5")}
                type="number"
                min={1}
                max={5}
                step={0.1}
                value={data.evalThreshold ?? ""}
                onChange={(e) =>
                  update({
                    evalThreshold: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 3.5"
              />
            </div>
          </div>

          <InspectorDetails title="Advanced">
            {(data.evalType || "llm") === "llm" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("criteria")}>Criteria</Label>
                <Textarea id={fieldId("criteria")}
                  rows={3}
                  value={data.criteria || ""}
                  onChange={(e) => update({ criteria: e.target.value })}
                />
              </div>
            )}

            {(data.evalType === "exact" || data.evalType === "substring") && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("expected-value")}>Expected value</Label>
                <Textarea id={fieldId("expected-value")}
                  rows={2}
                  value={data.evalExpected || ""}
                  onChange={(e) => update({ evalExpected: e.target.value })}
                  placeholder="Expected output or required substring"
                />
              </div>
            )}

            {data.evalType === "regex" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("regex-pattern")}>Regex pattern</Label>
                <Input id={fieldId("regex-pattern")}
                  value={data.evalPattern || ""}
                  onChange={(e) => update({ evalPattern: e.target.value })}
                  placeholder="e.g. ^\\{.*\\}$"
                />
              </div>
            )}

            {data.evalType === "embedding" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor={fieldId("baseline-answer")}>Baseline answer</Label>
                  <Textarea id={fieldId("baseline-answer")}
                    rows={3}
                    value={data.evalBaseline || ""}
                    onChange={(e) => update({ evalBaseline: e.target.value })}
                    placeholder="Reference answer for similarity scoring"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={fieldId("similarity-threshold-0-1")}>Similarity threshold (0–1)</Label>
                  <Input id={fieldId("similarity-threshold-0-1")}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={data.evalSimilarityThreshold ?? 0.75}
                    onChange={(e) =>
                      update({
                        evalSimilarityThreshold: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </>
            )}

            {(data.evalType || "llm") === "llm" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("execution-mode")}>Execution mode</Label>
                <Select
                  value={data.evalExecutionMode || "parallel"}
                  onValueChange={(value) =>
                    update({ evalExecutionMode: value as "parallel" | "inline" })
                  }
                >
                  <SelectTrigger id={fieldId("execution-mode")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parallel">Parallel (post-run, lower latency)</SelectItem>
                    <SelectItem value="inline">Inline (blocking, in workflow path)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="form-hint">
                  Parallel runs evals after the workflow finishes, using concurrent LLM calls.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={fieldId("on-threshold-fail")}>On threshold fail</Label>
              <Select
                value={data.evalFailBehavior || "none"}
                onValueChange={(value) =>
                  update({ evalFailBehavior: value as "none" | "warn" | "block" })
                }
              >
                <SelectTrigger id={fieldId("on-threshold-fail")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Record only (observability)</SelectItem>
                  <SelectItem value="warn">Warn (continue run)</SelectItem>
                  <SelectItem value="block">Block (fail run)</SelectItem>
                </SelectContent>
              </Select>
              <p className="form-hint">
                Block stops the workflow and fires a quality webhook if configured.
              </p>
            </div>
          </InspectorDetails>
        </>
      )}

      {data.nodeType === "summarizer" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("summary-style")}>Summary style</Label>
          <Select
            value={data.summaryStyle || "concise"}
            onValueChange={(value) => update({ summaryStyle: value as SummaryStyle })}
          >
            <SelectTrigger id={fieldId("summary-style")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concise">Concise</SelectItem>
              <SelectItem value="detailed">Detailed</SelectItem>
              <SelectItem value="bullet">Bullet points</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {data.nodeType === "translator" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("target-language")}>Target language</Label>
          <Input id={fieldId("target-language")}
            value={data.targetLanguage || "English"}
            onChange={(e) => update({ targetLanguage: e.target.value })}
            placeholder="Spanish, French, Hindi..."
          />
        </div>
      )}

      {data.nodeType === "extractor" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("fields-to-extract-comma-separate")}>Fields to extract (comma-separated)</Label>
          <Input id={fieldId("fields-to-extract-comma-separate")}
            value={(data.extractFields || []).join(", ")}
            onChange={(e) =>
              update({
                extractFields: e.target.value
                  .split(",")
                  .map((f) => f.trim())
                  .filter(Boolean),
              })
            }
            placeholder="summary, entities, dates"
          />
        </div>
      )}

      {data.nodeType === "transform" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("template")}>Template</Label>
          <Textarea id={fieldId("template")}
            rows={4}
            value={data.template || "{{input}}"}
            onChange={(e) => update({ template: e.target.value })}
            placeholder="{{input}} or {{steps.node_1.output}}"
          />
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </div>
      )}

      {data.nodeType === "json_parse" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("json-path-optional")}>JSON path (optional)</Label>
          <Input id={fieldId("json-path-optional")}
            value={data.jsonPath || ""}
            onChange={(e) => update({ jsonPath: e.target.value })}
            placeholder="e.g. data.items.0.name"
          />
        </div>
      )}

      {data.nodeType === "delay" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("delay-seconds")}>Delay (seconds)</Label>
          <Input id={fieldId("delay-seconds")}
            type="number"
            min={0.1}
            max={30}
            step={0.1}
            value={data.delaySeconds ?? 1}
            onChange={(e) => update({ delaySeconds: Number(e.target.value) })}
          />
        </div>
      )}

      {data.nodeType === "note" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("note")}>Note</Label>
          <Textarea id={fieldId("note")}
            rows={4}
            value={data.noteText || ""}
            onChange={(e) => update({ noteText: e.target.value })}
            placeholder="Document intent, TODOs, or team notes"
          />
        </div>
      )}

      {data.nodeType === "tool" && data.toolType === "http" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={fieldId("method")}>Method</Label>
            <Select
              value={data.httpMethod || "GET"}
              onValueChange={(value) => update({ httpMethod: value as HttpMethod })}
            >
              <SelectTrigger id={fieldId("method")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("url")}>URL</Label>
            <Input id={fieldId("url")}
              value={data.httpUrl || ""}
              onChange={(e) => update({ httpUrl: e.target.value })}
              placeholder="https://api.example.com/{{input.id}}"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("body-template-optional")}>Body template (optional)</Label>
            <Textarea id={fieldId("body-template-optional")}
              rows={3}
              value={data.httpBody || ""}
              onChange={(e) => update({ httpBody: e.target.value })}
              placeholder='{"query": "{{last_output}}"}'
            />
          </div>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "router" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("routes-comma-separated")}>Routes (comma-separated)</Label>
          <Input id={fieldId("routes-comma-separated")}
            value={(data.routes || []).join(", ")}
            onChange={(e) =>
              update({
                routes: e.target.value
                  .split(",")
                  .map((r) => r.trim())
                  .filter(Boolean),
              })
            }
            placeholder="math, general, fallback"
          />
          <p className="form-hint">
            Label outgoing edges with matching route keys in the edge inspector.
          </p>
        </div>
      )}

      {data.nodeType === "classifier" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("categories-comma-separated")}>Categories (comma-separated)</Label>
          <Input id={fieldId("categories-comma-separated")}
            value={(data.categories || []).join(", ")}
            onChange={(e) =>
              update({
                categories: e.target.value
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              })
            }
            placeholder="support, sales, billing"
          />
          <p className="form-hint">
            Label outgoing edges with category names for branching.
          </p>
        </div>
      )}

      {data.nodeType === "join" && (
        <p className="form-hint">
          Merges parallel branches. Connect multiple incoming edges to this node.
        </p>
      )}

      {data.nodeType === "guardrail" && (
        <>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={fieldId("guardrail-engine")}>Guardrail engine</Label>
              <Select
                value={data.rules?.guardrail_type || "rules"}
                onValueChange={(value) =>
                  update({
                    rules: {
                      ...data.rules,
                      guardrail_type: value as GuardrailType,
                    },
                  })
                }
              >
                <SelectTrigger id={fieldId("guardrail-engine")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rules">Rule-based (keywords, regex, PII)</SelectItem>
                  <SelectItem value="llm">LLM policy check (Gemini)</SelectItem>
                  <SelectItem value="presidio">Presidio PII (entity detection)</SelectItem>
                  <SelectItem value="prompt_injection">Prompt injection shield (Gemini)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={fieldId("mode")}>Mode</Label>
              <Select
                value={data.rules?.mode || "output"}
                onValueChange={(value) =>
                  update({
                    rules: { ...data.rules, mode: value as GuardrailMode },
                  })
                }
              >
                <SelectTrigger id={fieldId("mode")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="input">Input (before agent)</SelectItem>
                  <SelectItem value="output">Output (after agent)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={fieldId("fail-behavior")}>Fail behavior</Label>
              <Select
                value={data.rules?.fail_behavior || "block"}
                onValueChange={(value) =>
                  update({
                    rules: {
                      ...data.rules,
                      fail_behavior: value as GuardrailFailBehavior,
                    },
                  })
                }
              >
                <SelectTrigger id={fieldId("fail-behavior")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block (stop workflow)</SelectItem>
                  <SelectItem value="warn">Warn (continue)</SelectItem>
                  <SelectItem value="mask">Mask PII (redact and continue)</SelectItem>
                  <SelectItem value="fallback">Fallback value (replace output)</SelectItem>
                  <SelectItem value="route">Route to branch (pass / failed edges)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <InspectorDetails title="Rules">
            {(data.rules?.guardrail_type || "rules") === "llm" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("llm-policy-instruction")}>LLM policy instruction</Label>
                <Textarea id={fieldId("llm-policy-instruction")}
                  rows={4}
                  value={data.rules?.llm_instruction || ""}
                  onChange={(e) =>
                    update({
                      rules: { ...data.rules, llm_instruction: e.target.value },
                    })
                  }
                  placeholder="Describe what content should pass or fail…"
                />
              </div>
            )}

            {data.rules?.guardrail_type === "prompt_injection" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("injection-classifier-instruction")}>Injection classifier instruction</Label>
                <Textarea id={fieldId("injection-classifier-instruction")}
                  rows={4}
                  value={data.rules?.llm_instruction || ""}
                  onChange={(e) =>
                    update({
                      rules: { ...data.rules, llm_instruction: e.target.value },
                    })
                  }
                  placeholder="Optional custom instructions for the injection classifier…"
                />
                <p className="form-hint">
                  Best used on input-mode guardrails before agent nodes.
                </p>
              </div>
            )}

            {data.rules?.guardrail_type === "presidio" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("presidio-entities-comma-separate")}>Presidio entities (comma-separated)</Label>
                <Input id={fieldId("presidio-entities-comma-separate")}
                  value={(data.rules?.presidio_entities || []).join(", ")}
                  onChange={(e) =>
                    update({
                      rules: {
                        ...data.rules,
                        presidio_entities: e.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  placeholder="EMAIL_ADDRESS, PHONE_NUMBER, US_SSN"
                />
                <p className="form-hint">
                  Requires PRESIDIO_ENABLED=true and presidio-analyzer installed on the backend.
                </p>
              </div>
            )}

            {data.rules?.fail_behavior === "route" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={fieldId("pass-route-label")}>Pass route label</Label>
                  <Input id={fieldId("pass-route-label")}
                    value={data.rules?.pass_route || "pass"}
                    onChange={(e) =>
                      update({
                        rules: { ...data.rules, pass_route: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={fieldId("failure-route-label")}>Failure route label</Label>
                  <Input id={fieldId("failure-route-label")}
                    value={data.rules?.failure_route || "failed"}
                    onChange={(e) =>
                      update({
                        rules: { ...data.rules, failure_route: e.target.value },
                      })
                    }
                  />
                </div>
                <p className="form-hint col-span-2">
                  Label outgoing edges with these route keys in the edge inspector.
                </p>
              </div>
            )}

            {data.rules?.fail_behavior === "fallback" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("fallback-value")}>Fallback value</Label>
                <Input id={fieldId("fallback-value")}
                  value={data.rules?.fallback_value || ""}
                  onChange={(e) =>
                    update({
                      rules: { ...data.rules, fallback_value: e.target.value },
                    })
                  }
                  placeholder="Sorry, I cannot process this response."
                />
              </div>
            )}

            {(data.rules?.guardrail_type || "rules") === "rules" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor={fieldId("blocked-keywords-comma-separated")}>Blocked keywords (comma-separated)</Label>
                  <Input id={fieldId("blocked-keywords-comma-separated")}
                    value={(data.rules?.blocked_keywords || []).join(", ")}
                    onChange={(e) =>
                      update({
                        rules: {
                          ...data.rules,
                          blocked_keywords: e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldId("required-keywords-comma-separate")}>Required keywords (comma-separated)</Label>
                  <Input id={fieldId("required-keywords-comma-separate")}
                    value={(data.rules?.required_keywords || []).join(", ")}
                    onChange={(e) =>
                      update({
                        rules: {
                          ...data.rules,
                          required_keywords: e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="e.g. refund, policy"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldId("blocked-regex-patterns-one-per-l")}>Blocked regex patterns (one per line)</Label>
                  <Textarea id={fieldId("blocked-regex-patterns-one-per-l")}
                    rows={2}
                    value={(data.rules?.blocked_patterns || []).join("\n")}
                    onChange={(e) =>
                      update({
                        rules: {
                          ...data.rules,
                          blocked_patterns: e.target.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    placeholder="(?i)password\s*[:=]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldId("required-regex-pattern")}>Required regex pattern</Label>
                  <Input id={fieldId("required-regex-pattern")}
                    value={data.rules?.pattern || ""}
                    onChange={(e) =>
                      update({
                        rules: { ...data.rules, pattern: e.target.value },
                      })
                    }
                    placeholder="e.g. ^[A-Za-z].*"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={fieldId("min-length")}>Min length</Label>
                    <Input id={fieldId("min-length")}
                      type="number"
                      min={0}
                      value={data.rules?.min_length ?? ""}
                      onChange={(e) =>
                        update({
                          rules: {
                            ...data.rules,
                            min_length: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="e.g. 10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={fieldId("max-length")}>Max length</Label>
                    <Input id={fieldId("max-length")}
                      type="number"
                      min={1}
                      value={data.rules?.max_length ?? ""}
                      onChange={(e) =>
                        update({
                          rules: {
                            ...data.rules,
                            max_length: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="e.g. 500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={data.rules?.detect_pii ?? false}
                    onChange={(e) =>
                      update({
                        rules: { ...data.rules, detect_pii: e.target.checked },
                      })
                    }
                    className="rounded border-border-strong"
                  />
                  Detect PII (email, phone)
                </label>
              </>
            )}
          </InspectorDetails>

          <InspectorDetails title="Testing / Preview">
            <GuardrailPreviewPanel rules={data.rules} />
          </InspectorDetails>
        </>
      )}

      {RELIABILITY_NODE_TYPES.has(data.nodeType) && (
        <InspectorDetails title="Reliability">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor={fieldId("retries")} className="text-xs">Retries</Label>
              <Input
                id={fieldId("retries")}
                type="number"
                min={0}
                max={5}
                value={data.retries ?? 0}
                onChange={(e) => update({ retries: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("retry-delay")} className="text-xs">Delay (s)</Label>
              <Input
                id={fieldId("retry-delay")}
                type="number"
                min={0}
                step={0.5}
                value={data.retryDelaySec ?? 1}
                onChange={(e) => update({ retryDelaySec: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("timeout")} className="text-xs">Timeout (s)</Label>
              <Input
                id={fieldId("timeout")}
                type="number"
                min={0}
                value={data.timeoutSec ?? ""}
                placeholder="none"
                onChange={(e) =>
                  update({ timeoutSec: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </div>
          </div>
          <p className="form-hint">
            Failed attempts retry with exponential backoff. Applies to tool/data/integration
            nodes; LLM agents are governed by the run timeout.
          </p>
        </InspectorDetails>
      )}
        </div>
    </InspectorMotionShell>
  );
}
