export type RunStatusVariant = "success" | "warning" | "destructive" | "accent" | "outline";

/** Semantic tone for a run/node status. `muted` is the neutral fallback —
 *  each projection below spells it with its own surface-appropriate token. */
export type RunStatusTone = "success" | "warning" | "destructive" | "accent" | "muted";

/**
 * Projection rule: list rows pair `StatusDot` with a colored status word
 * (`runStatusTextClass`); detail headers use `Badge variant={runStatusVariant}`.
 * Surfaces never invent their own status→color mapping — everything routes
 * through `runStatusTone` (or the quality helpers below for scored data).
 */

/**
 * The one status→tone decision in the app. Chroma is reserved for data
 * semantics, so a live run must read the same on the canvas run deck, the
 * observability tables, and the trace: live work is `warning` (amber), a run
 * parked on a human is `accent`. Synonyms emitted by the executor
 * (success/passed, error, in_progress/starting) fold into the same buckets so
 * no surface has to re-normalize.
 */
export function runStatusTone(status: string): RunStatusTone {
  const s = status.toLowerCase();
  if (s === "completed" || s === "success" || s === "passed") return "success";
  if (s === "failed" || s === "error" || s === "cancelled") return "destructive";
  if (s === "awaiting_approval" || s === "awaiting") return "accent";
  if (
    s === "running" ||
    s === "pending" ||
    s === "queued" ||
    s === "waiting" ||
    s === "starting" ||
    s === "in_progress" ||
    s === "warned"
  ) {
    return "warning";
  }
  return "muted";
}

export function runStatusVariant(status: string): RunStatusVariant {
  const tone = runStatusTone(status);
  return tone === "muted" ? "outline" : tone;
}

/** Tone → text color token (headers, inline status words, attention lists). */
export function toneTextClass(tone: RunStatusTone): string {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "destructive") return "text-destructive";
  if (tone === "accent") return "text-accent";
  return "text-muted";
}

/** Status → text color token (headers, inline status words, attention lists). */
export function runStatusTextClass(status: string): string {
  return toneTextClass(runStatusTone(status));
}

/** Status → dot/pip fill (run tables, session mixes). */
export function runStatusDotClass(status: string): string {
  const tone = runStatusTone(status);
  if (tone === "success") return "bg-success";
  if (tone === "warning") return "bg-warning";
  if (tone === "destructive") return "bg-destructive";
  if (tone === "accent") return "bg-accent";
  return "bg-muted";
}

/** Status → ring token for glyphs. Callers own the ring width/opacity
 *  (e.g. `cn("ring-2", runStatusRingClass(s))`); neutral stays on the hairline
 *  border token so an unremarkable node doesn't gain a visible halo. */
export function runStatusRingClass(status: string): string {
  const tone = runStatusTone(status);
  if (tone === "success") return "ring-success";
  if (tone === "warning") return "ring-warning";
  if (tone === "destructive") return "ring-destructive";
  if (tone === "accent") return "ring-accent";
  return "ring-border";
}

/** Status → border token for result cards. Neutral keeps the card's own
 *  border treatment rather than tinting it muted. */
export function runStatusBorderClass(status: string): string {
  const tone = runStatusTone(status);
  if (tone === "success") return "border-success";
  if (tone === "warning") return "border-warning";
  if (tone === "destructive") return "border-destructive";
  if (tone === "accent") return "border-accent";
  return "border-border";
}

/** Guardrail severity tone. Distinct from run status: a guardrail that
 *  `blocked` is a destructive outcome, and anything unrecognized renders as a
 *  neutral outlined chip rather than borrowing a severity hue. */
export type GuardrailStatusTone = "success" | "warning" | "destructive" | "outline";

export function guardrailStatusTone(status: string): GuardrailStatusTone {
  const s = status.toLowerCase();
  if (s === "passed" || s === "ok" || s === "completed") return "success";
  if (s === "warned" || s === "warn") return "warning";
  if (s === "blocked" || s === "failed" || s === "error") return "destructive";
  return "outline";
}

export function runStatusLabel(status: string): string {
  if (status === "awaiting_approval") return "awaiting approval";
  return status.replace(/_/g, " ");
}

/** Quality tones for scored data (eval aggregates, SLO rates). */
export type QualityTone = "success" | "warning" | "destructive";

/** True when an eval aggregate is on the 1..5 judge scale, not a 0..1 ratio. */
export function isFiveScale(score: number): boolean {
  return score >= 1;
}

/** Band an eval aggregate into a quality tone on its actual scale. */
export function evalScoreTone(score: number, scale: "five" | "unit"): QualityTone {
  if (scale === "five") {
    if (score >= 3.5) return "success";
    if (score >= 2.5) return "warning";
    return "destructive";
  }
  if (score >= 0.7) return "success";
  if (score >= 0.4) return "warning";
  return "destructive";
}

/**
 * Tone for a rate metric. `bands` is [good, warn] measured in the metric's own
 * direction; past `warn` reads destructive. Null handling stays with callers —
 * a missing rate is "no data", not a quality judgement.
 */
export function rateTone(
  value: number,
  direction: "high-good" | "low-good",
  bands: [number, number]
): QualityTone {
  const [good, warn] = bands;
  const highGood = direction === "high-good";
  if (highGood ? value >= good : value <= good) return "success";
  if (highGood ? value >= warn : value <= warn) return "warning";
  return "destructive";
}
