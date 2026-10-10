import { NextResponse, type NextRequest } from "next/server";

import {
  API_BASE,
  chatSessionCookieName,
  descriptorVersionId,
  fetchDeploymentDescriptor,
  isUuid,
} from "@/lib/chat";
import type { ChatInvokeRequest, ChatInvokeResponse } from "@/lib/chat";

/**
 * Server-side bridge between the hosted chat surface and the backend.
 *
 * Primary path: the `aegis_chat_<deploymentId>` httpOnly cookie carries a
 * deployment-bound HMAC session minted by /api/chat/session; we forward it as
 * X-Aegis-Chat-Session to POST /v1/chat/invoke, which resolves the pinned
 * workflow+version server-side — no credential or target ids in client code.
 *
 * Fallback: ?key= links (power-user/self-hosted) keep the legacy header path —
 * the body carries a scoped invoke key plus optional ?w=/?v= target ids (or
 * the public deployment descriptor resolves them) and we attach the
 * X-Aegis-* headers the raw /v1/workflows/{id}/invoke credential requires.
 */
export async function POST(request: NextRequest) {
  let body: Partial<ChatInvokeRequest>;
  try {
    body = (await request.json()) as Partial<ChatInvokeRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const deploymentId = typeof body.deploymentId === "string" ? body.deploymentId.trim() : "";
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!isUuid(deploymentId)) {
    return NextResponse.json({ error: "Invalid deployment." }, { status: 400 });
  }
  if (!input || input.length > 20_000) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  if (sessionId.length > 128) {
    return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  }

  const sessionCookie = request.cookies.get(chatSessionCookieName(deploymentId))?.value;
  if (sessionCookie) {
    return invokeWithSession(request, sessionCookie, input, sessionId);
  }
  return invokeWithKey(request, body, deploymentId, input, sessionId);
}

/** Session-cookie path: backend /v1/chat/invoke binds the target from the token. */
async function invokeWithSession(
  request: NextRequest,
  sessionToken: string,
  input: string,
  sessionId: string
) {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${API_BASE}/v1/chat/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Aegis-Chat-Session": sessionToken,
      },
      body: JSON.stringify({
        input,
        session_id: sessionId || null,
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the workflow server." },
      { status: 502 }
    );
  }
  return relay(upstream);
}

/** Legacy ?key= path — self-hosted/power-user fallback when no session cookie exists. */
async function invokeWithKey(
  request: NextRequest,
  body: Partial<ChatInvokeRequest>,
  deploymentId: string,
  input: string,
  sessionId: string
) {
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Missing chat session." }, { status: 401 });
  }

  let workflowId = isUuid(body.workflowId) ? body.workflowId : null;
  let versionId = isUuid(body.versionId) ? body.versionId : null;
  if (!workflowId || !versionId) {
    const descriptor = await fetchDeploymentDescriptor(deploymentId, key);
    if (descriptor) {
      workflowId =
        workflowId ?? (isUuid(descriptor.workflow_id) ? descriptor.workflow_id : null);
      versionId = versionId ?? descriptorVersionId(descriptor);
    }
  }
  if (!workflowId || !versionId) {
    return NextResponse.json(
      {
        error:
          "This chat link cannot resolve its workflow. Ask the owner for the link from the Deploy sheet's Widget tab.",
      },
      { status: 502 }
    );
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(
      `${API_BASE}/v1/workflows/${encodeURIComponent(workflowId)}/invoke?wait=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aegis-Invoke-Key": key,
          "X-Aegis-Deployment-ID": deploymentId,
          "X-Aegis-Version-ID": versionId,
        },
        body: JSON.stringify({
          input,
          session_id: sessionId || null,
        }),
        cache: "no-store",
        signal: request.signal,
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach the workflow server." },
      { status: 502 }
    );
  }
  return relay(upstream);
}

async function relay(upstream: globalThis.Response) {
  const data = (await upstream.json().catch(() => null)) as
    | (Partial<ChatInvokeResponse> & { detail?: string })
    | null;

  if (!upstream.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : null;
    return NextResponse.json(
      { error: detail ?? "The workflow rejected the request." },
      { status: upstream.status }
    );
  }

  const response: ChatInvokeResponse = {
    run_id: typeof data?.run_id === "string" ? data.run_id : "",
    status: typeof data?.status === "string" ? data.status : "unknown",
    output: typeof data?.output === "string" ? data.output : null,
    ...(typeof data?.version === "number" ? { version: data.version } : {}),
  };
  return NextResponse.json(response);
}
