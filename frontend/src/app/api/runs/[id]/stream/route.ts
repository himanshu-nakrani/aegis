import type { NextRequest } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = request.headers.get("X-Aegis-API-Key");
  const headers: HeadersInit = {};
  if (apiKey) {
    headers["X-Aegis-API-Key"] = apiKey;
  }
  // Forward SSE resume hints: the fetch consumer passes ?after_seq= (it cannot
  // set Last-Event-ID); native EventSource callers may send the header instead.
  const lastEventId = request.headers.get("Last-Event-ID");
  if (lastEventId) {
    headers["Last-Event-ID"] = lastEventId;
  }
  const afterSeq = request.nextUrl.searchParams.get("after_seq");
  const upstreamUrl = `${API_BASE}/api/runs/${encodeURIComponent(params.id)}/stream${afterSeq ? `?after_seq=${encodeURIComponent(afterSeq)}` : ""}`;

  const upstream = await fetch(upstreamUrl, {
    headers,
    cache: "no-store",
    // Abort upstream when the browser disconnects so the broker unsubscribes.
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}