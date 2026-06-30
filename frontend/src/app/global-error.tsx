"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#09090b] font-sans text-[#fafafa] antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
            <svg
              className="h-7 w-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold">Application error</h1>
            <p className="mt-2 max-w-md text-sm text-zinc-400">
              Something went wrong loading this page. Try refreshing. If it keeps failing, open the
              browser console and report the error.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}