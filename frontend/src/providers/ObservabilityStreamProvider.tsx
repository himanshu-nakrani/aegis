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
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const disconnect = useCallback(() => {
    closedRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (closedRef.current || sourceRef.current) return;
    closedRef.current = false;
    sourceRef.current = api.streamObservability(
      (event) => {
        reconnectAttempts.current = 0;
        setConnected(true);
        listeners.current.forEach((listener) => listener(event));
      },
      () => {
        setConnected(false);
        sourceRef.current?.close();
        sourceRef.current = null;
        if (closedRef.current) return;
        reconnectAttempts.current += 1;
        if (reconnectAttempts.current <= 5) {
          reconnectTimerRef.current = setTimeout(
            connect,
            Math.min(1000 * reconnectAttempts.current, 5000)
          );
        }
      }
    );
  }, []);

  const subscribe = useCallback(
    (listener: ObservabilityListener) => {
      listeners.current.add(listener);
      if (listeners.current.size === 1) {
        closedRef.current = false;
        connect();
      }
      return () => {
        listeners.current.delete(listener);
        if (listeners.current.size === 0) {
          disconnect();
        }
      };
    },
    [connect, disconnect]
  );

  useEffect(() => () => disconnect(), [disconnect]);

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