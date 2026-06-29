"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";

type ObservabilityListener = (event: Record<string, unknown>) => void;

type ObservabilityStreamContextValue = {
  connected: boolean;
  subscribe: (listener: ObservabilityListener) => () => void;
};

const ObservabilityStreamContext = createContext<ObservabilityStreamContextValue | null>(
  null
);

const TERMINAL_EVENTS = new Set(["run_completed", "run_failed", "run_cancelled"]);

export function ObservabilityStreamProvider({ children }: { children: React.ReactNode }) {
  const listeners = useRef(new Set<ObservabilityListener>());
  const [connected, setConnected] = useState(false);
  const reconnectAttempts = useRef(0);

  const subscribe = useCallback((listener: ObservabilityListener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      source = api.streamObservability(
        (event) => {
          reconnectAttempts.current = 0;
          setConnected(true);
          listeners.current.forEach((listener) => listener(event));
        },
        () => {
          setConnected(false);
          if (closed) return;
          reconnectAttempts.current += 1;
          if (reconnectAttempts.current <= 5) {
            reconnectTimer = setTimeout(connect, Math.min(1000 * reconnectAttempts.current, 5000));
          }
        }
      );
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      setConnected(false);
    };
  }, []);

  return (
    <ObservabilityStreamContext.Provider value={{ connected, subscribe }}>
      {children}
    </ObservabilityStreamContext.Provider>
  );
}

export function useObservabilityStream() {
  const ctx = useContext(ObservabilityStreamContext);
  if (!ctx) {
    throw new Error("useObservabilityStream must be used within ObservabilityStreamProvider");
  }
  return ctx;
}

export function isTerminalObservabilityEvent(type: unknown): boolean {
  return typeof type === "string" && TERMINAL_EVENTS.has(type);
}