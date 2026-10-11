import type { RunStatusTone } from "./run-status";
import { parseTimestamp } from "@/lib/format-date";
import {
  partitionByLifecycle,
  workflowLifecycleStage,
  type WorkflowLifecycleStage,
} from "@/lib/workflow-lifecycle";
import type { AlertEvent, WorkflowListItem } from "@/types/workflow";

/** Days without update before an in-review workflow becomes a next action. */
export const STALE_REVIEW_DAYS = 7;

export type NextActionKind =
  | "failed"
  | "awaiting"
  | "blocked"
  | "eval_fail"
  | "stale_review"
  | "alert";

export type NextAction = {
  id: string;
  kind: NextActionKind;
  /** Short severity word rendered next to the dot (e.g. "Blocked"). */
  status: string;
  title: string;
  detail: string;
  href: string;
  /** Relative time or short numeric meta (mono). */
  meta?: string;
};

export type RecentRunRow = {
  run_id: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
  status: string;
  created_at: string;
  eval_passed?: boolean | null;
  guardrail_blocked?: boolean;
};

const MAX_ACTIONS = 8;
const MAX_FAILED_RUNS = 4;
const MAX_ALERTS = 3;

function isFailedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "failed" || s === "error" || s === "cancelled";
}

function isAwaitingStatus(status: string): boolean {
  return status.toLowerCase() === "awaiting_approval";
}

/**
 * Ranked next actions for the desk: failures/approvals first, then alerts,
 * then a single bulk "stale in review" row when the queue is large.
 */
export function buildNextActions(input: {
  runs: RecentRunRow[];
  alerts: AlertEvent[];
  workflows: WorkflowListItem[];
  now?: number;
  formatRelative: (iso: string, now: number) => string;
}): NextAction[] {
  const now = input.now ?? Date.now();
  const items: NextAction[] = [];
  const seenRuns = new Set<string>();

  for (const run of input.runs) {
    if (items.length >= MAX_ACTIONS) break;
    if (seenRuns.has(run.run_id)) continue;

    if (isAwaitingStatus(run.status)) {
      items.push({
        id: `await-${run.run_id}`,
        kind: "awaiting",
        status: "Awaiting approval",
        title: run.workflow_name || "Workflow",
        detail: "Approve or reject in the run view to continue",
        href: `/runs/${run.run_id}`,
        meta: run.created_at ? input.formatRelative(run.created_at, now) : undefined,
      });
      seenRuns.add(run.run_id);
      continue;
    }

    if (run.guardrail_blocked) {
      items.push({
        id: `block-${run.run_id}`,
        kind: "blocked",
        status: "Blocked",
        title: run.workflow_name || "Workflow",
        detail: "Stopped by a guardrail — inspect the run",
        href: `/runs/${run.run_id}`,
        meta: run.created_at ? input.formatRelative(run.created_at, now) : undefined,
      });
      seenRuns.add(run.run_id);
      continue;
    }

    if (isFailedStatus(run.status)) {
      if (items.filter((a) => a.kind === "failed").length >= MAX_FAILED_RUNS) continue;
      items.push({
        id: `fail-${run.run_id}`,
        kind: "failed",
        status: run.status.toLowerCase() === "cancelled" ? "Cancelled" : "Failed",
        title: run.workflow_name || "Workflow",
        detail:
          run.status.toLowerCase() === "cancelled"
            ? "Stopped before finishing — open to confirm"
            : "Open the trace to inspect",
        href: `/runs/${run.run_id}`,
        meta: run.created_at ? input.formatRelative(run.created_at, now) : undefined,
      });
      seenRuns.add(run.run_id);
      continue;
    }

    if (run.eval_passed === false) {
      items.push({
        id: `eval-${run.run_id}`,
        kind: "eval_fail",
        status: "Eval failed",
        title: run.workflow_name || "Workflow",
        detail: "Scored under the pass threshold",
        href: `/runs/${run.run_id}`,
        meta: run.created_at ? input.formatRelative(run.created_at, now) : undefined,
      });
      seenRuns.add(run.run_id);
    }
  }

  for (const alert of input.alerts.slice(0, MAX_ALERTS)) {
    if (items.length >= MAX_ACTIONS) break;
    items.push({
      id: `alert-${alert.id}`,
      kind: "alert",
      status: "Alert",
      title: alert.metric || "Alert",
      detail: alert.message || "Alert rule fired",
      href: "/observability",
      meta: alert.fired_at ? input.formatRelative(alert.fired_at, now) : undefined,
    });
  }

  // One triage row for the review backlog — never dump hundreds of rows into Next.
  const staleCutoff = now - STALE_REVIEW_DAYS * 24 * 60 * 60 * 1000;
  const inReview = partitionByLifecycle(input.workflows).in_review;
  const stale = inReview.filter((w) => {
    if (!w.updated_at) return false;
    const t = parseTimestamp(w.updated_at).getTime();
    return Number.isFinite(t) && t < staleCutoff;
  });

  if (stale.length > 0 && items.length < MAX_ACTIONS) {
    const oldest = [...stale].sort((a, b) =>
      (a.updated_at ?? "").localeCompare(b.updated_at ?? "")
    )[0];
    items.push({
      id: "stale-review",
      kind: "stale_review",
      status: "Stale",
      title:
        stale.length === 1
          ? oldest?.name || "Workflow in review"
          : `${stale.length} workflows stale in review`,
      detail:
        stale.length === 1
          ? `No update in ${STALE_REVIEW_DAYS}+ days — publish or archive it`
          : `Each untouched for ${STALE_REVIEW_DAYS}+ days — triage the review queue`,
      href: oldest ? `/workflows/${oldest.id}` : "/#library",
      meta: oldest?.updated_at
        ? input.formatRelative(oldest.updated_at, now)
        : undefined,
    });
  } else if (inReview.length >= 20 && items.length < MAX_ACTIONS) {
    // Large queue but not all "stale" — still surface the bottleneck once.
    items.push({
      id: "review-backlog",
      kind: "stale_review",
      status: "In review",
      title: `${inReview.length} workflows in review`,
      detail: "Saved but not published — filter the library to triage",
      href: "/#library",
    });
  }

  return items.slice(0, MAX_ACTIONS);
}

