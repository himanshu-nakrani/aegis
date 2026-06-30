"use client";

import { useEffect, useState } from "react";
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
      <Label className="text-xs">Test sample</Label>
      <Textarea rows={3} value={sample} onChange={(e) => setSample(e.target.value)} />
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
        <Label>Preset</Label>
        <Select onValueChange={onCronChange}>
          <SelectTrigger className="w-full">
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
        <Label required>Cron Expression</Label>
        <Input
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
          <ul className="mt-1 space-y-0.5 text-[11px] text-foreground">
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
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface px-3 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="space-y-2">
        <Label>Left value</Label>
        <Input
          value={condition.left}
          onChange={(e) => onChange({ ...condition, left: e.target.value })}
          placeholder="{{input.priority}}"
        />
      </div>
      <div className="space-y-2">
        <Label>Operator</Label>
        <Select
          value={condition.operator}
          onValueChange={(value) =>
            onChange({ ...condition, operator: value as ConditionOperator })
          }
        >
          <SelectTrigger className="w-full">
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
          <Label>Right value</Label>
          <Input
            value={condition.right || ""}
            onChange={(e) => onChange({ ...condition, right: e.target.value })}
          />
        </div>
      )}
      <p className="form-hint">{EXPRESSION_HINT}</p>
    </div>
  );
}

