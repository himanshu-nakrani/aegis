export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 45) return "just now";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatFullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Renders the instant in UTC with the zone spelled out. Schedules (cron
 * windows, "next runs") are stored and evaluated in UTC, so showing them in the
 * viewer's local zone under a "UTC" heading is an off-by-hours lie — this is
 * the formatter for anything labelled UTC.
 */
export function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { timeZone: "UTC", timeZoneName: "short" });
}