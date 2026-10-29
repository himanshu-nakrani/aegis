"use client";

import * as React from "react";
import { RotateCcw, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/use-document-title";
import type { ChatInvokeRequest, ChatInvokeResponse } from "@/lib/chat";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "notice"; text: string; retryText?: string };

interface ChatPanelProps {
  deploymentId: string;
  /** Scoped chat token from ?token= — exchanged once on mount for an httpOnly
   *  session cookie; the panel never sees a raw invoke key on this path. */
  chatToken?: string;
  /** Set when the session already exists (httpOnly cookie or a sessionStorage
   *  fallback token) and the URL credential was stripped — skips exchange. */
  sessionRestored?: boolean;
  /** Legacy ?key= fallback: a deployment-scoped invoke key passed to the proxy. */
  invokeKey?: string;
  /** Resolved upstream target for the ?key= path; when absent the invoke proxy
   *  asks the backend's public deployment descriptor. */
  workflowId?: string;
  versionId?: string;
  workflowName?: string;
}

/**
 * Hosted chat surface for a published deployment. Two credential shapes:
 * ?token= → one-time exchange for an httpOnly session cookie (invokes go
 * through /v1/chat/invoke with the token-bound target); ?key= → the scoped
 * invoke key rides in the page URL and each proxied invoke carries it.
 * session_id is a random UUID kept in sessionStorage so a reload resumes the
 * same conversation while a new tab gets a fresh one.
 */
