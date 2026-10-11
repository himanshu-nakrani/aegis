"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";

/** The actual saved rows, including labels and run provenance, not a count-only toast. */
export function DatasetExamples({ datasetId }: { datasetId: string }) {
  const query = useQuery({
    queryKey: queryKeys.dataset(datasetId),
    queryFn: () => api.getDataset(datasetId),
  });
  if (query.isPending) return <p className="text-xs text-muted">Loading dataset examples…</p>;
  if (query.isError) return <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry dataset examples</Button>;
  const dataset = query.data;
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium">{dataset.name} · {dataset.item_count} examples</p>
      {dataset.items.length === 0 && <p className="text-muted">No examples yet.</p>}
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {dataset.items.map((item) => (
          <div key={item.id} className="rounded-md border border-border bg-surface-input p-2">
            <p className="whitespace-pre-wrap break-words">{item.input_text}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-muted">
              Expected: {item.expected_output ?? "Unlabelled — no gold output set"}
            </p>
            {typeof item.tags?.source_run === "string" && (
              <Link className="focus-ring mt-1 block text-subtle underline" href={`/runs/${item.tags.source_run}`}>Source run · {item.tags.source_run}</Link>
            )}
            {item.tags && <pre className="mt-1 whitespace-pre-wrap break-all text-2xs text-subtle">{JSON.stringify(item.tags, null, 2)}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
