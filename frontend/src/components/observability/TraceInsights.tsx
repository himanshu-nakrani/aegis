"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionCard } from "@/components/ui/section-card";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function TraceInsights() {
  const queryClient = useQueryClient();
  const insightsQuery = useQuery({
    queryKey: queryKeys.traceInsights,
    queryFn: () => api.getTraceInsights(),
  });

  const queueMutation = useMutation({
    mutationFn: (signature: string) => api.queueInsight(signature),
    onSuccess: (result) => {
      toast.success(
        result.queued
          ? `Queued ${result.queued} run${result.queued === 1 ? "" : "s"}`
          : "Those runs are already in the review queue"
      );
      void queryClient.invalidateQueries({ queryKey: ["annotation-queue"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const patterns = insightsQuery.data?.patterns ?? [];

  return (
    <SectionCard
      title="Repeated weak answers"
      description="Completed runs with an eval below 0.7, or a thumbs-down, grouped when the same answer shows up at least twice."
    >
      {insightsQuery.isLoading ? (
        <LoadingState variant="inline" label="Looking for repeated answers…" />
      ) : insightsQuery.isError ? (
        <InlineQueryError
          message="Couldn't load answer patterns"
          detail={insightsQuery.error.message}
          onRetry={() => void insightsQuery.refetch()}
        />
      ) : patterns.length === 0 ? (
        <EmptyState
          compact
          title="No repeated weak answers"
          description="Patterns appear after two completed runs share a low score or a thumbs-down."
        />
      ) : (
        <ul className="divide-y divide-border">
          {patterns.map((pattern) => (
            <li key={pattern.signature} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {pattern.count} runs · {pattern.reason === "thumbs_down" ? "thumbs down" : "low eval"}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{pattern.preview || "Empty output"}</p>
                <p className="mt-1 text-xs text-muted">
                  <Link
                    href={`/runs/${pattern.sample_run_id}`}
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    Sample run
                  </Link>
                  {pattern.members[0]?.workflow_name ? ` · ${pattern.members[0].workflow_name}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={queueMutation.isPending}
                onClick={() => queueMutation.mutate(pattern.signature)}
              >
                Queue
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
