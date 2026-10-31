"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionStrict } from "@/components/motion";
import {
  AlertTriangle,
  ChevronRight,
  Zap,
  GitBranch,
  Sparkles,
  Database,
  Plug,
  Shield,
  Workflow,
  MousePointerClick,
  HelpCircle,
  Wand2,
  Columns2,
  Check,
  ExternalLink,
  Braces,
  MessageSquare,
  X,
  Plus,
} from "lucide-react";
import {
  categorize,
  CATEGORY_COLOR_VAR,
  CATEGORY_LABEL,
  type NodeCategory,
} from "@/components/canvas/nodes/category";
import { NodeChip } from "@/components/canvas/nodes/BaseNode";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { InspectorSection } from "@/components/canvas/inspector/InspectorSection";
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
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { api, type CompareVariantResult, type PromptDetail, type PromptSummary } from "@/lib/api";
import { WorkflowGuardrailField } from "@/components/canvas/WorkflowGuardrailField";
import {
  NodeDataSection,
  type NodeLiveResult,
} from "@/components/canvas/inspector/NodeDataSection";
import { ExpressionPreview } from "@/components/canvas/inspector/ExpressionPreview";
import { ExpressionTextarea } from "@/components/canvas/inspector/ExpressionTextarea";
import { AgentToolsEditor } from "@/components/canvas/inspector/AgentToolsEditor";
import { EXPRESSION_HINT, getNodeDefinition, getNodeLintIssues } from "@/lib/node-registry";
import { LLM_PROVIDERS, getProvider } from "@/lib/llm-providers";
import { formatCostUsd } from "@/lib/format";
import { formatRelativeTime, formatUtcTimestamp } from "@/lib/format-date";
import { GUARDRAIL_TYPE_HINTS } from "@/lib/guardrail-labels";
import { isEditableTarget } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type {
  ConditionOperator,
  EvalPreset,
  EvalType,
  GuardrailFailBehavior,
  GuardrailMode,
  GuardrailType,
  HttpMethod,
  IterationErrorMode,
  IterationMode,
  NodeComment,
  NodeData,
  NodeResult,
  SearchProvider,
  StructuredCondition,
  SummaryStyle,
  IntegrationType,
  TriggerType,
  WorkflowGraph,
} from "@/types/workflow";
import { triggerCronEntries } from "@/types/workflow";

import { PromptDiff } from "@/components/canvas/inspector/PromptDiff";
import { deriveUpstreamNodeIds, outputFieldsFor } from "@/components/canvas/inspector/upstream";

interface NodeInspectorProps {
  nodeId: string | null;
  data: NodeData | null;
  workflowId?: string;
  fieldErrors?: Record<string, string>;
  /** True when the canvas graph has unsaved edits (drives Test-node warning). */
  graphDirty?: boolean;
  onChange: (nodeId: string, data: NodeData) => void;
  /**
   * Current graph topology. Used by the variable picker and agent tool
   * attachment editor. Optional — upstream suggestions and built-in
   * attachments are unavailable when no graph is supplied.
   */
  graph?: WorkflowGraph;
  /**
   * The most recent run's per-node results, keyed access by node_id. Used to
   * ground variable-picker field suggestions on real output shapes when
   * available, and as the persisted evidence source for the Data section.
   * Optional.
   */
  lastRunResults?: NodeResult[];
  /**
   * Streamed per-node results (WorkflowCanvas `nodeRunResults`). Wins over
   * `lastRunResults` in the Data section so live runs show fresh evidence.
   */
  liveResults?: Readonly<Record<string, NodeLiveResult>>;
  /** Id of the run the evidence above comes from, for a short-id caption. */
  runId?: string | null;
  /** The selected node's pinned mock output (WorkflowCanvas `pinnedOutputs`). */
  pinnedOutput?: string | null;
  /** Toggle pin on a node's output (existing canvas handlePinOutput). */
  onPinOutput?: (nodeId: string, output: string) => void;
  /** Set/replace a node's pinned output (editable mock data). */
  onUpdatePinnedOutput?: (nodeId: string, output: string) => void;
}

const CRON_ERROR_MESSAGE =
  "Invalid cron expression. Use 5 fields: minute hour day-of-month month day-of-week. Example: 0 9 * * 1-5 (weekdays at 9am).";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/**
 * The inspector's reference lists (credentials, eval rubrics, sub-workflows)
 * are plain fetches rather than queries. A failed load used to be swallowed,
 * leaving the picker silently empty — which a user reads as "I have none
 * saved". Say so, and offer a retry rather than forcing a page reload.
 */
function ReferenceLoadHint({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <p className="form-hint text-destructive">
      Couldn&apos;t load {label}.{" "}
      <button
        type="button"
        onClick={onRetry}
        className="focus-ring rounded-sm font-medium underline underline-offset-2"
      >
        Retry
      </button>
    </p>
  );
}

