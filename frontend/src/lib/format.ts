export const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

/** Canonical money formatting: 4 decimals covers per-run costs; sub-cent
 * dust shows a floor instead of misleading zeros. */
export function formatCostUsd(usd: number | null | undefined): string {
  if (typeof usd !== "number" || usd <= 0) return "—";
  if (usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(4)}`;
}
