export interface PendingApprovalMetadata {
  approval_id: string;
  node_id?: string;
  review?: string;
  assignee?: string | null;
  escalation_timeout_seconds?: number | null;
  status?: string;
  parked_at?: string;
  escalated_at?: string | null;
  notification_errors?: Array<{ channel: string; event: string; error: string }>;
}

export function ApprovalMetadata({ approval }: { approval?: PendingApprovalMetadata }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-muted">
      <p>
        Status: <span className="text-foreground">{approval?.status || "parked"}</span>
        {" · "}Assignee: <span className="text-foreground">{approval?.assignee || "Unassigned"}</span>
      </p>
      <p>
        Escalation: {approval?.escalated_at
          ? "Reminder attempted; decision still required"
          : approval?.escalation_timeout_seconds
            ? `Notify after ${approval.escalation_timeout_seconds}s if still pending`
            : "Not configured"}
      </p>
      {!!approval?.notification_errors?.length && (
        <p className="text-status-warning">Some approval notifications failed. Approval is still required.</p>
      )}
      <p>Waits remain in this process; a restart cannot resume this approval.</p>
    </div>
  );
}
