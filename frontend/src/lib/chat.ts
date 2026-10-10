/**
 * Shared types + server-side helpers for the hosted chat surface
 * (`/chat/[deploymentId]` → `/api/chat/invoke` → `/v1/workflows/{id}/invoke`).
 *
 * Deployment-scoped auth: callers hold a one-time invoke key; account API keys
 * do not apply here, so nothing in this file touches `authHeaders()`.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/** POST body accepted by `/api/chat/invoke`. */
export interface ChatInvokeRequest {
  deploymentId: string;
  input: string;
  sessionId: string;
  /** Legacy ?key= fallback — only sent when no session cookie was minted. */
  key?: string;
  /** Optional explicit deployment target for the ?key= fallback path. */
  workflowId?: string;
  versionId?: string;
}

/** Normalized response handed back to the chat panel. */
export interface ChatInvokeResponse {
  run_id: string;
  status: string;
  output: string | null;
  version?: number;
  error?: string;
}

/** POST body accepted by `/api/chat/session` (chat-token → cookie exchange). */
export interface ChatSessionRequest {
  deploymentId: string;
  token: string;
}

/** `aegis_chat_<deploymentId>` holds the HMAC session, never the chat token. */
export function chatSessionCookieName(deploymentId: string): string {
  return `aegis_chat_${deploymentId}`;
}

/**
 * Public deployment descriptor returned by
 * `GET /v1/deployments/{deployment_id}/descriptor` (invoke-key authenticated).
 * Not in `types/workflow.ts` — it is a deployment-scoped contract, not part of
 * the account-authenticated API surface.
 */
export interface ChatDeploymentDescriptor {
  workflow_id?: string;
  /** `version_id` per contract; tolerate `published_version_id` too. */
  version_id?: string;
  published_version_id?: string;
  workflow_name?: string;
  name?: string;
}

export function descriptorVersionId(
  descriptor: ChatDeploymentDescriptor
): string | null {
  return isUuid(descriptor.version_id)
    ? descriptor.version_id!
    : isUuid(descriptor.published_version_id)
      ? descriptor.published_version_id!
      : null;
}


/**
 * Server-side fetch of the public deployment descriptor. Returns null on any
 * failure — callers must not leak whether the deployment exists to visitors.
 */
export async function fetchDeploymentDescriptor(
  deploymentId: string,
  key: string
): Promise<ChatDeploymentDescriptor | null> {
  try {
    const res = await fetch(
      `${API_BASE}/v1/deployments/${encodeURIComponent(deploymentId)}/descriptor`,
      {
        headers: { "X-Aegis-Invoke-Key": key },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return null;
    return body as ChatDeploymentDescriptor;
  } catch {
    return null;
  }
}
