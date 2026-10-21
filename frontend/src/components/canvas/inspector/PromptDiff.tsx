"use client";

/**
 * Minimal char-level LCS diff between two strings. Returns spans tagged as
 * equal / added (only in `b`) / removed (only in `a`). O(n·m) — fine for prompts.
 */
export type DiffSpan = { type: "equal" | "add" | "remove"; text: string };

export function charDiff(a: string, b: string): DiffSpan[] {
  const n = a.length;
  const m = b.length;
  // Guard against pathological sizes — fall back to a coarse whole-string diff.
  if (n * m > 250_000) {
    if (a === b) return [{ type: "equal", text: a }];
    return [
      ...(a ? [{ type: "remove" as const, text: a }] : []),
      ...(b ? [{ type: "add" as const, text: b }] : []),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const spans: DiffSpan[] = [];
  const push = (type: DiffSpan["type"], ch: string) => {
    const last = spans[spans.length - 1];
    if (last && last.type === type) last.text += ch;
    else spans.push({ type, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("remove", a[i]);
      i++;
    } else {
      push("add", b[j]);
      j++;
    }
  }
  while (i < n) push("remove", a[i++]);
  while (j < m) push("add", b[j++]);
  return spans;
}

/** Renders a char-level diff of two prompts. Color is reserved for semantics —
 *  added spans use success, removed use destructive (strikethrough). */
export function PromptDiff({ base, variant }: { base: string; variant: string }) {
  const spans = charDiff(base, variant);
  if (base === variant) {
    return <p className="text-2xs text-subtle">Identical to base prompt.</p>;
  }
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-2xs leading-relaxed text-muted">
      {spans.map((span, idx) => {
        if (span.type === "equal") return <span key={idx}>{span.text}</span>;
        if (span.type === "add")
          return (
            <span key={idx} className="text-success">
              {span.text}
            </span>
          );
        return (
          <span key={idx} className="text-destructive line-through">
            {span.text}
          </span>
        );
      })}
    </pre>
  );
}
