"use client";

import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function TraceIdBadge({
  traceId,
  uiBaseUrl,
  compact = false,
}: {
  traceId: string;
  uiBaseUrl?: string | null;
  compact?: boolean;
}) {
  const shortId = compact ? traceId.slice(0, 8) : traceId;
  const traceUrl = uiBaseUrl
    ? uiBaseUrl.includes("{trace_id}")
      ? uiBaseUrl.replace("{trace_id}", traceId)
      : `${uiBaseUrl.replace(/\/$/, "")}/trace/${traceId}`
    : null;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono text-xs text-muted transition hover:text-foreground"
      title={`Trace ${traceId}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(traceId);
          toast.success("Trace ID copied");
        } catch {
          toast.error("Could not copy trace ID");
        }
      }}
    >
      <Badge variant="outline" className="font-mono text-[10px]">
        trace {shortId}
      </Badge>
      {traceUrl && (
        <a
          href={traceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
          onClick={(event) => event.stopPropagation()}
          aria-label="Open trace in APM UI"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </button>
  );
}