function InspectorDetails({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border bg-surface" open={defaultOpen}>
      <summary className="text-micro focus-ring flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {title}
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

/**
 * Node-anchored comments (Tier-4). A collapsible list of dated annotations plus
 * an add composer, persisted on node.data.comments and round-tripped through the
 * normal graph save. Single-user product — no author. The caller keys this by
 * nodeId so the composer draft resets when the selection changes. Empty state is
 * intentionally bare (just the composer) — no prose in a collapsed section.
 */
function CommentsSection({
  comments,
  onAdd,
  onDelete,
}: {
  comments: NodeComment[];
  onAdd: (text: string) => void;
  onDelete: (id: string) => void;
}) {
  const composerId = useId();
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };

  const count = comments.length;

  return (
    <InspectorDetails title={count > 0 ? `Comments · ${count}` : "Comments"}>
      {count > 0 && (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="group/comment relative rounded-lg border border-border bg-surface px-3 py-2"
            >
              <p className="whitespace-pre-wrap break-words pr-5 text-xs leading-relaxed text-foreground">
                {comment.text}
              </p>
              <p className="mt-1 font-mono text-2xs tabular-nums text-subtle">
                {formatRelativeTime(comment.createdAt)}
              </p>
              <button
                type="button"
                aria-label="Delete comment"
                title="Delete comment"
                onClick={() => onDelete(comment.id)}
                className="focus-ring absolute right-1.5 top-1.5 rounded p-0.5 text-muted opacity-0 transition-[opacity,color] hover:text-destructive focus-visible:opacity-100 group-hover/comment:opacity-100 group-focus-within/comment:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Textarea
          id={composerId}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter inserts a newline. Skip during IME.
            if (e.nativeEvent.isComposing || e.key === "Process") return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Add a comment…"
          aria-label="Add a comment"
        />
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={submit}
          disabled={!draft.trim()}
        >
          <MessageSquare className="h-3 w-3" />
          Add comment
        </Button>
      </div>
    </InspectorDetails>
  );
}

/**
 * Reusable Model section for LLM-family nodes: a provider dropdown, a free-text
 * model field (with the provider's default models as datalist suggestions), and
 * — for non-google providers — the same credential picker used by integration
 * nodes, filtered to credentials whose `type` matches the selected provider.
 *
 * `onChange` receives a normalized patch (provider/model/credentialId/
 * credentialName); callers map it onto node data or guardrail rule keys.
 */
function ModelProviderFields({
  provider,
  model,
  credentialName,
  credentials,
  fieldId,
  keyPrefix,
  credentialsLoadFailed,
  onRetryCredentials,
  onChange,
}: {
  provider: string | undefined;
  model: string | undefined;
  credentialName: string | undefined;
  credentials: Array<{ id: string; name: string; type: string }>;
  fieldId: (name: string) => string;
  keyPrefix: string;
  credentialsLoadFailed: boolean;
  onRetryCredentials: () => void;
  onChange: (patch: {
    provider?: string;
    model?: string;
    credentialId?: string;
    credentialName?: string;
  }) => void;
}) {
  const activeProvider = getProvider(provider);
  const listId = fieldId(`${keyPrefix}-model-list`);
  const matchingCreds = credentials.filter((c) => c.type === activeProvider.id);
  return (
    <InspectorSection title="Model">
      <div className="space-y-2">
        <Label htmlFor={fieldId(`${keyPrefix}-provider`)}>Provider</Label>
        <Select
          value={activeProvider.id}
          onValueChange={(value) =>
            onChange({
              // Switching provider invalidates the bound model and credential.
              provider: value,
              model: undefined,
              credentialId: undefined,
              credentialName: undefined,
            })
          }
        >
          <SelectTrigger id={fieldId(`${keyPrefix}-provider`)} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LLM_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId(`${keyPrefix}-model`)}>Model</Label>
        <Input
          id={fieldId(`${keyPrefix}-model`)}
          list={listId}
          value={model || ""}
          onChange={(e) => onChange({ model: e.target.value })}
          placeholder={activeProvider.defaultModels[0]}
        />
        <datalist id={listId}>
          {activeProvider.defaultModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </datalist>
        <p className="form-hint">
          Leave blank to use {activeProvider.label}&apos;s default model.
        </p>
      </div>

      {activeProvider.needsCredential && (
        <div className="space-y-2">
          <Label htmlFor={fieldId(`${keyPrefix}-credential`)} required>
            Credential
          </Label>
          <Select
            value={credentialName || undefined}
            onValueChange={(name) => {
              const match = matchingCreds.find((c) => c.name === name);
              onChange({ credentialName: name, credentialId: match?.id });
            }}
          >
            <SelectTrigger id={fieldId(`${keyPrefix}-credential`)} className="w-full">
              <SelectValue placeholder="Select credential…" />
            </SelectTrigger>
            <SelectContent>
              {matchingCreds.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {matchingCreds.length === 0 && (
            <p className="form-hint">
              No {activeProvider.label} credentials yet — add one in{" "}
              <Link href="/credentials" className="underline underline-offset-2">
                Credentials
              </Link>
              .
            </p>
          )}
          {credentialsLoadFailed && (
            <ReferenceLoadHint label="credentials" onRetry={onRetryCredentials} />
          )}
        </div>
      )}
    </InspectorSection>
  );
}

/** House checkbox row — replaces bare unstyled <input type=checkbox>. */
function CheckboxRow({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-input px-3 py-2.5 transition-colors hover:border-border-strong"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * DraftTextarea commits only on blur. Cmd+S / explicit save must flush any
 * in-progress drafts first or the saved graph omits uncommitted keystrokes.
 * Mounted instances register a flush callback here; callers (WorkflowCanvas)
 * invoke `flushDraftTextareas()` inside `flushSync` before serializing.
 */
const draftFlushers = new Set<() => void>();

/** Commit every mounted DraftTextarea draft into node data (sync-friendly). */
export function flushDraftTextareas(): void {
  draftFlushers.forEach((flush) => flush());
}

/**
 * Textarea that keeps a local string draft so typing never round-trips through a
 * parse/serialize cycle mid-keystroke. The draft is seeded from `serialize(...)`
 * and re-seeded when that committed text changes (undo/redo) or the selected
 * node changes. Parsing and committing happen on blur (and when
 * `flushDraftTextareas` runs). A reseed is skipped while an editor is focused
 * so an in-progress keystroke is not replaced.
 */
function DraftTextarea({
  seedKey,
  serialize,
  onCommit,
  highlightExpressions = false,
  ...rest
}: {
  seedKey: string;
  serialize: () => string;
  onCommit: (value: string) => void;
  /** Render through ExpressionTextarea so per-line {{ }} references are tinted. */
  highlightExpressions?: boolean;
} & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur">) {
  const seeded = serialize();
  const [draft, setDraft] = useState(seeded);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const seedKeyRef = useRef(seedKey);

  useEffect(() => {
    const nodeChanged = seedKeyRef.current !== seedKey;
    seedKeyRef.current = seedKey;
    // Undo cannot land while this editor is focused (shortcuts bail). After a
    // blur-commit, undo changes `seeded` and the draft must follow or the next
    // blur/⌘S writes the pre-undo text back.
    if (!nodeChanged && isEditableTarget(document.activeElement)) return;
    setDraft(seeded);
  }, [seedKey, seeded]);

  useEffect(() => {
    const flush = () => onCommitRef.current(draftRef.current);
    draftFlushers.add(flush);
    return () => {
      draftFlushers.delete(flush);
    };
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value);
  const onBlur = () => onCommit(draft);

  if (highlightExpressions) {
    return (
      <ExpressionTextarea {...rest} value={draft} onChange={onChange} onBlur={onBlur} />
    );
  }
  return <Textarea {...rest} value={draft} onChange={onChange} onBlur={onBlur} />;
}

/** Function-style nodes that execute through the retry/timeout wrapper. */
const RELIABILITY_NODE_TYPES = new Set([
  "tool",
  "code",
  "transform",
  "json_parse",
  "set_fields",
  "kb_retrieve",
  "memory_store",
  "memory_retrieve",
  "integration",
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

function CronEntryRow({
  cron,
  fieldId,
  removable,
  invalidSaved,
  onChange,
  onRemove,
}: {
  cron: string;
  fieldId: string;
  removable: boolean;
  invalidSaved: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const [previewRuns, setPreviewRuns] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const expr = cron.trim();
    if (!expr) {
      setPreviewRuns([]);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .previewCron(expr)
        .then((result) => {
          if (cancelled) return;
          setPreviewRuns(result.next_runs);
          setPreviewError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setPreviewRuns([]);
          setPreviewError(CRON_ERROR_MESSAGE);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cron]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          id={fieldId}
          value={cron}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0 9 * * 1-5"
        />
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove schedule"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
      {invalidSaved && (
        <p className="text-xs text-destructive">
          This schedule is saved with an invalid cron and will never fire. Fix the
          expression and save to re-enable it.
        </p>
      )}
      {previewError ? (
        <p className="text-xs text-destructive">{previewError}</p>
      ) : previewRuns.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2">
          <p className="text-xs font-medium text-muted">Next runs (UTC)</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs tabular-nums text-foreground">
            {previewRuns.map((runAt) => (
              <li key={runAt}>{formatUtcTimestamp(runAt)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TriggerScheduleFields({
  crons,
  workflowId,
  onCronsChange,
  fieldError,
}: {
  crons: string[];
  workflowId?: string;
  onCronsChange: (values: string[]) => void;
  fieldError?: string;
}) {
  const presetId = useId();
  const listId = useId();
  // The persisted schedule rows' server-side validity — a cron saved directly
  // via the API (bypassing the canvas save-guard) can be invalid and silently
  // never fires, so surface that state per matching entry (audit P2-36).
  const [savedSchedules, setSavedSchedules] = useState<
    Array<{ cron: string; cronValid: boolean }>
  >([]);
  const [lastFiredAt, setLastFiredAt] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setSavedSchedules([]);
      setLastFiredAt(null);
      return;
    }
    let cancelled = false;
    api
      .getWorkflowSchedule(workflowId)
      .then((infos) => {
        if (cancelled) return;
        setSavedSchedules(
          infos.map((info) => ({ cron: info.cron, cronValid: info.cron_valid }))
        );
        setLastFiredAt(
          infos
            .map((info) => info.last_fired_at)
            .filter((at): at is string => Boolean(at))
            .sort()
            .at(-1) ?? null
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSavedSchedules([]);
        setLastFiredAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  // Always render at least one editable row.
  const rows = crons.length ? crons : [""];
  const setRow = (index: number, value: string) =>
    onCronsChange(rows.map((cron, i) => (i === index ? value : cron)));
  const removeRow = (index: number) =>
    onCronsChange(rows.filter((_, i) => i !== index));
  const addRow = (value = "") => {
    const firstBlank = rows.findIndex((cron) => !cron.trim());
    if (firstBlank >= 0) setRow(firstBlank, value);
    else onCronsChange([...rows, value]);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={presetId}>Preset</Label>
        <Select onValueChange={(value) => addRow(value)}>
          <SelectTrigger id={presetId} className="w-full">
            <SelectValue placeholder="Add a schedule from a preset…" />
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
      <div className="space-y-3" role="group" aria-labelledby={listId}>
        <Label id={listId} required>Cron expressions</Label>
        {rows.map((cron, index) => (
          <CronEntryRow
            key={index}
            cron={cron}
            fieldId={`${listId}-${index}`}
            removable={rows.length > 1}
            invalidSaved={savedSchedules.some(
              (saved) => !saved.cronValid && saved.cron.trim() === cron.trim()
            )}
            onChange={(value) => setRow(index, value)}
            onRemove={() => removeRow(index)}
          />
        ))}
        <p className="form-hint">
          Standard 5-field cron (UTC). Each entry schedules its own runs — a
          workflow can fire on several cadences.
        </p>
        <FieldError message={fieldError} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addRow()}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Add schedule
        </Button>
      </div>
      {lastFiredAt && (
        <p className="text-xs text-muted">
          Last scheduled run:{" "}
          <span className="font-mono tabular-nums">{formatUtcTimestamp(lastFiredAt)}</span>
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

// ── AI authoring helpers ────────────────────────────────────────────────────

/** Node types that route through categorize() to the "llm" category and are
 *  worth A/B comparing (prompt/instruction-driven). */
const COMPARE_ELIGIBLE = new Set(["agent", "classifier", "summarizer", "translator", "extractor"]);


/** Collapsible monochrome contextual help block, rendered at the top of a
 *  configured node's inspector when the registry has authored help. */
function HelpBlock({ help, docUrl }: { help: string; docUrl?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:text-foreground"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex-1">About this node</span>
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          <p className="text-xs leading-relaxed text-muted">{help}</p>
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1 text-2xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              Learn more
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bare magic-wand button that prompts for a short NL description and calls
 * api.generateSchema, previewing the result in a mono code block with an
 * Insert action. Deliberately muted — no sparkle gradient — per design rules.
 */
function MagicWandField({
  kind,
  onInsert,
}: {
  kind: "json_schema" | "regex";
  onInsert: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const descId = useId();

  const label = kind === "json_schema" ? "JSON Schema" : "regex pattern";

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.generateSchema({ description: description.trim(), kind });
      const value =
        kind === "json_schema"
          ? res.json_schema
            ? JSON.stringify(res.json_schema, null, 2)
            : null
          : res.regex ?? null;
      if (!value) {
        setError(`The model returned no ${label}. Try a more specific description.`);
      } else {
        setResult(value);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Generate ${label} with AI`}
        title={`Generate ${label} with AI`}
        className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Wand2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface-overlay p-3">
          <Label htmlFor={descId} className="text-xs">
            Describe the {label}
          </Label>
          <Textarea
            id={descId}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === "json_schema"
                ? "An object with a name (string) and age (number)…"
                : "Match a US phone number…"
            }
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
            >
              {loading ? "Generating…" : "Generate"}
            </Button>
            {result && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onInsert(result);
                  setOpen(false);
                  setResult(null);
                  setDescription("");
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Insert
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {result && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-2xs leading-relaxed text-foreground">
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline "{{ }}" affordance for expression-bearing fields. Opens a dropdown of
 * upstream nodes and their known output fields and inserts a
 * {{steps.NODE_ID.output(.field)}} reference via onInsert.
 */
function VariablePicker({
  graph,
  nodeId,
  lastRunResults,
  onInsert,
}: {
  graph?: WorkflowGraph;
  nodeId: string;
  lastRunResults?: NodeResult[];
  onInsert: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const upstreamIds = deriveUpstreamNodeIds(graph, nodeId);
  const nodeById = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
  const resultById = new Map((lastRunResults ?? []).map((r) => [r.node_id, r]));

  const insert = (token: string) => {
    onInsert(token);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Insert a variable reference"
        title="Insert a variable reference"
        className="focus-ring inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-mono text-2xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Braces className="h-3 w-3" />
        {"{{ }}"}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-border bg-surface-overlay p-1 shadow-elev-1">
          <button
            type="button"
            onClick={() => insert("{{input}}")}
            className="focus-ring block w-full rounded-md px-2 py-1.5 text-left font-mono text-2xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {"{{input}}"}
          </button>
          <button
            type="button"
            onClick={() => insert("{{last_output}}")}
            className="focus-ring block w-full rounded-md px-2 py-1.5 text-left font-mono text-2xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {"{{last_output}}"}
          </button>
          {upstreamIds.length === 0 ? (
            <p className="px-2 py-2 text-2xs text-subtle">
              No upstream steps. Connect nodes into this one to reference their output.
            </p>
          ) : (
            upstreamIds.map((upId) => {
              const nData = nodeById.get(upId)?.data;
              const fields = outputFieldsFor(nData, resultById.get(upId));
              return (
                <div key={upId} className="mt-1 border-t border-border pt-1 first:mt-0 first:border-t-0 first:pt-0">
                  <p className="px-2 pb-0.5 pt-1 text-2xs uppercase tracking-wider text-subtle">
                    {nData?.label || upId}
                  </p>
                  <button
                    type="button"
                    onClick={() => insert(`{{steps.${upId}.output}}`)}
                    className="focus-ring block w-full rounded-md px-2 py-1.5 text-left font-mono text-2xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    {`{{steps.${upId}.output}}`}
                  </button>
                  {fields.map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => insert(`{{steps.${upId}.output.${field}}}`)}
                      className="focus-ring block w-full rounded-md px-2 py-1.5 text-left font-mono text-2xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      {`{{steps.${upId}.output.${field}}}`}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** A field header row: a Label on the left, optional actions (picker/wand) on
 *  the right — keeps affordances aligned and unobtrusive. */
function FieldHeader({
  htmlFor,
  required,
  children,
  actions,
}: {
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} required={required}>
        {children}
      </Label>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

/**
 * LLM Compare mode: 2–3 flat bordered columns sharing one header row. Each
 * column is the base config plus a per-column override (instruction). Runs one
 * shared sample input through api.compareVariants and shows per-column output +
 * mono latency/token/cost chips. Color is reserved for the winning metric only.
 */
function CompareMode({ data }: { data: NodeData }) {
  const sampleId = useId();
  const baseInstruction = data.instruction || "";
  const [sample, setSample] = useState("");
  const [overrides, setOverrides] = useState<string[]>([baseInstruction, baseInstruction]);
  const [results, setResults] = useState<CompareVariantResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnCount = overrides.length;

  const setOverride = (idx: number, value: string) => {
    setOverrides((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  const handleRun = async () => {
    if (!sample.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const { base_config, override_key } = buildCompareConfig(data);
      const res = await api.compareVariants({
        node_type: data.nodeType,
        base_config,
        input_text: sample.trim(),
        variants: overrides.map((instruction, i) => ({
          label: `Variant ${String.fromCharCode(65 + i)}`,
          config_overrides: { [override_key]: instruction },
        })),
      });
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  // Winning-metric indices (lowest latency/cost, most economical tokens) — the
  // only place color is allowed to appear in the compare grid.
  const bestLatency = argBest(results, (r) => r.latency_ms);
  const bestCost = argBest(results, (r) => r.cost_usd);
  const bestTokens = argBest(results, (r) => r.total_tokens);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="space-y-2">
        <FieldHeader htmlFor={sampleId}>Shared sample input</FieldHeader>
        <Textarea
          id={sampleId}
          rows={2}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          placeholder="One input, run against every variant…"
        />
      </div>

      <div className={cn("grid gap-2", columnCount === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {overrides.map((instruction, idx) => {
          const result = results?.[idx];
          return (
            <div key={idx} className="flex flex-col gap-2 rounded-md border border-border bg-surface-input p-2">
              <p className="text-2xs font-medium uppercase tracking-wider text-subtle">
                Variant {String.fromCharCode(65 + idx)}
              </p>
              <Textarea
                rows={4}
                className="font-mono text-2xs"
                value={instruction}
                onChange={(e) => setOverride(idx, e.target.value)}
                placeholder="Prompt override…"
                aria-label={`Variant ${String.fromCharCode(65 + idx)} prompt override`}
              />
              {idx > 0 && (
                <div>
                  <p className="mb-1 text-2xs uppercase tracking-wider text-subtle">Diff vs base</p>
                  <PromptDiff base={baseInstruction} variant={instruction} />
                </div>
              )}
              {result && (
                <>
                  <div className="flex flex-wrap gap-1">
                    <span className={cn(bestLatency === idx && "text-success")}>
                      <NodeChip>
                        {result.latency_ms != null ? `${Math.round(result.latency_ms)}ms` : "—"}
                      </NodeChip>
                    </span>
                    <span className={cn(bestTokens === idx && "text-success")}>
                      <NodeChip>
                        {result.total_tokens != null ? `${result.total_tokens} tok` : "—"}
                      </NodeChip>
                    </span>
                    <span className={cn(bestCost === idx && "text-success")}>
                      <NodeChip>{formatCostUsd(result.cost_usd)}</NodeChip>
                    </span>
                  </div>
                  {result.error ? (
                    <p className="text-2xs text-destructive">{result.error}</p>
                  ) : (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-2xs leading-relaxed text-foreground">
                      {result.output ?? "—"}
                    </pre>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleRun} disabled={loading || !sample.trim()}>
          {loading ? "Running…" : "Run comparison"}
        </Button>
        {columnCount < 3 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOverrides((prev) => [...prev, baseInstruction])}
          >
            Add variant
          </Button>
        )}
        {columnCount > 2 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOverrides((prev) => prev.slice(0, -1))}
          >
            Remove
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="form-hint">
        Each variant runs the node&apos;s base config with its prompt override against the shared
        input. Green marks the best metric.
      </p>
    </div>
  );
}

/** Build the compareVariants base_config for an LLM node and the config key the
 *  per-column override targets (the prompt/instruction-style field). */
function buildCompareConfig(data: NodeData): {
  base_config: Record<string, unknown>;
  override_key: string;
} {
  const base_config: Record<string, unknown> = {};
  let override_key = "instruction";
  switch (data.nodeType) {
    case "agent":
      base_config.instruction = data.instruction || "";
      override_key = "instruction";
      break;
    case "summarizer":
      base_config.summary_style = data.summaryStyle || "concise";
      base_config.instruction = data.instruction || "";
      override_key = "instruction";
      break;
    case "translator":
      base_config.target_language = data.targetLanguage || "English";
      base_config.instruction = data.instruction || "";
      override_key = "instruction";
      break;
    case "extractor":
      base_config.extract_fields = data.extractFields || [];
      base_config.instruction = data.instruction || "";
      override_key = "instruction";
      break;
    case "classifier":
      base_config.categories = data.categories || [];
      base_config.instruction = data.instruction || "";
      override_key = "instruction";
      break;
    default:
      base_config.instruction = data.instruction || "";
  }
  return { base_config, override_key };
}

/** Index of the numerically smallest defined metric, or -1 when nothing to
 *  compare. Used to award the single "winning metric" highlight. */
function argBest(
  results: CompareVariantResult[] | null,
  pick: (r: CompareVariantResult) => number | null
): number {
  if (!results || results.length < 2) return -1;
  let best = -1;
  let bestVal = Infinity;
  results.forEach((r, i) => {
    const v = pick(r);
    if (v == null || r.error) return;
    if (v < bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

export function NodeInspector({
  nodeId,
  data,
  workflowId,
  fieldErrors = {},
  graphDirty = false,
  onChange,
  graph,
  lastRunResults,
  liveResults,
  runId,
  pinnedOutput,
  onPinOutput,
  onUpdatePinnedOutput,
}: NodeInspectorProps) {
  const reduce = useReducedMotionStrict();
  const [evalPresets, setEvalPresets] = useState<EvalPreset[]>([]);
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<Array<{ id: string; name: string }>>([]);
  const [schemaText, setSchemaText] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [promptDetails, setPromptDetails] = useState<Record<string, PromptDetail>>({});
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [referenceLoadError, setReferenceLoadError] = useState<{
    evalPresets: boolean;
    credentials: boolean;
    workflows: boolean;
  }>({ evalPresets: false, credentials: false, workflows: false });
  const [referenceReloadKey, setReferenceReloadKey] = useState(0);
  const retryReferenceLoad = () => setReferenceReloadKey((key) => key + 1);

  // Compare mode is per-node; close it whenever the selection changes.
  useEffect(() => {
    setCompareOpen(false);
  }, [nodeId]);

  useEffect(() => {
    let cancelled = false;
    const mark = (key: "evalPresets" | "credentials" | "workflows", failed: boolean) => {
      if (cancelled) return;
      setReferenceLoadError((prev) => (prev[key] === failed ? prev : { ...prev, [key]: failed }));
    };

    api
      .listEvalPresets()
      .then((rows) => {
        if (cancelled) return;
        setEvalPresets(rows);
        mark("evalPresets", false);
      })
      .catch(() => mark("evalPresets", true));
    api
      .listCredentials()
      .then((rows) => {
        if (cancelled) return;
        setCredentials(rows);
        mark("credentials", false);
      })
      .catch(() => mark("credentials", true));
    api
      .listWorkflows()
      .then((rows) => {
        if (cancelled) return;
        setWorkflows(rows.map((w) => ({ id: w.id, name: w.name })));
        mark("workflows", false);
      })
      .catch(() => mark("workflows", true));
    api
      .listPrompts()
      .then((rows) => {
        if (cancelled) return;
        setPrompts(rows);
      })
      .catch(() => {
        /* prompt registry picker degrades to inline-only */
      });
    api
      .listKnowledgeBases()
      .then((rows) => {
        if (cancelled) return;
        setKnowledgeBases(rows.map((row) => ({ id: row.id, name: row.name })));
      })
      .catch(() => {
        /* library picker degrades to inline and workflow sources */
      });

    return () => {
      cancelled = true;
    };
  }, [referenceReloadKey]);

  useEffect(() => {
    const schema = data?.outputSchema;
    if (!schema) {
      setSchemaText("");
      setSchemaError(null);
      return;
    }
    setSchemaText(typeof schema === "string" ? schema : JSON.stringify(schema, null, 2));
    setSchemaError(null);
  }, [nodeId, data?.outputSchema]);

  // Lazy-load a prompt's versions the first time a node binds to it.
  const promptRefId = data?.promptRef?.prompt_id;
  useEffect(() => {
    if (!promptRefId || promptDetails[promptRefId]) return;
    let cancelled = false;
    api
      .getPrompt(promptRefId)
      .then((detail) => {
        if (cancelled) return;
        setPromptDetails((prev) => ({ ...prev, [promptRefId]: detail }));
      })
      .catch(() => {
        /* leave the picker on the summary row */
      });
    return () => {
      cancelled = true;
    };
  }, [promptRefId, promptDetails]);

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
      <EmptyState
        compact
        icon={MousePointerClick}
        title="No selection"
        description="Click a node on the canvas to configure it, or drag a new node from the sidebar."
        action={
          <div className="w-full max-w-[260px] space-y-1.5">
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
                <Kbd>{row.key}</Kbd>
              </div>
            ))}
          </div>
        }
      />
    );
  }

  const update = (patch: Partial<NodeData>) => onChange(nodeId, { ...data, ...patch });
  // Registry-driven config lint (Feature 4): a quiet, one-line-per-issue hint
  // list rendered below the Data section. Same source as the node-card glyph.
  const lintIssues = getNodeLintIssues(data);
  const nodeDef = getNodeDefinition(data.nodeType, data);
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

  const isCompareEligible = COMPARE_ELIGIBLE.has(data.nodeType);
  const toolOwners = data.nodeType === "tool"
    ? graph?.nodes.filter((node) => node.data.nodeType === "agent" && node.data.tools?.some((tool) => tool.kind === "node" && tool.nodeId === nodeId)) ?? []
    : [];
  // Shared render for the inline variable picker on expression fields.
  const variablePicker = (onInsert: (token: string) => void) => (
    <VariablePicker
      graph={graph}
      nodeId={nodeId}
      lastRunResults={lastRunResults}
      onInsert={onInsert}
    />
  );

  return (
    <InspectorMotionShell reduce={reduce} nodeId={nodeId}>
        <div className="sticky top-0 z-10 flex items-center gap-3 overflow-hidden border-b border-border bg-surface-elevated px-4 py-3">
          {/* Category hue is a <=2px rule only — never a fill or colored text
              (globals.css invariant #1). The chip and label stay monochrome. */}
          <span
            className="absolute inset-y-0 left-0 w-0.5"
            style={{ background: catColor }}
            aria-hidden
          />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-input text-muted">
            <CategoryIcon category={cat} />
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline gap-2">
              <span className="text-micro text-muted">{CATEGORY_LABEL[cat]}</span>
              <span className="truncate font-mono text-2xs lowercase text-subtle">
                {data.nodeType}
              </span>
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
          {isCompareEligible && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={compareOpen}
              onClick={() => setCompareOpen((v) => !v)}
              className={cn(
                "shrink-0 self-start",
                // House pressed-toggle recipe (same as `.nav-link-active`).
                compareOpen && "border-border-strong bg-surface-hover text-foreground"
              )}
            >
              <Columns2 className="h-3.5 w-3.5" />
              Compare
            </Button>
          )}
        </div>

        {/* The body owns the panel's horizontal gutter; the header above is
            deliberately full-bleed so it can dock flush when the panel scrolls. */}
        <div className="space-y-4 px-4 pb-4">

      {/* Per-node data loop: latest-run evidence, upstream inputs, step-run
          test, and editable pinned output. Keyed by nodeId so its drafts and
          open state re-seed on selection. */}
      <NodeDataSection
        key={`data-${nodeId}`}
        workflowId={workflowId}
        nodeId={nodeId}
        graph={graph}
        graphDirty={graphDirty}
        lastRunResults={lastRunResults}
        liveResults={liveResults}
        runId={runId}
        pinnedOutput={pinnedOutput}
        onPinOutput={onPinOutput}
        onUpdatePinnedOutput={onUpdatePinnedOutput}
      />

      {lintIssues.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          {lintIssues.map((issue) => (
            <p key={issue.field} className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {nodeDef?.help && <HelpBlock help={nodeDef.help} docUrl={nodeDef.docUrl} />}

      {isCompareEligible && compareOpen && <CompareMode key={`compare-${nodeId}`} data={data} />}

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
            <p className="form-hint">
              {data.triggerType === "webhook"
                ? "External systems start runs by POSTing to the ingress endpoint below."
                : data.triggerType === "schedule"
                  ? "The background scheduler starts runs on a cron cadence."
                  : "Runs start from the Run button or the invoke API."}
            </p>
          </div>
          {data.triggerType === "schedule" && (
            <TriggerScheduleFields
              // Legacy graphs may still carry data.scheduleCron — read it as a
              // one-entry list and drop the key on the next update.
              crons={
                Array.isArray(data.scheduleCrons)
                  ? data.scheduleCrons
                  : triggerCronEntries(data)
              }
              workflowId={workflowId}
              onCronsChange={(values) => {
                const next = { ...data };
                delete next["scheduleCron"];
                onChange(nodeId, { ...next, scheduleCrons: values });
              }}
              fieldError={fieldErrors.scheduleCrons}
            />
          )}
          <WorkflowGuardrailField
            policyId={data.workflowGuardrailPolicyId}
            mode={data.workflowGuardrailMode}
            onChange={(patch) => update(patch)}
          />
          {data.triggerType === "webhook" && workflowId && (
            <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2">
              <p className="text-xs font-medium text-muted">Ingress endpoint</p>
              <code className="mt-1 block break-all text-xs text-foreground">
                POST {(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}
                /v1/workflows/{workflowId}/invoke
              </code>
              <p className="mt-2 form-hint">
                Publish a version and open Deploy to issue a scoped invoke key or webhook signing secret.
                Inbound app events POST the raw body to /v1/webhooks/{workflowId} (X-Aegis-Event-Token
                or raw-body HMAC); the invoke API takes JSON {`{"input": "..."}`} with deployment/version headers.
              </p>
            </div>
          )}
        </>
      )}

      {data.nodeType === "input_schema" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={fieldId("input-fields")}>Input fields</Label>
            <TagInput
              id={fieldId("input-fields")}
              values={(data.inputFields || []).map((f) => f.key)}
              onChange={(keys) => {
                const existing = data.inputFields || [];
                update({
                  inputFields: keys.map(
                    (key) =>
                      existing.find((f) => f.key === key) ?? {
                        key,
                        type: "string" as const,
                        required: key === "message",
                      }
                  ),
                });
              }}
              placeholder="message, priority, user_email…"
            />
            <p className="form-hint">
              Each field becomes an input in the Run form and a key on the webhook payload.
            </p>
          </div>
          {(data.inputFields || []).map((field, index) => {
            const setField = (patch: Partial<typeof field>) => {
              const next = [...(data.inputFields || [])];
              next[index] = { ...field, ...patch };
              update({ inputFields: next });
            };
            return (
              <div
                key={field.key}
                className="space-y-2 rounded-lg border border-border bg-surface px-3 py-3"
              >
                <p className="font-mono text-xs text-foreground">{field.key}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={fieldId(`input-type-${index}`)} className="text-xs">
                      Type
                    </Label>
                    <Select
                      value={field.type || "string"}
                      onValueChange={(value) =>
                        setField({ type: value as "string" | "number" | "boolean" })
                      }
                    >
                      <SelectTrigger id={fieldId(`input-type-${index}`)} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">String</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={fieldId(`input-default-${index}`)} className="text-xs">
                      Default value
                    </Label>
                    <Input
                      id={fieldId(`input-default-${index}`)}
                      value={field.default ?? ""}
                      onChange={(e) =>
                        setField({ default: e.target.value || undefined })
                      }
                      placeholder="optional"
                    />
                  </div>
                </div>
                <CheckboxRow
                  id={fieldId(`input-required-${index}`)}
                  checked={Boolean(field.required)}
                  onChange={(required) => setField({ required })}
                  label="Required"
                />
              </div>
            );
          })}
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
        <InspectorSection title="Matching">
          <div className="space-y-2">
            <Label htmlFor={fieldId("switch-value")}>Value to match</Label>
            <Input
              id={fieldId("switch-value")}
              className="font-mono text-xs"
              value={data.switchValue || "{{last_output}}"}
              onChange={(e) => update({ switchValue: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("switch-cases")}>Cases</Label>
            <TagInput
              id={fieldId("switch-cases")}
              values={data.switchCases || []}
              onChange={(switchCases) => update({ switchCases })}
              placeholder="Add a case, press Enter…"
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
          <p className="form-hint">Each case becomes a route — label outgoing edges to match.</p>
        </InspectorSection>
      )}

      {data.nodeType === "loop" && (
        <InspectorSection title="Bounded loop">
          <div className="group space-y-2">
            <FieldHeader htmlFor={fieldId("loop-left")} required>
              While
            </FieldHeader>
            <Input
              id={fieldId("loop-left")}
              className="font-mono text-xs"
              value={data.loopCondition?.left || ""}
              onChange={(e) =>
                update({
                  loopCondition: {
                    left: e.target.value,
                    operator: data.loopCondition?.operator || "lt",
                    right: data.loopCondition?.right,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("loop-op")}>Operator</Label>
            <Select
              value={data.loopCondition?.operator || "lt"}
              onValueChange={(value) =>
                update({
                  loopCondition: {
                    left: data.loopCondition?.left || "{{iteration}}",
                    operator: value as ConditionOperator,
                    right: data.loopCondition?.right,
                  },
                })
              }
            >
              <SelectTrigger id={fieldId("loop-op")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eq">equals</SelectItem>
                <SelectItem value="neq">not equals</SelectItem>
                <SelectItem value="contains">contains</SelectItem>
                <SelectItem value="not_contains">does not contain</SelectItem>
                <SelectItem value="empty">is empty</SelectItem>
                <SelectItem value="not_empty">is not empty</SelectItem>
                <SelectItem value="gt">greater than</SelectItem>
                <SelectItem value="lt">less than</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("loop-right")}>Right</Label>
            <Input
              id={fieldId("loop-right")}
              className="font-mono text-xs"
              value={data.loopCondition?.right || ""}
              onChange={(e) =>
                update({
                  loopCondition: {
                    left: data.loopCondition?.left || "{{iteration}}",
                    operator: data.loopCondition?.operator || "lt",
                    right: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("loop-max")}>Max iterations</Label>
            <Input
              id={fieldId("loop-max")}
              type="number"
              min={1}
              max={25}
              value={data.maxIterations ?? 5}
              onChange={(e) => update({ maxIterations: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("loop-body")}>Body template</Label>
            <ExpressionTextarea
              id={fieldId("loop-body")}
              rows={3}
              value={data.loopBody || ""}
              onChange={(e) => update({ loopBody: e.target.value })}
              placeholder="{{last_output}}"
            />
            <p className="form-hint">
              {"{{iteration}}"} starts at 1. The graph stays a straight line; the repeat happens inside this node.
            </p>
          </div>
        </InspectorSection>
      )}

      {data.nodeType === "iteration" && (
        <>
          <InspectorSection title="Items">
            <div className="group space-y-2">
              <FieldHeader
                htmlFor={fieldId("iteration-items")}
                required
                actions={variablePicker((token) =>
                  update({ itemsExpression: (data.itemsExpression ?? "{{last_output}}") + token })
                )}
              >
                Items expression
              </FieldHeader>
              <ExpressionTextarea
                id={fieldId("iteration-items")}
                className={cn(
                  "font-mono text-xs",
                  fieldErrors.itemsExpression && "border-destructive"
                )}
                rows={3}
                value={data.itemsExpression ?? "{{last_output}}"}
                onChange={(e) => update({ itemsExpression: e.target.value })}
                placeholder="{{last_output}} or {{steps.node_1.output.items}}"
              />
              <ExpressionPreview
                workflowId={workflowId}
                expression={data.itemsExpression ?? "{{last_output}}"}
              />
              <p className="form-hint">
                Resolves to a JSON array; otherwise the text is split on newlines.
              </p>
            </div>
          </InspectorSection>

          <InspectorSection title="Per item">
            <div className="space-y-2">
              <Label htmlFor={fieldId("iteration-subworkflow")}>Sub-workflow (optional)</Label>
              <Select
                value={data.subWorkflowId || "__none__"}
                onValueChange={(value) =>
                  update({ subWorkflowId: value === "__none__" ? undefined : value })
                }
              >
                <SelectTrigger id={fieldId("iteration-subworkflow")} className="w-full">
                  <SelectValue placeholder="None (use item template)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (use item template)</SelectItem>
                  {workflows
                    .filter((w) => w.id !== workflowId)
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {referenceLoadError.workflows && (
                <ReferenceLoadHint label="workflows" onRetry={retryReferenceLoad} />
              )}
              {data.subWorkflowId && (
                <Button asChild variant="ghost" size="xs" className="-ml-1 self-start">
                  <Link href={`/workflows/${data.subWorkflowId}`}>
                    <ExternalLink className="h-3 w-3" />
                    Open{" "}
                    {workflows.find((w) => w.id === data.subWorkflowId)?.name ?? "workflow"}
                  </Link>
                </Button>
              )}
              <p className="form-hint">
                Run a whole workflow per item, passing the item as its input. Leave as None
                to use the template below.
              </p>
            </div>

            {!data.subWorkflowId && (
              <div className="group space-y-2">
                <FieldHeader
                  htmlFor={fieldId("iteration-item-template")}
                  actions={variablePicker((token) =>
                    update({ itemTemplate: (data.itemTemplate ?? "{{item}}") + token })
                  )}
                >
                  Item template
                </FieldHeader>
                <ExpressionTextarea
                  id={fieldId("iteration-item-template")}
                  className="font-mono text-xs"
                  rows={3}
                  value={data.itemTemplate ?? "{{item}}"}
                  onChange={(e) => update({ itemTemplate: e.target.value })}
                  placeholder="{{item}}, {{item.field}}, or {{index}}"
                />
                <ExpressionPreview
                  workflowId={workflowId}
                  expression={data.itemTemplate ?? "{{item}}"}
                />
                <p className="form-hint">
                  Rendered per item with {"{{item}}"}, {"{{item.field}}"}, and {"{{index}}"} in scope.
                </p>
              </div>
            )}
          </InspectorSection>

          <InspectorSection title="Execution">
            <div className="space-y-2">
              <Label htmlFor={fieldId("iteration-mode")}>Mode</Label>
              <Select
                value={data.iterationMode || "sequential"}
                onValueChange={(value) => update({ iterationMode: value as IterationMode })}
              >
                <SelectTrigger id={fieldId("iteration-mode")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential (one at a time)</SelectItem>
                  <SelectItem value="parallel">Parallel (up to 5 at once)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("iteration-max-items")}>Max items</Label>
              <Input
                id={fieldId("iteration-max-items")}
                type="number"
                min={1}
                max={100}
                className="font-mono tabular-nums"
                value={data.maxItems ?? ""}
                placeholder="25"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    update({ maxItems: undefined });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  // Allow out-of-range while typing; clamp on blur.
                  update({ maxItems: Math.round(n) });
                }}
                onBlur={() => {
                  const n = data.maxItems;
                  if (n == null || !Number.isFinite(n)) {
                    update({ maxItems: undefined });
                    return;
                  }
                  update({ maxItems: Math.min(100, Math.max(1, Math.round(n))) });
                }}
              />
              <p className="form-hint">Caps how many items run (1–100). Extra items are truncated.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId("iteration-on-error")}>On item error</Label>
              <Select
                value={data.onItemError || "fail"}
                onValueChange={(value) => update({ onItemError: value as IterationErrorMode })}
              >
                <SelectTrigger id={fieldId("iteration-on-error")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fail">Fail (stop on first error)</SelectItem>
                  <SelectItem value="skip">Skip (record the error, continue)</SelectItem>
                </SelectContent>
              </Select>
              <p className="form-hint">
                Skip records {"{index, error}"} for failed items and keeps going.
              </p>
            </div>
          </InspectorSection>
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
        <InspectorSection title="Write">
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
              className="font-mono text-xs"
              value={data.memoryKey || "{{input.text}}"}
              onChange={(e) => update({ memoryKey: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("memory-value")}>Value</Label>
            <Input
              id={fieldId("memory-value")}
              className="font-mono text-xs"
              value={data.memoryValue || "{{last_output}}"}
              onChange={(e) => update({ memoryValue: e.target.value })}
            />
          </div>
          <CheckboxRow
            id={fieldId("memory-persistent")}
            checked={Boolean(data.memoryPersistent)}
            onChange={(memoryPersistent) => update({ memoryPersistent })}
            label="Persist across runs"
            hint="Stored in the workflow memory table instead of run-scoped state."
          />
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </InspectorSection>
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
              className="font-mono text-xs"
              value={data.memoryKey || "{{input.text}}"}
              onChange={(e) => update({ memoryKey: e.target.value })}
            />
          </div>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "kb_retrieve" && (
        <InspectorSection title="Retrieval">
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-source")}>Document source</Label>
            <Select
              value={data.kbSource || "inline"}
              onValueChange={(value) =>
                update({ kbSource: value as "inline" | "workflow" | "library" })
              }
            >
              <SelectTrigger id={fieldId("kb-source")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inline">Inline (configured below)</SelectItem>
                <SelectItem value="workflow">Workflow knowledge base</SelectItem>
                <SelectItem value="library">Knowledge library</SelectItem>
              </SelectContent>
            </Select>
            {data.kbSource === "workflow" && (
              <p className="form-hint">Add documents in the sidebar Data tab.</p>
            )}
            {data.kbSource === "library" && (
              <p className="form-hint">
                Libraries are managed on the{" "}
                <Link href="/knowledge" className="text-foreground underline-offset-2 hover:underline">
                  Knowledge
                </Link>{" "}
                page. Chunking, rewrite, and rerank follow that library.
              </p>
            )}
          </div>
          {data.kbSource === "library" && (
            <div className="space-y-2">
              <Label htmlFor={fieldId("kb-library")}>Library</Label>
              <Select
                value={data.knowledgeBaseId || undefined}
                onValueChange={(value) => update({ knowledgeBaseId: value })}
              >
                <SelectTrigger id={fieldId("kb-library")} className="w-full">
                  <SelectValue placeholder="Select a library…" />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases.map((base) => (
                    <SelectItem key={base.id} value={base.id}>
                      {base.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {knowledgeBases.length === 0 && (
                <p className="form-hint">No libraries yet. Create one on the Knowledge page.</p>
              )}
            </div>
          )}
          <div className="group space-y-2">
            <FieldHeader
              htmlFor={fieldId("kb-query")}
              actions={variablePicker((token) =>
                update({ kbQuery: (data.kbQuery ?? "{{last_output}}") + token })
              )}
            >
              Query
            </FieldHeader>
            <Input
              id={fieldId("kb-query")}
              className="font-mono text-xs"
              value={data.kbQuery || "{{last_output}}"}
              onChange={(e) => update({ kbQuery: e.target.value })}
            />
            <ExpressionPreview
              workflowId={workflowId}
              expression={data.kbQuery || "{{last_output}}"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-topk")}>Top K</Label>
            <Input
              id={fieldId("kb-topk")}
              type="number"
              min={1}
              max={20}
              value={data.kbTopK ?? ""}
              placeholder="3"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  update({ kbTopK: undefined });
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n)) return;
                update({ kbTopK: Math.round(n) });
              }}
              onBlur={() => {
                const n = data.kbTopK;
                if (n == null || !Number.isFinite(n)) {
                  update({ kbTopK: 3 });
                  return;
                }
                update({ kbTopK: Math.min(20, Math.max(1, Math.round(n))) });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("kb-method")}>Retrieval method</Label>
            <Select
              value={data.kbMethod || (data.kbSource === "library" ? "library" : "bm25")}
              onValueChange={(value) =>
                update({
                  kbMethod: value as
                    | "embedding"
                    | "bm25"
                    | "tfidf"
                    | "keyword"
                    | "hybrid"
                    | "library",
                })
              }
            >
              <SelectTrigger id={fieldId("kb-method")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.kbSource === "library" && (
                  <SelectItem value="library">Use library settings</SelectItem>
                )}
                <SelectItem value="hybrid">Hybrid (BM25 + embedding)</SelectItem>
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
              <DraftTextarea
                id={fieldId("kb-documents")}
                seedKey={`${nodeId}:kb-documents`}
                className="font-mono text-xs"
                rows={6}
                serialize={() =>
                  (data.kbDocuments || [])
                    .map((d) => `${d.id}|${d.title || ""}|${d.text}`)
                    .join("\n")
                }
                onCommit={(value) => {
                  const kbDocuments = value
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
        </InspectorSection>
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
            {referenceLoadError.workflows && (
              <ReferenceLoadHint label="workflows" onRetry={retryReferenceLoad} />
            )}
            {data.subWorkflowId && (
              <Button asChild variant="ghost" size="xs" className="-ml-1 self-start">
                <Link href={`/workflows/${data.subWorkflowId}`}>
                  <ExternalLink className="h-3 w-3" />
                  Open{" "}
                  {workflows.find((w) => w.id === data.subWorkflowId)?.name ?? "workflow"}
                </Link>
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("subworkflow-input")}>Input to child workflow</Label>
            <Input
              id={fieldId("subworkflow-input")}
              className="font-mono text-xs"
              value={data.subWorkflowInput || "{{last_output}}"}
              onChange={(e) => update({ subWorkflowInput: e.target.value })}
            />
          </div>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </>
      )}

      {data.nodeType === "integration" && (
        <>
          <InspectorSection title="Connection">
          <div className="space-y-2">
            <Label htmlFor={fieldId("integration-type")}>Integration type</Label>
            <Select
              value={data.integrationType || "slack"}
              onValueChange={(value) =>
                update({
                  integrationType: value as IntegrationType,
                  // Clear the previous credential — it belongs to the old type.
                  credentialName: undefined,
                  credentialId: undefined,
                })
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
            <p className="form-hint">
              Create credentials in{" "}
              <Link href="/credentials" className="underline underline-offset-2">
                Credentials
              </Link>
              .
            </p>
            {referenceLoadError.credentials && (
              <ReferenceLoadHint label="credentials" onRetry={retryReferenceLoad} />
            )}
          </div>
          </InspectorSection>
          <InspectorSection title="Content">
          {data.integrationType === "slack" && (
            <div className="space-y-2">
              <Label htmlFor={fieldId("integration-message")}>Message</Label>
              <ExpressionTextarea
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
                <ExpressionTextarea
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
              <ExpressionTextarea
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
          {data.integrationType === "discord" && (
            <div className="space-y-2">
              <Label htmlFor={fieldId("integration-message-discord")}>Message</Label>
              <ExpressionTextarea
                id={fieldId("integration-message-discord")}
                rows={3}
                value={data.integrationMessage || "{{last_output}}"}
                onChange={(e) => update({ integrationMessage: e.target.value })}
              />
            </div>
          )}
          <p className="form-hint">{EXPRESSION_HINT}</p>
          </InspectorSection>
        </>
      )}

      {data.nodeType === "human_approval" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("content-to-review")}>Content to review</Label>
          <ExpressionTextarea
            id={fieldId("content-to-review")}
            rows={4}
            value={data.approvalReview || "{{last_output}}"}
            onChange={(e) => update({ approvalReview: e.target.value })}
          />
          <p className="form-hint">
            Run pauses until approved from the run detail page. {EXPRESSION_HINT}
          </p>
          <Label htmlFor={fieldId("approval-assignee")}>Assignee</Label>
          <Input
            id={fieldId("approval-assignee")}
            value={data.approvalAssignee || ""}
            maxLength={255}
            placeholder="Reviewer or team"
            onChange={(e) => update({ approvalAssignee: e.target.value || undefined })}
          />
          <Label htmlFor={fieldId("approval-escalation")}>Escalation timeout (seconds)</Label>
          <Input
            id={fieldId("approval-escalation")}
            type="number"
            min={1}
            step={1}
            value={data.escalationTimeoutSeconds ?? ""}
            placeholder="No escalation"
            onChange={(e) => update({ escalationTimeoutSeconds: e.target.value ? Number(e.target.value) : undefined })}
          />
          <p className="form-hint">Escalation sends one reminder, never approves. The server approval timeout still fails safely.</p>
          {(["slack", "email"] as const).map((channel) => (
            <div key={channel} className="space-y-2">
              <Label htmlFor={fieldId(`approval-${channel}`)}>{channel === "slack" ? "Slack" : "Email"} notification</Label>
              <Select
                value={data.approvalNotifications?.find((binding) => binding.channel === channel)?.credentialId || "none"}
                onValueChange={(id) => {
                  const remaining = (data.approvalNotifications || []).filter((binding) => binding.channel !== channel);
                  const credential = credentials.find((item) => item.id === id);
                  update({ approvalNotifications: credential
                    ? [...remaining, { channel, credentialId: credential.id, credentialName: credential.name }]
                    : remaining });
                }}
              >
                <SelectTrigger id={fieldId(`approval-${channel}`)} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Disabled</SelectItem>
                  {credentials.filter((credential) => credential.type === channel).map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>{credential.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <p className="form-hint">The workflow webhook is notified automatically. Optional channels use bound <Link href="/credentials" className="underline underline-offset-2">credentials</Link>; email requires SMTP configuration. Waits are in-process, not restart-safe.</p>
          {referenceLoadError.credentials && <ReferenceLoadHint label="credentials" onRetry={retryReferenceLoad} />}
        </div>
      )}

      {data.nodeType === "set_fields" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("fields-key-template-per-line")}>Fields (key=template per line)</Label>
          <DraftTextarea
            id={fieldId("fields-key-template-per-line")}
            seedKey={`${nodeId}:fields`}
            highlightExpressions
            className="font-mono text-xs"
            rows={5}
            serialize={() =>
              Object.entries(data.setFields || {})
                .map(([k, v]) => `${k}=${v}`)
                .join("\n")
            }
            onCommit={(value) => {
              const setFields: Record<string, string> = {};
              for (const line of value.split("\n")) {
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

      {[
        "agent",
        "router",
        "classifier",
        "summarizer",
        "translator",
        "extractor",
        "evaluation",
      ].includes(data.nodeType) && (
        <ModelProviderFields
          provider={data.provider}
          model={data.model}
          credentialName={data.credentialName}
          credentials={credentials}
          fieldId={fieldId}
          keyPrefix="node"
          credentialsLoadFailed={referenceLoadError.credentials}
          onRetryCredentials={retryReferenceLoad}
          onChange={(patch) => update(patch)}
        />
      )}

      {data.nodeType === "agent" && prompts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("prompt-ref")}>Registry prompt</Label>
          <Select
            value={data.promptRef?.prompt_id ?? "inline"}
            onValueChange={(value) =>
              update(
                value === "inline"
                  ? { promptRef: undefined }
                  : { promptRef: { prompt_id: value } }
              )
            }
          >
            <SelectTrigger id={fieldId("prompt-ref")} className="w-full">
              <SelectValue placeholder="Inline instruction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline">Inline instruction</SelectItem>
              {prompts.map((prompt) => (
                <SelectItem key={prompt.id} value={prompt.id}>
                  {prompt.name} (v{prompt.current_version})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.promptRef?.prompt_id && (
            <div className="flex items-center gap-2">
              <Label htmlFor={fieldId("prompt-version")} className="shrink-0 text-xs text-muted">
                Version
              </Label>
              <Select
                value={
                  data.promptRef.version !== undefined
                    ? String(data.promptRef.version)
                    : "current"
                }
                onValueChange={(value) =>
                  update({
                    promptRef: {
                      prompt_id: data.promptRef!.prompt_id,
                      ...(value === "current" ? {} : { version: Number(value) }),
                    },
                  })
                }
              >
                <SelectTrigger id={fieldId("prompt-version")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current (follows registry)</SelectItem>
                  {(
                    promptDetails[data.promptRef.prompt_id]?.versions ?? []
                  ).map((v) => (
                    <SelectItem key={v.version} value={String(v.version)}>
                      v{v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {data.promptRef?.prompt_id && (
            <p className="form-hint">
              Run uses the registry template; the inline instruction below is the
              fallback if the prompt can&apos;t be resolved.
            </p>
          )}
        </div>
      )}

      {data.nodeType === "agent" && (
        <div className="group space-y-2">
          <FieldHeader
            htmlFor={fieldId("instruction")}
            // O5: inline instruction is the fallback when a prompt registry
            // entry is bound — it isn't required.
            required={!data.promptRef?.prompt_id}
            actions={variablePicker((token) =>
              update({ instruction: (data.instruction || "") + token })
            )}
          >
            Instruction
          </FieldHeader>
          <ExpressionTextarea
            id={fieldId("instruction")}
            rows={5}
            value={data.instruction || ""}
            onChange={(e) => update({ instruction: e.target.value })}
            placeholder="You are a helpful assistant…"
            className={fieldErrors.instruction ? "border-destructive" : undefined}
          />
          <FieldError message={fieldErrors.instruction} />
          <ExpressionPreview workflowId={workflowId} expression={data.instruction || ""} />
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </div>
      )}

      {data.nodeType === "agent" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("output-schema")}>Output schema</Label>
          <Textarea
            id={fieldId("output-schema")}
            rows={6}
            className="font-mono text-xs"
            value={schemaText}
            onChange={(e) => {
              setSchemaText(e.target.value);
              setSchemaError(null);
            }}
            onBlur={() => {
              const raw = schemaText.trim();
              if (!raw) {
                setSchemaError(null);
                update({ outputSchema: undefined });
                return;
              }
              try {
                const parsed = JSON.parse(raw) as unknown;
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                  setSchemaError("Schema must be a JSON object");
                  return;
                }
                setSchemaError(null);
                update({ outputSchema: parsed as Record<string, unknown> });
              } catch {
                setSchemaError("Schema must be valid JSON");
              }
            }}
            placeholder={'{\n  "type": "object",\n  "properties": { "answer": { "type": "string" } },\n  "required": ["answer"]\n}'}
          />
          <FieldError message={schemaError ?? undefined} />
          <p className="form-hint">
            Optional. One object, scalar fields, scalar arrays, and one nested object. The run repairs the answer once, then fails if it still does not match.
          </p>
        </div>
      )}

      {data.nodeType === "agent" && (
        <AgentToolsEditor key={`tools-${nodeId}`} data={data} graph={graph} fieldErrors={fieldErrors} onChange={update} />
      )}

      {data.nodeType === "tool" && graph && (
        <div className="rounded-lg border border-border bg-surface-input px-3 py-3">
          {toolOwners.length > 0 ? (
            <>
              <p className="text-sm">Agent tool declaration</p>
              <p className="mt-1 text-xs text-muted">Attached to {toolOwners.map((node) => node.data.label).join(", ")}. Configure this reusable tool here; attached declarations are not standalone workflow steps.</p>
              <p className="mt-2 text-xs text-muted">Each agent call supplies an input string. In this tool&apos;s templates, {"{{last_output}}"} and {"{{input.text}}"} resolve to that string; upstream steps remain available.</p>
              {graph.edges.some((edge) => edge.source === nodeId || edge.target === nodeId) && <p className="mt-2 text-xs text-destructive">This attached declaration has graph edges. Explicitly remove those edges or remove the agent attachment before saving.</p>}
            </>
          ) : (
            <p className="text-xs text-muted">To reuse this tool inside an agent, leave it disconnected and select it in the agent&apos;s Agent tools section. Connected tools remain standalone workflow steps.</p>
          )}
        </div>
      )}

      {data.nodeType === "tool" && data.toolType === "search" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("search-provider")}>Search provider</Label>
          <Select
            value={data.searchProvider || "google"}
            onValueChange={(value) =>
              update(
                value === "google"
                  ? {
                      searchProvider: "google",
                      // Reliability is hidden for Google Search and the API
                      // rejects a positive retry/timeout on that provider.
                      retries: undefined,
                      retryDelaySec: undefined,
                      timeoutSec: undefined,
                    }
                  : { searchProvider: value as SearchProvider },
              )
            }
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
                    evalType: value as EvalType,
                    evalExecutionMode:
                      value === "llm" ? data.evalExecutionMode || "parallel" : "parallel",
                  })
                }
              >
                <SelectTrigger id={fieldId("eval-strategy")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llm">LLM grading</SelectItem>
                  <SelectItem value="exact">Exact match</SelectItem>
                  <SelectItem value="substring">Substring match</SelectItem>
                  <SelectItem value="regex">Regex match</SelectItem>
                  <SelectItem value="embedding">Embedding similarity</SelectItem>
                  <SelectItem value="json_schema">JSON Schema</SelectItem>
                  <SelectItem value="numeric">Numeric (within tolerance)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(data.evalType || "llm") === "llm" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("eval-preset")}>Eval rubric</Label>
                <Select
                  value={data.evalCustomPresetId || data.evalPreset || "__custom__"}
                  onValueChange={(value) =>
                    handlePresetChange(value === "__custom__" ? "" : value)
                  }
                >
                  <SelectTrigger id={fieldId("eval-preset")} className="w-full">
                    <SelectValue placeholder="Custom criteria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Custom criteria</SelectItem>
                    {evalPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                        {preset.source === "custom" ? " (custom)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {referenceLoadError.evalPresets && (
                  <ReferenceLoadHint label="eval rubrics" onRetry={retryReferenceLoad} />
                )}
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
                onBlur={() => {
                  const n = data.evalThreshold;
                  if (n == null || !Number.isFinite(n)) {
                    update({ evalThreshold: undefined });
                    return;
                  }
                  update({ evalThreshold: Math.min(5, Math.max(1, n)) });
                }}
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

            {(data.evalType === "exact" ||
              data.evalType === "substring" ||
              data.evalType === "numeric") && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("expected-value")}>Expected value</Label>
                <Textarea id={fieldId("expected-value")}
                  rows={2}
                  value={data.evalExpected || ""}
                  onChange={(e) => update({ evalExpected: e.target.value })}
                  placeholder={
                    data.evalType === "numeric"
                      ? "Expected number, e.g. 42"
                      : "Expected output or required substring"
                  }
                />
                {data.evalType === "numeric" && (
                  <p className="form-hint">
                    Compares the output number to the expected value within the tolerance below.
                  </p>
                )}
              </div>
            )}

            {data.evalType === "numeric" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("eval-tolerance")}>Tolerance</Label>
                <Input
                  id={fieldId("eval-tolerance")}
                  type="number"
                  min={0}
                  step="any"
                  value={data.evalTolerance ?? 0}
                  onChange={(e) =>
                    update({
                      evalTolerance: e.target.value ? Number(e.target.value) : 0,
                    })
                  }
                  onBlur={() => {
                    const n = data.evalTolerance;
                    if (n == null || !Number.isFinite(n) || n < 0) {
                      update({ evalTolerance: 0 });
                    }
                  }}
                />
                <p className="form-hint">
                  Numbers are considered equal when within this absolute tolerance (default 0).
                </p>
              </div>
            )}

            {data.evalType === "json_schema" && (
              <div className="space-y-2">
                <FieldHeader
                  htmlFor={fieldId("json-schema")}
                  actions={
                    <MagicWandField
                      kind="json_schema"
                      onInsert={(value) => update({ evalExpected: value })}
                    />
                  }
                >
                  JSON Schema
                </FieldHeader>
                <Textarea
                  id={fieldId("json-schema")}
                  rows={5}
                  className="font-mono text-xs"
                  value={data.evalExpected || ""}
                  onChange={(e) => update({ evalExpected: e.target.value })}
                  placeholder={'{\n  "type": "object",\n  "required": ["name"]\n}'}
                />
                <p className="form-hint">
                  The output is validated against this JSON Schema. Use the wand to draft one from a
                  description.
                </p>
              </div>
            )}

            {data.evalType === "regex" && (
              <div className="space-y-2">
                <FieldHeader
                  htmlFor={fieldId("regex-pattern")}
                  actions={
                    <MagicWandField
                      kind="regex"
                      onInsert={(value) => update({ evalPattern: value })}
                    />
                  }
                >
                  Regex pattern
                </FieldHeader>
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
          <Label htmlFor={fieldId("extract-fields")}>Fields to extract</Label>
          <TagInput
            id={fieldId("extract-fields")}
            values={data.extractFields || []}
            onChange={(extractFields) => update({ extractFields })}
            placeholder="summary, entities, dates…"
          />
          <p className="form-hint">Returned as JSON keys extracted from the input.</p>
        </div>
      )}

      {data.nodeType === "transform" && (
        <div className="group space-y-2">
          <FieldHeader
            htmlFor={fieldId("template")}
            actions={variablePicker((token) =>
              update({ template: (data.template ?? "{{input}}") + token })
            )}
          >
            Template
          </FieldHeader>
          <ExpressionTextarea
            id={fieldId("template")}
            className="font-mono text-xs"
            rows={4}
            value={data.template || "{{input}}"}
            onChange={(e) => update({ template: e.target.value })}
            placeholder="{{input}} or {{steps.node_1.output}}"
          />
          <ExpressionPreview
            workflowId={workflowId}
            expression={data.template || "{{input}}"}
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
          <p className="form-hint">
            Parses the previous output as JSON; the path drills into nested values.
          </p>
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
            value={data.delaySeconds ?? ""}
            placeholder="1"
            onChange={(e) => {
              const n = Number(e.target.value);
              update({ delaySeconds: e.target.value === "" || !Number.isFinite(n) ? undefined : n });
            }}
            onBlur={() => {
              const n = data.delaySeconds;
              if (n == null || !Number.isFinite(n)) {
                update({ delaySeconds: 1 });
                return;
              }
              update({ delaySeconds: Math.min(30, Math.max(0.1, n)) });
            }}
          />
          <p className="form-hint">Pauses the run — useful for pacing rate-limited APIs.</p>
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
        <InspectorSection title="Request">
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
              className="font-mono text-xs"
              value={data.httpUrl || ""}
              onChange={(e) => update({ httpUrl: e.target.value })}
              placeholder="https://api.example.com/{{input.id}}"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("body-template-optional")}>Body template (optional)</Label>
            <ExpressionTextarea
              id={fieldId("body-template-optional")}
              className="font-mono text-xs"
              rows={3}
              value={data.httpBody || ""}
              onChange={(e) => update({ httpBody: e.target.value })}
              placeholder='{"query": "{{last_output}}"}'
            />
          </div>
          <p className="form-hint">{EXPRESSION_HINT}</p>
        </InspectorSection>
      )}

      {data.nodeType === "router" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("routes")}>Routes</Label>
          <TagInput
            id={fieldId("routes")}
            values={data.routes || []}
            onChange={(routes) => update({ routes })}
            placeholder="math, general, fallback…"
          />
          <p className="form-hint">
            The router LLM picks one route per run — label outgoing edges to match.
          </p>
        </div>
      )}

      {data.nodeType === "classifier" && (
        <div className="space-y-2">
          <Label htmlFor={fieldId("categories")}>Categories</Label>
          <TagInput
            id={fieldId("categories")}
            values={data.categories || []}
            onChange={(categories) => update({ categories })}
            placeholder="support, sales, billing…"
          />
          <p className="form-hint">
            Input is classified into one category — label outgoing edges to match.
          </p>
        </div>
      )}

      {data.nodeType === "join" && (
        <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-3">
          <p className="text-sm text-foreground">No configuration needed</p>
          <p className="mt-1 text-xs text-muted">
            Join waits for every incoming branch, then continues with their combined output.
            Connect multiple edges into this node.
          </p>
        </div>
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
                  {/* One vocabulary per rail, shared with the playground, the
                      verdict panel and the Trust dashboard. */}
                  {(
                    [
                      "rules",
                      "llm",
                      "presidio",
                      "prompt_injection",
                      "moderation",
                      "json_schema",
                    ] as GuardrailType[]
                  ).map((type) => (
                    <SelectItem key={type} value={type}>
                      {GUARDRAIL_TYPE_HINTS[type]}
                    </SelectItem>
                  ))}
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

          {["llm", "prompt_injection", "moderation"].includes(
            data.rules?.guardrail_type || "rules"
          ) && (
            <ModelProviderFields
              provider={data.rules?.guardrail_provider}
              model={data.rules?.guardrail_model}
              credentialName={data.credentialName}
              credentials={credentials}
              fieldId={fieldId}
              keyPrefix="guardrail"
              credentialsLoadFailed={referenceLoadError.credentials}
              onRetryCredentials={retryReferenceLoad}
              onChange={(patch) => {
                const rules = { ...data.rules };
                if ("provider" in patch) rules.guardrail_provider = patch.provider;
                if ("model" in patch) rules.guardrail_model = patch.model;
                const dataPatch: Partial<NodeData> = { rules };
                if ("credentialId" in patch) dataPatch.credentialId = patch.credentialId;
                if ("credentialName" in patch) dataPatch.credentialName = patch.credentialName;
                update(dataPatch);
              }}
            />
          )}

          <InspectorDetails title="Rules" defaultOpen>
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

            {data.rules?.guardrail_type === "moderation" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("moderation-threshold")}>Flag threshold</Label>
                <Input
                  id={fieldId("moderation-threshold")}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={data.rules?.moderation_threshold ?? 0.5}
                  onChange={(e) =>
                    update({
                      rules: {
                        ...data.rules,
                        moderation_threshold: Number(e.target.value),
                      },
                    })
                  }
                  onBlur={() => {
                    const n = data.rules?.moderation_threshold;
                    const clamped =
                      n == null || !Number.isFinite(n)
                        ? 0.5
                        : Math.min(1, Math.max(0, n));
                    if (clamped !== n) {
                      update({ rules: { ...data.rules, moderation_threshold: clamped } });
                    }
                  }}
                  placeholder="0.5"
                />
                <p className="form-hint">
                  Content is flagged when any category score (toxicity, hate, violence,
                  self-harm, sexual; 0–1) meets this threshold.
                </p>
              </div>
            )}

            {data.rules?.guardrail_type === "json_schema" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("json-schema")}>JSON schema</Label>
                <Textarea
                  id={fieldId("json-schema")}
                  rows={5}
                  className="font-mono text-xs"
                  value={data.rules?.json_schema || ""}
                  onChange={(e) =>
                    update({ rules: { ...data.rules, json_schema: e.target.value } })
                  }
                  placeholder={
                    '{"type":"object","required":["name"],' +
                    '"properties":{"name":{"type":"string"}}}'
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId("reask")}>On failure</Label>
                    <Select
                      value={data.rules?.reask === false ? "fail" : "reask"}
                      onValueChange={(value) =>
                        update({ rules: { ...data.rules, reask: value === "reask" } })
                      }
                    >
                      <SelectTrigger id={fieldId("reask")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reask">Re-ask to repair</SelectItem>
                        <SelectItem value="fail">Fail immediately</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {data.rules?.reask !== false && (
                    <div className="space-y-1.5">
                      <Label htmlFor={fieldId("max-retries")}>Max re-asks</Label>
                      <Input
                        id={fieldId("max-retries")}
                        type="number"
                        min={1}
                        max={4}
                        value={data.rules?.max_retries ?? 2}
                        onChange={(e) =>
                          update({ rules: { ...data.rules, max_retries: Number(e.target.value) } })
                        }
                        onBlur={() => {
                          const n = data.rules?.max_retries;
                          const clamped =
                            n == null || !Number.isFinite(n)
                              ? 2
                              : Math.min(4, Math.max(1, Math.round(n)));
                          if (clamped !== n) {
                            update({ rules: { ...data.rules, max_retries: clamped } });
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
                <p className="form-hint">
                  Validates output against the schema. On failure, the model is asked to repair
                  it into schema-valid JSON (bounded re-asks) before the guardrail fails.
                </p>
              </div>
            )}

            {data.rules?.guardrail_type === "presidio" && (
              <div className="space-y-2">
                <Label htmlFor={fieldId("presidio-entities")}>Presidio entities</Label>
                <TagInput
                  id={fieldId("presidio-entities")}
                  values={data.rules?.presidio_entities || []}
                  onChange={(presidio_entities) =>
                    update({ rules: { ...data.rules, presidio_entities } })
                  }
                  placeholder="EMAIL_ADDRESS, PHONE_NUMBER…"
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
                  <Label htmlFor={fieldId("blocked-keywords")}>Blocked keywords</Label>
                  <TagInput
                    id={fieldId("blocked-keywords")}
                    values={data.rules?.blocked_keywords || []}
                    onChange={(blocked_keywords) =>
                      update({ rules: { ...data.rules, blocked_keywords } })
                    }
                    placeholder="Add a keyword, press Enter…"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldId("required-keywords")}>Required keywords</Label>
                  <TagInput
                    id={fieldId("required-keywords")}
                    values={data.rules?.required_keywords || []}
                    onChange={(required_keywords) =>
                      update({ rules: { ...data.rules, required_keywords } })
                    }
                    placeholder="refund, policy…"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldId("blocked-regex-patterns-one-per-l")}>Blocked regex patterns (one per line)</Label>
                  <DraftTextarea
                    id={fieldId("blocked-regex-patterns-one-per-l")}
                    seedKey={`${nodeId}:blocked-patterns`}
                    rows={2}
                    serialize={() => (data.rules?.blocked_patterns || []).join("\n")}
                    onCommit={(value) =>
                      update({
                        rules: {
                          ...data.rules,
                          blocked_patterns: value
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
                  <FieldHeader
                    htmlFor={fieldId("required-regex-pattern")}
                    actions={
                      <MagicWandField
                        kind="regex"
                        onInsert={(value) =>
                          update({ rules: { ...data.rules, pattern: value } })
                        }
                      />
                    }
                  >
                    Required regex pattern
                  </FieldHeader>
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

                <CheckboxRow
                  id={fieldId("detect-pii")}
                  checked={data.rules?.detect_pii ?? false}
                  onChange={(detect_pii) =>
                    update({ rules: { ...data.rules, detect_pii } })
                  }
                  label="Detect PII"
                  hint="Regex scan for email addresses and phone numbers."
                />
              </>
            )}
          </InspectorDetails>

          <InspectorDetails title="Testing / Preview">
            <GuardrailPreviewPanel rules={data.rules} />
          </InspectorDetails>
        </>
      )}

      {data.nodeType === "tool" &&
      data.toolType === "search" &&
      (data.searchProvider || "google") === "google" ? (
        <p className="form-hint">
          Retries and timeout don&apos;t apply to Google Search — it runs as a bare model
          tool, so those settings would be ignored at run time.
        </p>
      ) : RELIABILITY_NODE_TYPES.has(data.nodeType) ? (
        <InspectorDetails title="Reliability">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor={fieldId("retries")} className="text-xs">Retries</Label>
              <Input
                id={fieldId("retries")}
                type="number"
                min={0}
                max={5}
                value={data.retries ?? ""}
                placeholder="0"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update({ retries: e.target.value === "" || !Number.isFinite(n) ? undefined : n });
                }}
                onBlur={() => {
                  const n = data.retries;
                  if (n == null || !Number.isFinite(n)) {
                    update({ retries: undefined });
                    return;
                  }
                  update({ retries: Math.min(5, Math.max(0, Math.round(n))) });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("retry-delay")} className="text-xs">Delay (s)</Label>
              <Input
                id={fieldId("retry-delay")}
                type="number"
                min={0}
                step={0.5}
                value={data.retryDelaySec ?? ""}
                placeholder="1"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update({
                    retryDelaySec: e.target.value === "" || !Number.isFinite(n) ? undefined : n,
                  });
                }}
                onBlur={() => {
                  const n = data.retryDelaySec;
                  if (n == null || !Number.isFinite(n)) {
                    update({ retryDelaySec: undefined });
                    return;
                  }
                  update({ retryDelaySec: Math.max(0, n) });
                }}
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
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    update({ timeoutSec: undefined });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  update({ timeoutSec: n });
                }}
                onBlur={() => {
                  const n = data.timeoutSec;
                  if (n == null || !Number.isFinite(n)) {
                    update({ timeoutSec: undefined });
                    return;
                  }
                  update({ timeoutSec: Math.max(0, n) });
                }}
              />
            </div>
          </div>
          <p className="form-hint">
            Failed attempts retry with exponential backoff. Applies to tool/data/integration
            nodes; LLM agents are governed by the run timeout.
          </p>
        </InspectorDetails>
      ) : null}

      {/* Node-anchored comments — the last section in the body, below every
          config field, universal across node types. Keyed by nodeId so the
          composer draft resets on selection change. Edits flow through the
          normal update() path, so they're recorded in undo/redo and mark the
          canvas dirty via graphSignature. */}
      <CommentsSection
        key={`comments-${nodeId}`}
        comments={data.comments ?? []}
        onAdd={(text) =>
          update({
            comments: [
              ...(data.comments ?? []),
              {
                id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                text,
                createdAt: new Date().toISOString(),
              },
            ],
          })
        }
        onDelete={(commentId) => {
          const next = (data.comments ?? []).filter((c) => c.id !== commentId);
          update({ comments: next.length ? next : undefined });
        }}
      />
        </div>
    </InspectorMotionShell>
  );
}
