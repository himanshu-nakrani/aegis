"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { EXPRESSION_HINT, getNodeDefinition } from "@/lib/node-registry";
import type {
  ConditionOperator,
  EvalPreset,
  GuardrailFailBehavior,
  GuardrailMode,
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
  onChange: (nodeId: string, data: NodeData) => void;
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
}: {
  cron: string;
  workflowId?: string;
  onCronChange: (value: string) => void;
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
          setPreviewError("Invalid cron expression");
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
        <Select
          value=""
          onChange={(e) => {
            if (e.target.value) onCronChange(e.target.value);
          }}
        >
          <option value="">Choose a preset…</option>
          {CRON_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Cron Expression</Label>
        <Input
          value={cron}
          onChange={(e) => onCronChange(e.target.value)}
          placeholder="0 9 * * 1-5"
        />
        <p className="form-hint">Standard 5-field cron (UTC). Background scheduler fires runs automatically.</p>
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
          onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
        >
          <option value="eq">Equals</option>
          <option value="neq">Not equals</option>
          <option value="contains">Contains</option>
          <option value="not_contains">Not contains</option>
          <option value="empty">Is empty</option>
          <option value="not_empty">Is not empty</option>
          <option value="gt">Greater than</option>
          <option value="lt">Less than</option>
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

export function NodeInspector({ nodeId, data, workflowId, onChange }: NodeInspectorProps) {
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
              onChange={(e) => update({ triggerType: e.target.value as TriggerType })}
            >
              <option value="manual">Manual (run from UI)</option>
              <option value="webhook">Webhook</option>
              <option value="schedule">Schedule</option>
            </Select>
          </div>
          {data.triggerType === "schedule" && (
            <TriggerScheduleFields
              cron={data.scheduleCron || ""}
              workflowId={workflowId}
              onCronChange={(value) => update({ scheduleCron: value })}
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
              onChange={(e) => update({ kbSource: e.target.value as "inline" | "workflow" })}
            >
              <option value="inline">Inline (configured below)</option>
              <option value="workflow">Workflow knowledge base</option>
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
              onChange={(e) =>
                update({ kbMethod: e.target.value as "embedding" | "bm25" | "tfidf" | "keyword" })
              }
            >
              <option value="embedding">Vector embedding</option>
              <option value="bm25">BM25</option>
              <option value="tfidf">TF-IDF cosine</option>
              <option value="keyword">Keyword overlap</option>
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
              value={data.subWorkflowId || ""}
              onChange={(e) => update({ subWorkflowId: e.target.value })}
            >
              <option value="">Select workflow…</option>
              {workflows
                .filter((w) => w.id !== workflowId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
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
              onChange={(e) => update({ integrationType: e.target.value as IntegrationType })}
            >
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="email">Email</option>
              <option value="postgres">Postgres</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Credential</Label>
            <Select
              value={data.credentialName || ""}
              onChange={(e) => {
                const name = e.target.value;
                const match = credentials.find((c) => c.name === name);
                update({ credentialName: name, credentialId: match?.id });
              }}
            >
              <option value="">Select credential…</option>
              {credentials
                .filter((c) => c.type === (data.integrationType || "slack"))
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </Select>
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
              <Label>SQL query (read-only)</Label>
              <Textarea
                rows={4}
                value={data.integrationQuery || "SELECT 1"}
                onChange={(e) => update({ integrationQuery: e.target.value })}
                className="font-mono text-xs"
              />
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
          <Label>Instruction</Label>
          <Textarea
            rows={5}
            value={data.instruction || ""}
            onChange={(e) => update({ instruction: e.target.value })}
            placeholder="You are a helpful assistant…"
          />
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </div>
      )}

      {data.nodeType === "tool" && data.toolType === "search" && (
        <div className="space-y-2">
          <Label>Search Provider</Label>
          <Select
            value={data.searchProvider || "google"}
            onChange={(e) => update({ searchProvider: e.target.value as SearchProvider })}
          >
            <option value="google">Google Search (default)</option>
            <option value="exa">EXA</option>
            <option value="duckduckgo">DuckDuckGo</option>
          </Select>
        </div>
      )}

      {data.nodeType === "evaluation" && (
        <>
          <div className="space-y-2">
            <Label>Eval Strategy</Label>
            <Select
              value={data.evalType || "llm"}
              onChange={(e) =>
                update({
                  evalType: e.target.value as "llm" | "exact" | "substring" | "regex" | "embedding",
                  evalExecutionMode:
                    e.target.value === "llm" ? data.evalExecutionMode || "parallel" : "parallel",
                })
              }
            >
              <option value="llm">LLM grading (Gemini)</option>
              <option value="exact">Exact match</option>
              <option value="substring">Substring match</option>
              <option value="regex">Regex match</option>
              <option value="embedding">Embedding similarity</option>
            </Select>
          </div>

          {(data.evalType || "llm") === "llm" && (
            <>
              <div className="space-y-2">
                <Label>Eval Preset</Label>
                <Select
                  value={data.evalCustomPresetId || data.evalPreset || ""}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="">Custom criteria</option>
                  {evalPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                      {preset.source === "custom" ? " (custom)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Criteria</Label>
                <Textarea
                  rows={3}
                  value={data.criteria || ""}
                  onChange={(e) => update({ criteria: e.target.value })}
                />
              </div>
            </>
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
          {(data.evalType || "llm") === "llm" && (
            <div className="space-y-2">
              <Label>Execution Mode</Label>
              <Select
                value={data.evalExecutionMode || "parallel"}
                onChange={(e) =>
                  update({ evalExecutionMode: e.target.value as "parallel" | "inline" })
                }
              >
                <option value="parallel">Parallel (post-run, lower latency)</option>
                <option value="inline">Inline (blocking, in workflow path)</option>
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
              onChange={(e) =>
                update({ evalFailBehavior: e.target.value as "none" | "warn" | "block" })
              }
            >
              <option value="none">Record only (observability)</option>
              <option value="warn">Warn (continue run)</option>
              <option value="block">Block (fail run)</option>
            </Select>
            <p className="form-hint">
              Block stops the workflow and fires a quality webhook if configured.
            </p>
          </div>
        </>
      )}

      {data.nodeType === "summarizer" && (
        <div className="space-y-2">
          <Label>Summary Style</Label>
          <Select
            value={data.summaryStyle || "concise"}
            onChange={(e) => update({ summaryStyle: e.target.value as SummaryStyle })}
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
            <option value="bullet">Bullet points</option>
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
              onChange={(e) => update({ httpMethod: e.target.value as HttpMethod })}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
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
          <div className="space-y-2">
            <Label>Guardrail Engine</Label>
            <Select
              value={data.rules?.guardrail_type || "rules"}
              onChange={(e) =>
                update({
                  rules: {
                    ...data.rules,
                    guardrail_type: e.target.value as "rules" | "llm",
                  },
                })
              }
            >
              <option value="rules">Rule-based (keywords, regex, PII)</option>
              <option value="llm">LLM policy check (Gemini)</option>
            </Select>
          </div>

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

          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={data.rules?.mode || "output"}
              onChange={(e) =>
                update({
                  rules: { ...data.rules, mode: e.target.value as GuardrailMode },
                })
              }
            >
              <option value="input">Input (before agent)</option>
              <option value="output">Output (after agent)</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Fail Behavior</Label>
            <Select
              value={data.rules?.fail_behavior || "block"}
              onChange={(e) =>
                update({
                  rules: {
                    ...data.rules,
                    fail_behavior: e.target.value as GuardrailFailBehavior,
                  },
                })
              }
            >
              <option value="block">Block (stop workflow)</option>
              <option value="warn">Warn (continue)</option>
              <option value="mask">Mask PII (redact and continue)</option>
              <option value="fallback">Fallback value (replace output)</option>
            </Select>
          </div>

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

          <GuardrailPreviewPanel rules={data.rules} />
        </>
      )}
    </div>
  );
}