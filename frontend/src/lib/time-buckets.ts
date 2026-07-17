interface Stamped {
  created_at?: string | null;
}

/**
 * Bucket timestamped items into `bucketCount` equal windows between the
 * oldest and newest timestamps. Tolerates unsorted and duplicated input —
 * live-stream patches mutate cached lists in place.
 *
 * Returns counts per bucket (oldest → newest), or averages of `value(item)`
 * when a selector is given (empty buckets carry the previous average so
 * sparklines don't spike to zero on sparse windows).
 */
export function timeBuckets<T extends Stamped>(
  items: T[],
  bucketCount: number,
  value?: (item: T) => number | null | undefined
): number[] {
  const stamps = items
    .map((item) => ({ item, t: item.created_at ? Date.parse(item.created_at) : NaN }))
    .filter((entry) => Number.isFinite(entry.t));
  if (stamps.length === 0 || bucketCount < 1) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const { t } of stamps) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const span = max - min || 1;

  const sums = new Array<number>(bucketCount).fill(0);
  const counts = new Array<number>(bucketCount).fill(0);
  for (const { item, t } of stamps) {
    const idx = Math.min(bucketCount - 1, Math.floor(((t - min) / span) * bucketCount));
    if (value) {
      const v = value(item);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      sums[idx] += v;
      counts[idx] += 1;
    } else {
      counts[idx] += 1;
    }
  }

  if (!value) return counts;

  const out: number[] = [];
  let carry = 0;
  for (let i = 0; i < bucketCount; i++) {
    if (counts[i] > 0) carry = sums[i] / counts[i];
    out.push(carry);
  }
  return out;
}
