"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Shared last-100-runs window for the home pulse bar and the ops stat row.
 * One options object so co-mounted observers of the shared key agree on
 * retry/stale behavior instead of last-observer-wins.
 */
export function useObservabilityRuns(limit = 100, enabled = true) {
  return useQuery({
    queryKey: queryKeys.observabilityRuns(limit),
    queryFn: () => api.listObservabilityRuns(limit),
    retry: 1,
    staleTime: 30_000,
    enabled,
  });
}
