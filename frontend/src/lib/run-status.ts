export type RunStatusVariant = "success" | "warning" | "destructive" | "accent" | "outline";

export function runStatusVariant(status: string): RunStatusVariant {
  if (status === "completed" || status === "passed") return "success";
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "awaiting_approval") return "accent";
  if (status === "warned") return "warning";
  if (
    status === "running" ||
    status === "pending" ||
    status === "queued" ||
    status === "waiting"
  ) {
    return "warning";
  }
  return "outline";
}

export function runStatusLabel(status: string): string {
  if (status === "awaiting_approval") return "awaiting approval";
  return status.replace(/_/g, " ");
}