export function ChatPanel({
  deploymentId,
  chatToken,
  sessionRestored,
  invokeKey,
  workflowId,
  versionId,
  workflowName,
}: ChatPanelProps) {
  const sessionStorageKey = `aegis-chat-session:${deploymentId}`;
  const sessionTokenStorageKey = `aegis-chat-token:${deploymentId}`;
  useDocumentTitle(workflowName ? `Chat · ${workflowName}` : "Aegis Chat");

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  // Cross-site fallback: when third-party cookies are blocked (embedded
  // iframe), the session cookie never arrives — the session endpoint also
  // returns the token in its JSON body, which we keep in memory and send back
  // as `sessionToken` on invoke (cookie stays the primary path).
  const sessionTokenRef = React.useRef<string | null>(null);
  // One-way exchange of the URL chat token for the httpOnly session cookie.
  // "pending" gates sends until the cookie exists; "failed" marks a dead link.
  const [linkState, setLinkState] = React.useState<"ready" | "pending" | "failed">(
    chatToken ? "pending" : "ready"
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Restore (or mint) the session id after mount — sessionStorage is
  // client-only and reading it during render would desync hydration.
  React.useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(sessionStorageKey);
      if (stored) {
        setSessionId(stored);
        return;
      }
      const fresh = crypto.randomUUID();
      window.sessionStorage.setItem(sessionStorageKey, fresh);
      setSessionId(fresh);
    } catch {
      // sessionStorage unavailable (private mode, denied storage) — fall back
      // to a per-load id; the conversation simply won't survive a reload.
      setSessionId(crypto.randomUUID());
    }
  }, [sessionStorageKey]);

  // Exchange the ?token= chat token for the httpOnly session cookie once, on
  // mount, then strip it from the address bar so it never lingers in history,
  // bookmarks, or Referer headers. The token is one-way, TTL'd, and
  // chat-scoped — but replayable for its lifetime, so hygiene matters.
  const stripUrlToken = React.useCallback(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("token") || url.searchParams.has("key")) {
        url.searchParams.delete("token");
        url.searchParams.delete("key");
        url.searchParams.set("restored", "1");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // Non-browser render or malformed URL: nothing to strip.
    }
  }, []);
  // Restored-session mount (URL carries ?restored=1 or the cookie exists):
  // rehydrate the bearer fallback so invokes work inside cookie-blocked
  // cross-site iframes where the cookie itself never reaches the server.
  React.useEffect(() => {
    if (!sessionRestored || sessionTokenRef.current) return;
    try {
      const stored = window.sessionStorage.getItem(sessionTokenStorageKey);
      if (stored) sessionTokenRef.current = stored;
    } catch {
      // sessionStorage unavailable — the httpOnly cookie path still applies.
    }
  }, [sessionRestored, sessionTokenStorageKey]);

  React.useEffect(() => {
    if (!chatToken) return;
    let cancelled = false;
    fetch("/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId, token: chatToken }),
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { sessionToken?: unknown } | null;
          if (data && typeof data.sessionToken === "string" && data.sessionToken) {
            sessionTokenRef.current = data.sessionToken;
            // Persist the bearer fallback too: on a reload inside a
            // cookie-blocked cross-site iframe nothing else reaches the
            // server, so sessionStorage (tab-scoped, same sensitivity class
            // as the TTL'd cookie) is what lets the session survive.
            try {
              window.sessionStorage.setItem(sessionTokenStorageKey, data.sessionToken);
            } catch { /* storage denied — the in-memory ref still covers this tab */ }
          }
          setLinkState("ready");
          stripUrlToken();
        } else {
          setLinkState("failed");
          push({
            id: crypto.randomUUID(),
            role: "notice",
            text: "This chat link is expired or invalid. Ask the workflow owner for a new one.",
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLinkState("failed");
        push({
          id: crypto.randomUUID(),
          role: "notice",
          text: "Could not reach the server to activate this chat link.",
        });
      });
    return () => {
      cancelled = true;
    };
  // The exchange is one-time per mount; push/setLinkState are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatToken, deploymentId]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Grow the composer with content up to ~6 lines, and reset after send.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function push(message: ChatMessage) {
    setMessages((prev) => [...prev, message]);
  }

  function newConversation() {
    const fresh = crypto.randomUUID();
    try {
      window.sessionStorage.setItem(sessionStorageKey, fresh);
    } catch {}
    setSessionId(fresh);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || sending || !sessionId || linkState !== "ready") return;
    // M19: pre-check against the server cap (20k chars) so a huge message
    // fails fast with a notice instead of a surprise 400.
    if (text.length > 20_000) {
      push({
        id: crypto.randomUUID(),
        role: "notice",
        text: `Message is too long (${text.length.toLocaleString()} chars). Limit is 20,000.`,
      });
      return;
    }
    if (!override) setInput("");
    push({ id: crypto.randomUUID(), role: "user", text });
    setSending(true);
    try {
      const body: ChatInvokeRequest = {
        deploymentId,
        input: text,
        sessionId,
        // The key only travels when this is the legacy ?key= link — on the
        // ?token= path the session cookie authenticates instead, with the
        // in-memory sessionToken as the cross-site fallback.
        ...(invokeKey ? { key: invokeKey } : {}),
        ...(sessionTokenRef.current ? { sessionToken: sessionTokenRef.current } : {}),
        ...(workflowId ? { workflowId } : {}),
        ...(versionId ? { versionId } : {}),
      };
      // M19: abort on timeout + one retry for transient network drops; a hung
      // invoke must not pin the composer forever.
      const doFetch = async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
          return await fetch("/api/chat/invoke", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      };
      let res: Response;
      try {
        res = await doFetch();
      } catch (error) {
        // A timeout abort means the first POST may already be executing.
        // Retrying would start a second run. Only retry a failure that
        // never produced a response (network drop before headers).
        const aborted =
          (error instanceof DOMException || error instanceof Error) &&
          error.name === "AbortError";
        if (aborted) throw error;
        res = await doFetch();
      }
      const data = (await res.json().catch(() => null)) as ChatInvokeResponse | null;
      const notice = (message: string, retryText?: string) =>
        push({ id: crypto.randomUUID(), role: "notice", text: message, retryText });
      if (!res.ok || !data) {
        notice(data?.error || `Request failed (${res.status}).`, text);
      } else if (data.status === "completed") {
        push({
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.output?.trim() ? data.output : "(The workflow completed without output.)",
        });
      } else {
        notice(
          data.status === "running"
            ? "The workflow is still running — this deployment takes longer than the hosted wait window. Try again in a moment."
            : `Run ${data.status}${data.error ? `: ${data.error}` : "."}`,
          data.status === "running" ? undefined : text
        );
      }
    } catch {
      push({
        id: crypto.randomUUID(),
        role: "notice",
        text: "Could not reach the server. Check your connection and try again.",
        retryText: text,
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 shadow-hairline-b">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {workflowName ?? "Aegis Chat"}
          </h1>
          <p className="truncate text-2xs text-muted">
            Powered by an Aegis workflow
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={newConversation}
          disabled={sending}
          title="Start a new conversation"
        >
          <RotateCcw aria-hidden="true" />
          New conversation
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sending ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-xs text-center text-xs leading-5 text-muted">
              Send a message to start the conversation.
            </p>
          </div>
        ) : (
          <ul role="log" aria-live="polite" className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((message) =>
              message.role === "notice" ? (
                <li key={message.id} className="flex flex-col items-center gap-1.5 self-center">
                  <p className="rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1 text-2xs text-destructive">
                    {message.text}
                  </p>
                  {message.retryText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-2xs"
                      onClick={() => void send(message.retryText)}
                    >
                      Try again
                    </Button>
                  )}
                </li>
              ) : (
                <li
                  key={message.id}
                  className={cn(
                    "flex animate-fade-in",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-6",
                      message.role === "user"
                        ? "rounded-br-sm border border-border-mid bg-surface-overlay text-foreground"
                        : "surface-card rounded-bl-sm border border-border bg-surface-elevated text-foreground"
                    )}
                  >
                    {message.text}
                  </div>
                </li>
              )
            )}
            {sending && (
              <li className="flex justify-start" aria-live="polite">
                <div className="flex items-center gap-1.5 rounded-xl rounded-bl-sm border border-border bg-surface-elevated px-3.5 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
                      style={{ animationDelay: `${i * 160}ms` }}
                    />
                  ))}
                  <span className="sr-only">The workflow is thinking…</span>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={
              linkState === "failed"
                ? "This chat link is no longer valid"
                : linkState === "pending"
                  ? "Activating chat link…"
                  : "Type a message…"
            }
            disabled={linkState === "failed"}
            aria-label="Message"
            className="max-h-40 min-h-[42px] flex-1 resize-none overflow-y-auto"
          />
          <Button
            size="icon"
            onClick={() => void send()}
            disabled={sending || !input.trim() || !sessionId || linkState !== "ready"}
            aria-label="Send message"
            className="h-[42px] w-[42px] shrink-0"
          >
            <SendHorizontal aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