/** One-line status under the page title. */
export function buildDeskStatusLine(actions: NextAction[], activeRuns: number): string {
  if (actions.length === 0 && activeRuns <= 0) {
    return "All clear — nothing needs you right now.";
  }
  const parts: string[] = [];
  if (actions.length > 0) {
    parts.push(
      actions.length === 1 ? "1 needs attention" : `${actions.length} need attention`
    );
  }
  const failed = actions.filter((a) => a.kind === "failed" || a.kind === "blocked").length;
  if (failed > 0) {
    parts.push(failed === 1 ? "1 failed run" : `${failed} failed runs`);
  }
  const awaiting = actions.filter((a) => a.kind === "awaiting").length;
  if (awaiting > 0) {
    parts.push(awaiting === 1 ? "1 awaiting approval" : `${awaiting} awaiting approval`);
  }
  if (activeRuns > 0) {
    parts.push(activeRuns === 1 ? "1 run active" : `${activeRuns} runs active`);
  }
  return parts.join(" · ");
}

/** Lifecycle stage → status tone; the dot itself is ui/status-dot. */
export function stageTone(stage: WorkflowLifecycleStage): RunStatusTone {
  if (stage === "published") return "success";
  if (stage === "in_review") return "warning";
  return "muted";
}

export function stageLabel(stage: WorkflowLifecycleStage): string {
  if (stage === "published") return "Live";
  if (stage === "in_review") return "In review";
  return "Draft";
}

/**
 * Version token only — callers already render the stage word, so "live"/"draft"
 * must not repeat here. A published workflow without a version number is an
 * API edge case; "v—" keeps the version slot honest without claiming a number.
 */
export function versionLabel(w: WorkflowListItem): string {
  const stage = workflowLifecycleStage(w);
  if (stage === "draft") return "unsaved";
  if (w.latest_version_number != null) return `v${w.latest_version_number}`;
  return stage === "published" ? "v—" : "saved";
}

/**
 * Next-action kind → status tone; the dot itself is ui/status-dot. Mirrors the
 * run-status ladder: failures/guardrail blocks are destructive, a run parked
 * on a human is accent, everything else needing triage is warning.
 */
export function actionTone(kind: NextActionKind): RunStatusTone {
  if (kind === "failed" || kind === "blocked") return "destructive";
  if (kind === "awaiting") return "accent";
  return "warning";
}
