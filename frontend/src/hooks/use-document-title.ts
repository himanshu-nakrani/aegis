"use client";

import { useEffect } from "react";

const SUFFIX = " · Aegis";

/**
 * Refine the tab title with data only known on the client (a workflow or run
 * name). Route layouts still export a static `metadata.title`, which is what
 * shows before data loads and what crawlers see; this replaces it once the
 * entity resolves and restores the previous title on unmount so the next
 * route's metadata is not left with a stale name.
 *
 * Pass `null` while loading to leave the static title alone.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title}${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
