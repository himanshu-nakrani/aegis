"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError } from "@/lib/api";

const MAX_RETRIES = 2;

/**
 * Retry only failures that can succeed on a second attempt. A 4xx (bad id,
 * missing auth, validation) will fail identically every time, so retrying it
 * just keeps the user staring at a skeleton before the error state renders.
 * Network drops, 5xx and 408/429 still get up to MAX_RETRIES attempts.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof ApiRequestError) {
    const { status } = error;
    if (status === 408 || status === 429) return true;
    if (status >= 400 && status < 500) return false;
  }
  if (error instanceof DOMException && error.name === "AbortError") return false;
  return true;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: shouldRetryQuery,
          },
          mutations: {
            // Mutations are not idempotent (create run, deploy, delete) —
            // never replay them automatically.
            retry: false,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
