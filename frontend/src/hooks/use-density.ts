"use client";

import { useCallback, useEffect, useState } from "react";

export type Density = "comfortable" | "compact";

const STORAGE_KEY = "aegis-density";

export function getDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    return localStorage.getItem(STORAGE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function applyDensity(d: Density) {
  if (d === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
}

/**
 * Persisted interface density. The bootstrap script in layout.tsx applies the
 * stored value pre-hydration; this hook keeps React state and the attribute in
 * sync when the user toggles it.
 */
export function useDensity() {
  const [density, setDensityState] = useState<Density>("comfortable");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const d = getDensity();
    setDensityState(d);
    applyDensity(d);
    setMounted(true);
  }, []);

  const setDensity = useCallback((d: Density) => {
    try {
      localStorage.setItem(STORAGE_KEY, d);
    } catch {
      // private mode / quota — still apply for this session
    }
    applyDensity(d);
    setDensityState(d);
  }, []);

  return { density, mounted, setDensity };
}
