import { NextResponse, type NextRequest } from "next/server";

import { API_BASE, chatSessionCookieName, isUuid } from "@/lib/chat";
import type { ChatSessionRequest, ChatSessionResponse } from "@/lib/chat";

/**
 * One-time exchange: the deployment-scoped `aegis_chat_` token from the
 * shared URL → a short-lived, HMAC-signed session stored in an httpOnly
 * cookie. The chat token itself never reaches browser storage and is
 * never invoke-capable — after this route the URL token is dead weight.
 *
 * Cross-site embeds (iframes on another origin) exclude `SameSite=Lax`
 * cookies, so the cookie is `SameSite=None; Secure` on HTTPS and the minted
 * session token is ALSO returned in the JSON body. The chat panel keeps that
 * token in memory and sends it back as an `Authorization: Bearer` (or body)
 * fallback when the cookie is blocked — `/api/chat/invoke` accepts either.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  // Cookie-first invokes auto-attach the session cookie, so cross-site
  // sub-requests would ride it (CSRF). Browsers send Origin on fetch POSTs
  // and Referer on form posts; same-origin navigations and direct calls
  // carry no Origin or a matching host and keep working.
  const host = (request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  for (const value of [request.headers.get("origin"), request.headers.get("referer")]) {
    if (!value) continue;
    try {
      if (new URL(value, `https://${host}`).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
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

  // SameSite=None requires Secure or browsers reject the cookie: use it on
  // HTTPS (direct or via x-forwarded-proto) so cross-site iframes keep the
  // cookie, and fall back to Lax on plain HTTP (local dev). Either way the
  // body token below covers blocked-third-party-cookie embeds.
  // M19: only honor x-forwarded-proto when we're behind a proxy that sets it
  // (opt-in via AEGIS_TRUST_X_FORWARDED_PROTO); a client-controlled header
  // must not be able to flip a secure-cookie decision on its own.
  const trustForwardedProto = process.env.AEGIS_TRUST_X_FORWARDED_PROTO === "1";
  const forwardedProto = trustForwardedProto
    ? request.headers.get("x-forwarded-proto")
    : null;
  let secure: boolean;
  try {
    secure = forwardedProto
      ? forwardedProto.split(",")[0].trim().toLowerCase() === "https"
      : new URL(request.url).protocol === "https:";
  } catch {
    secure = process.env.NODE_ENV === "production";
  }
  const response = NextResponse.json({
    ok: true,
    sessionToken: data.session_token,
    ...(data.expires_at ? { expiresAt: data.expires_at } : {}),
  } satisfies ChatSessionResponse);
  response.cookies.set(chatSessionCookieName(deploymentId), data.session_token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/api/chat",
    maxAge,
  });
  return response;
}
