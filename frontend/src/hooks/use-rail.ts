"use client";

import { useCallback, useEffect, useState } from "react";

export type RailState = "collapsed" | "expanded";

const STORAGE_KEY = "aegis-rail";

export function getRail(): RailState {
  if (typeof window === "undefined") return "collapsed";
  try {
    return localStorage.getItem(STORAGE_KEY) === "expanded" ? "expanded" : "collapsed";
  } catch {
    return "collapsed";
  }
}

function applyRail(state: RailState) {
  if (state === "expanded") document.documentElement.dataset.rail = "expanded";
  else delete document.documentElement.dataset.rail;
}

/**
 * Persisted navigation-rail expansion. The bootstrap script in layout.tsx applies
 * the stored value pre-hydration (no width flash); this hook keeps React state
 * and the `data-rail` attribute in sync when the user toggles it.
 */
export function useRail() {
  const [rail, setRailState] = useState<RailState>("collapsed");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const r = getRail();
    setRailState(r);
    applyRail(r);
    setMounted(true);
  }, []);

  const setRail = useCallback((next: RailState) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / quota — still apply for this session
    }
    applyRail(next);
    setRailState(next);
  }, []);

  const toggleRail = useCallback(
    () => setRail(rail === "expanded" ? "collapsed" : "expanded"),
    [rail, setRail]
  );

  return { rail, mounted, setRail, toggleRail };
}