export function NodeInspector({
  nodeId,
  data,
  workflowId,
  fieldErrors = {},
  onChange,
}: NodeInspectorProps) {
  const [evalPresets, setEvalPresets] = useState<EvalPreset[]>([]);
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    api.listEvalPresets().then(setEvalPresets).catch(() => {});
    api.listCredentials().then(setCredentials).catch(() => {});
    api.listWorkflows().then((rows) => setWorkflows(rows.map((w) => ({ id: w.id, name: w.name })))).catch(() => {});
  }, []);

  if (!nodeId || !data) {
    return (
      <div className="inspector-empty">
        <p className="text-sm font-medium text-foreground">No selection</p>
        <p className="mt-1 text-sm text-muted">Select a node or connection to configure it</p>
      </div>
    );
  }

  const update = (patch: Partial<NodeData>) => onChange(nodeId, { ...data, ...patch });
  const nodeDef = getNodeDefinition(data.nodeType, data.label);

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
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <p className="text-xs font-medium text-muted">Node type</p>
        <p className="mt-0.5 text-sm font-medium capitalize text-foreground">
          {nodeDef?.label ?? data.nodeType}
        </p>
        {nodeDef?.description && (
          <p className="mt-1 text-xs text-muted">{nodeDef.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Label</Label>
        <Input value={data.label} onChange={(e) => update({ label: e.target.value })} />
      </div>

      {data.nodeType === "trigger" && (
        <>
          <div className="space-y-2">
            <Label>Trigger Type</Label>
            <Select
              value={data.triggerType || "manual"}
              onValueChange={(value) => update({ triggerType: value as TriggerType })}
            >
              <SelectTrigger className="w-full">
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
              <code className="mt-1 block break-all text-[11px] text-foreground">
                POST {(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}
                /api/workflows/{workflowId}/trigger
              </code>
              <p className="mt-2 form-hint">
                Send JSON: {`{"input": {"message": "..."}}`} — or call{" "}
                <code className="text-[11px]">api.triggerWorkflow(id, {"{ input }"})</code>
              </p>
            </div>
          )}
        </>
      )}

      {data.nodeType === "input_schema" && (
        <div className="space-y-2">
          <Label>Input fields (comma-separated keys)</Label>
          <Input
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
            <Label>Value to match</Label>
            <Input
              value={data.switchValue || "{{last_output}}"}
              onChange={(e) => update({ switchValue: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Cases (comma-separated)</Label>
            <Input
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
            <Label>Default route</Label>
            <Input
              value={data.switchDefault || "default"}
              onChange={(e) => update({ switchDefault: e.target.value })}
            />
          </div>
          <p className="form-hint">Label outgoing edges with case names + default route.</p>
        </>
      )}

      {data.nodeType === "code" && (
        <div className="space-y-2">
          <Label>Python code</Label>
          <Textarea
            rows={8}
            value={data.code || "result = last_output"}
            onChange={(e) => update({ code: e.target.value })}
            className="font-mono text-xs"
            placeholder={"result = last_output\n# input, steps, memory, last_output available"}
          />
          <p className="form-hint">Set <code className="text-[11px]">result</code> to return a value. No imports.</p>
        </div>
      )}

      {data.nodeType === "memory_store" && (
        <>
          <div className="space-y-2">
            <Label>Namespace</Label>
            <Input
              value={data.memoryNamespace || "default"}
              onChange={(e) => update({ memoryNamespace: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Key</Label>
            <Input
              value={data.memoryKey || "{{input.text}}"}
              onChange={(e) => update({ memoryKey: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Input
              value={data.memoryValue || "{{last_output}}"}
              onChange={(e) => update({ memoryValue: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
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
            <Label>Namespace</Label>
            <Input
              value={data.memoryNamespace || "default"}
              onChange={(e) => update({ memoryNamespace: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Key</Label>
            <Input
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
            <Label>Document source</Label>
            <Select
              value={data.kbSource || "inline"}
              onValueChange={(value) =>
                update({ kbSource: value as "inline" | "workflow" })
              }
            >
              <SelectTrigger className="w-full">
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
            <Label>Query</Label>
            <Input
              value={data.kbQuery || "{{last_output}}"}
              onChange={(e) => update({ kbQuery: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Top K</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={data.kbTopK ?? 3}
              onChange={(e) => update({ kbTopK: Number(e.target.value) || 3 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Retrieval method</Label>
            <Select
              value={data.kbMethod || "bm25"}
              onValueChange={(value) =>
                update({
                  kbMethod: value as "embedding" | "bm25" | "tfidf" | "keyword",
                })
              }
            >
              <SelectTrigger className="w-full">
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
              <Label>Documents (one per line: id|title|text)</Label>
              <Textarea
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
            <Label>Target workflow</Label>
            <Select
              value={data.subWorkflowId || undefined}
              onValueChange={(value) => update({ subWorkflowId: value })}
            >
              <SelectTrigger className="w-full">
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
            <Label>Input to child workflow</Label>
            <Input
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
            <Label>Integration type</Label>
            <Select
              value={data.integrationType || "slack"}
              onValueChange={(value) =>
                update({ integrationType: value as IntegrationType })
              }
            >
              <SelectTrigger className="w-full">
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
            <Label required>Credential</Label>
            <Select
              value={data.credentialName || undefined}
              onValueChange={(name) => {
                const match = credentials.find((c) => c.name === name);
                update({ credentialName: name, credentialId: match?.id });
              }}
            >
              <SelectTrigger
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
              <Label>Message</Label>
              <Textarea
                rows={3}
                value={data.integrationMessage || "{{last_output}}"}
                onChange={(e) => update({ integrationMessage: e.target.value })}
              />
            </div>
          )}
          {data.integrationType === "email" && (
            <>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={data.integrationSubject || ""}
                  onChange={(e) => update({ integrationSubject: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  rows={4}
                  value={data.integrationBody || "{{last_output}}"}
                  onChange={(e) => update({ integrationBody: e.target.value })}
                />
              </div>
            </>
          )}
          {data.integrationType === "postgres" && (
            <div className="space-y-2">
              <Label required>SQL query (read-only)</Label>
              <Textarea
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
          <Label>Content to review</Label>
          <Textarea
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
          <Label>Fields (key=template per line)</Label>
          <Textarea
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
          <Label>Output Description</Label>
          <Textarea
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
          <Label>Search Provider</Label>
          <Select
            value={data.searchProvider || "google"}
            onValueChange={(value) => update({ searchProvider: value as SearchProvider })}
          >
            <SelectTrigger className="w-full">
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
              <Label>Eval Strategy</Label>
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
                <SelectTrigger className="w-full">
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
                <Label>Eval Preset</Label>
                <Select
                  value={data.evalCustomPresetId || data.evalPreset || undefined}
                  onValueChange={handlePresetChange}
                >
                  <SelectTrigger className="w-full">
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
              <Label>Pass Threshold (aggregate 1–5)</Label>
              <Input
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
                <Label>Criteria</Label>
                <Textarea
                  rows={3}
                  value={data.criteria || ""}
                  onChange={(e) => update({ criteria: e.target.value })}
                />
              </div>
            )}

            {(data.evalType === "exact" || data.evalType === "substring") && (
              <div className="space-y-2">
                <Label>Expected Value</Label>
                <Textarea
                  rows={2}
                  value={data.evalExpected || ""}
                  onChange={(e) => update({ evalExpected: e.target.value })}
                  placeholder="Expected output or required substring"
                />
              </div>
            )}

            {data.evalType === "regex" && (
              <div className="space-y-2">
                <Label>Regex Pattern</Label>
                <Input
                  value={data.evalPattern || ""}
                  onChange={(e) => update({ evalPattern: e.target.value })}
                  placeholder="e.g. ^\\{.*\\}$"
                />
              </div>
            )}

            {data.evalType === "embedding" && (
              <>
                <div className="space-y-2">
                  <Label>Baseline Answer</Label>
                  <Textarea
                    rows={3}
                    value={data.evalBaseline || ""}
                    onChange={(e) => update({ evalBaseline: e.target.value })}
                    placeholder="Reference answer for similarity scoring"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Similarity Threshold (0–1)</Label>
                  <Input
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
                <Label>Execution Mode</Label>
                <Select
                  value={data.evalExecutionMode || "parallel"}
                  onValueChange={(value) =>
                    update({ evalExecutionMode: value as "parallel" | "inline" })
                  }
                >
                  <SelectTrigger className="w-full">
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
              <Label>On Threshold Fail</Label>
              <Select
                value={data.evalFailBehavior || "none"}
                onValueChange={(value) =>
                  update({ evalFailBehavior: value as "none" | "warn" | "block" })
                }
              >
                <SelectTrigger className="w-full">
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
          <Label>Summary Style</Label>
          <Select
            value={data.summaryStyle || "concise"}
            onValueChange={(value) => update({ summaryStyle: value as SummaryStyle })}
          >
            <SelectTrigger className="w-full">
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
          <Label>Target Language</Label>
          <Input
            value={data.targetLanguage || "English"}
            onChange={(e) => update({ targetLanguage: e.target.value })}
            placeholder="Spanish, French, Hindi..."
          />
        </div>
      )}

      {data.nodeType === "extractor" && (
        <div className="space-y-2">
          <Label>Fields to Extract (comma-separated)</Label>
          <Input
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
          <Label>Template</Label>
          <Textarea
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
          <Label>JSON Path (optional)</Label>
          <Input
            value={data.jsonPath || ""}
            onChange={(e) => update({ jsonPath: e.target.value })}
            placeholder="e.g. data.items.0.name"
          />
        </div>
      )}

      {data.nodeType === "delay" && (
        <div className="space-y-2">
          <Label>Delay (seconds)</Label>
          <Input
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
          <Label>Note</Label>
          <Textarea
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
            <Label>Method</Label>
            <Select
              value={data.httpMethod || "GET"}
              onValueChange={(value) => update({ httpMethod: value as HttpMethod })}
            >
              <SelectTrigger className="w-full">
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
            <Label>URL</Label>
            <Input
              value={data.httpUrl || ""}
              onChange={(e) => update({ httpUrl: e.target.value })}
              placeholder="https://api.example.com/{{input.id}}"
            />
          </div>
          <div className="space-y-2">
            <Label>Body Template (optional)</Label>
            <Textarea
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
          <Label>Routes (comma-separated)</Label>
          <Input
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
          <Label>Categories (comma-separated)</Label>
          <Input
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
              <Label>Guardrail Engine</Label>
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
                <SelectTrigger className="w-full">
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
              <Label>Mode</Label>
              <Select
                value={data.rules?.mode || "output"}
                onValueChange={(value) =>
                  update({
                    rules: { ...data.rules, mode: value as GuardrailMode },
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="input">Input (before agent)</SelectItem>
                  <SelectItem value="output">Output (after agent)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fail Behavior</Label>
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
                <SelectTrigger className="w-full">
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
                <Label>LLM Policy Instruction</Label>
                <Textarea
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
                <Label>Injection Classifier Instruction</Label>
                <Textarea
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
                <Label>Presidio Entities (comma-separated)</Label>
                <Input
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
                  <Label>Pass Route Label</Label>
                  <Input
                    value={data.rules?.pass_route || "pass"}
                    onChange={(e) =>
                      update({
                        rules: { ...data.rules, pass_route: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Failure Route Label</Label>
                  <Input
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
                <Label>Fallback Value</Label>
                <Input
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
                  <Label>Blocked Keywords (comma-separated)</Label>
                  <Input
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
                  <Label>Required Keywords (comma-separated)</Label>
                  <Input
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
                  <Label>Blocked Regex Patterns (one per line)</Label>
                  <Textarea
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
                  <Label>Required Regex Pattern</Label>
                  <Input
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
                    <Label>Min Length</Label>
                    <Input
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
                    <Label>Max Length</Label>
                    <Input
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
    </div>
  );
}