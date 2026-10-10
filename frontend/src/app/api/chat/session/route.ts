import { NextResponse, type NextRequest } from "next/server";

import { API_BASE, chatSessionCookieName, isUuid } from "@/lib/chat";
import type { ChatSessionRequest } from "@/lib/chat";

/**
 * One-time exchange: the deployment-scoped `aegis_chat_` token from the
 * shared URL → a short-lived, HMAC-signed session stored in an httpOnly
 * cookie. The chat token itself never reaches browser storage and is
 * never invoke-capable — after this route the URL token is dead weight.
 */
export async function POST(request: NextRequest) {
  let body: Partial<ChatSessionRequest>;
  try {
    body = (await request.json()) as Partial<ChatSessionRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const deploymentId = typeof body.deploymentId === "string" ? body.deploymentId.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!isUuid(deploymentId)) {
    return NextResponse.json({ error: "Invalid deployment." }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "Missing chat token." }, { status: 401 });
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${API_BASE}/v1/chat/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployment_id: deploymentId, token }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the workflow server." },
      { status: 502 }
    );
  }

  const data = (await upstream.json().catch(() => null)) as
    | { session_token?: string; expires_at?: string; detail?: string }
    | null;

  if (!upstream.ok || typeof data?.session_token !== "string") {
    return NextResponse.json(
      { error: typeof data?.detail === "string" ? data.detail : "This chat link is invalid." },
      { status: upstream.ok ? 502 : upstream.status }
    );
  }

  const expiresMs = data.expires_at ? Date.parse(data.expires_at) : NaN;
  const maxAge = Number.isFinite(expiresMs)
    ? Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
    : 12 * 3600;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(chatSessionCookieName(deploymentId), data.session_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/chat",
    maxAge,
  });
  return response;
}
