"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import {
  Activity,
  History,
  Layers,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Spline,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import s from "./landing.module.css";

/* ------------------------------------------------------------------
   Product preview: a failed run paused on the canvas. Everything here is
   illustrative data, but it behaves like the workbench — drag nodes,
   inspect them, scrub the replay, flip guardrail policies, open panels.
------------------------------------------------------------------- */

/** Fired by the hero's incident line to open a node in the preview. */
export const FOCUS_EVENT = "aegis:focus-node";

type Tone = "ok" | "warn" | "fail" | "idle";
type NodeId = "trigger" | "schema" | "agent" | "search" | "guard" | "eval" | "router" | "end";
type Pt = { x: number; y: number };

type CanvasNode = {
  id: NodeId;
  w: number;
  label: string;
  kind: string;
  bar: string;
};

const NH = 42;
const CW = 940;
const CH = 330;

const NODES: CanvasNode[] = [
  { id: "trigger", w: 104, label: "Trigger", kind: "Flow · trigger", bar: "var(--cat-trigger)" },
  { id: "schema", w: 118, label: "Input Schema", kind: "Flow · schema", bar: "var(--cat-flow)" },
  { id: "agent", w: 152, label: "LLM Agent", kind: "LLM · agent", bar: "var(--active)" },
  { id: "search", w: 142, label: "Web Search", kind: "Tools · tool", bar: "var(--destructive)" },
  { id: "guard", w: 112, label: "Guardrail", kind: "Quality · guardrail", bar: "var(--success)" },
  { id: "eval", w: 132, label: "Evaluation", kind: "Quality · eval", bar: "var(--cat-quality)" },
  { id: "router", w: 124, label: "Router", kind: "Flow · router", bar: "var(--cat-logic)" },
  { id: "end", w: 116, label: "End", kind: "Flow · end", bar: "var(--cat-flow)" },
];
const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, CanvasNode>;

const HOME: Record<NodeId, Pt> = {
  trigger: { x: 36, y: 147 },
  schema: { x: 158, y: 147 },
  agent: { x: 296, y: 126 },
  search: { x: 301, y: 232 },
  guard: { x: 470, y: 147 },
  eval: { x: 604, y: 73 },
  router: { x: 604, y: 207 },
  end: { x: 782, y: 147 },
};

type Edge = { from: NodeId; to: NodeId; kind?: "live" | "fail" | "fallback" };
const EDGES: Edge[] = [
  { from: "trigger", to: "schema" },
  { from: "schema", to: "agent", kind: "live" },
  { from: "agent", to: "guard" },
  { from: "agent", to: "search", kind: "fail" },
  { from: "guard", to: "eval" },
  { from: "eval", to: "router" },
  { from: "search", to: "router", kind: "fallback" },
  { from: "router", to: "end" },
];

/** Bezier from a's nearest side to b's, so edges follow dragged nodes sensibly. */
function edgePath(a: Pt & { w: number }, b: Pt & { w: number }) {
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  const dx = bcx - acx;
  const dy = b.y + NH / 2 - (a.y + NH / 2);
  if (Math.abs(dy) > Math.abs(dx) * 1.1) {
    const down = dy > 0;
    const y1 = down ? a.y + NH : a.y;
    const y2 = down ? b.y : b.y + NH;
    const my = (y1 + y2) / 2;
    return `M ${acx} ${y1} C ${acx} ${my}, ${bcx} ${my}, ${bcx} ${y2}`;
  }
  const fwd = dx >= 0;
  const x1 = fwd ? a.x + a.w : a.x;
  const x2 = fwd ? b.x : b.x + b.w;
  const y1 = a.y + NH / 2;
  const y2 = b.y + NH / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

const STEPS = [
  { n: "00", label: "failure detected", tone: "fail" as Tone, t: "t+30.0s" },
  { n: "01", label: "attempt 1 · timeout", tone: "fail" as Tone, t: "t+30.0s" },
  { n: "02", label: "attempt 2 · retry", tone: "warn" as Tone, t: "t+36.1s" },
  { n: "03", label: "reroute decision", tone: "ok" as Tone, t: "t+41.8s" },
];

type Policies = { pii: boolean; injection: boolean };

/** Per-step node state: tone + subtitle, derived from the replay position. */
function nodeState(id: NodeId, step: number, p: Policies): { tone: Tone; sub: string } {
  const rerouted = step === 3;
  switch (id) {
    case "trigger":
      return { tone: "ok", sub: "manual · api" };
    case "schema":
      return { tone: "ok", sub: "zod · 4 fields" };
    case "agent":
      return { tone: rerouted ? "ok" : "warn", sub: rerouted ? "gemini-2.5-pro · done" : "gemini-2.5-pro · agent" };
    case "search":
      return step === 2
        ? { tone: "warn", sub: "tool · retry 2/3" }
        : { tone: "fail", sub: step === 1 ? "tool · attempt 1 · 30.0s" : "tool · ETIMEDOUT 30.0s" };
    case "guard": {
      const on = [p.pii && "pii", p.injection && "injection"].filter(Boolean).join(" · ");
      return { tone: "idle", sub: on || "no policies" };
    }
    case "eval":
      return { tone: "idle", sub: "judge · gate 0.80" };
    case "router":
      return { tone: rerouted ? "ok" : "idle", sub: rerouted ? "→ fallback branch" : "2 branches" };
    case "end":
      return { tone: rerouted ? "warn" : "idle", sub: rerouted ? "respond · degraded" : "respond" };
  }
}

const INFO: Record<NodeId, Array<[string, string]>> = {
  trigger: [["Mode", "manual · api"], ["Payload", "ticket #4821"], ["Latency", "2 ms"]],
  schema: [["Validator", "zod"], ["Fields", "subject, body, tier, locale"], ["Latency", "4 ms"]],
  agent: [["Model", "gemini-2.5-pro"], ["Tools", "web_search"], ["Tokens", "8,214"], ["Cost", "$0.027"]],
  search: [["Error", "ETIMEDOUT after 30.0s"], ["Retry policy", "3 attempts · backoff 2×"], ["Fallback", "Router → branch b"]],
  guard: [["Position", "pre-response"], ["Mode", "fail-closed"], ["State", "held — not reached"]],
  eval: [["Judge", "llm-judge · 3 dimensions"], ["Pass gate", "≥ 0.80"], ["State", "pending"]],
  router: [["Branches", "a: answer · b: fallback"], ["Rule", "on tool failure → b"]],
  end: [["Output", "respond"], ["Channel", "api response"]],
};

const LOG: Array<{ step: number; t: string; tone: Tone; text: string }> = [
  { step: 0, t: "00:00.0", tone: "ok", text: "trigger · payload accepted" },
  { step: 0, t: "00:00.0", tone: "ok", text: "input_schema · 4/4 fields valid" },
  { step: 0, t: "00:00.4", tone: "warn", text: "llm_agent · tool_call web_search(\"refund policy\")" },
  { step: 0, t: "00:30.4", tone: "fail", text: "web_search · ETIMEDOUT after 30.0s" },
  { step: 1, t: "00:30.4", tone: "fail", text: "retry · attempt 1 failed (timeout)" },
  { step: 2, t: "00:36.1", tone: "warn", text: "retry · attempt 2 · backoff 2×" },
  { step: 3, t: "00:41.8", tone: "ok", text: "router · reroute → fallback branch" },
];

const RUNS = [
  { id: "run_01J8XK4P", status: "FAILED", tone: "fail" as Tone, meta: "2/8 nodes · 00:41.8" },
  { id: "run_01J8XJ9M", status: "PASSED", tone: "ok" as Tone, meta: "8/8 nodes · eval 0.91" },
  { id: "run_01J8XH2C", status: "PASSED", tone: "ok" as Tone, meta: "8/8 nodes · eval 0.86" },
];

const VERSIONS = [
  { v: "v0.7.3", tag: "DRAFT", meta: "fallback branch on Router" },
  { v: "v0.7.2", tag: "LIVE", meta: "published · eval 0.88" },
  { v: "v0.7.1", tag: "", meta: "guardrail moved pre-response" },
];

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-active",
  fail: "bg-destructive",
  idle: "bg-subtle/60",
};
const TXT: Record<Tone, string> = {
  ok: "text-success",
  warn: "text-active",
  fail: "text-destructive",
  idle: "text-subtle",
};

type Panel = "canvas" | "runs" | "guardrails" | "versions" | "console";
const TOOLS: Array<{ id: Panel; icon: typeof Spline; label: string }> = [
  { id: "canvas", icon: Spline, label: "Canvas" },
  { id: "runs", icon: Activity, label: "Runs" },
  { id: "guardrails", icon: ShieldCheck, label: "Guardrails" },
  { id: "versions", icon: Layers, label: "Versions" },
  { id: "console", icon: Terminal, label: "Console" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Workbench() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState<Record<NodeId, Pt>>(HOME);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const [panel, setPanel] = useState<Panel>("canvas");
  const [policies, setPolicies] = useState<Policies>({ pii: true, injection: true });
  const [dragging, setDragging] = useState<NodeId | null>(null);
  const drag = useRef<{ id: NodeId; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  // autoplay through the replay
  useEffect(() => {
    if (!playing) return;
    if (step >= STEPS.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStep((v) => v + 1), 1100);
    return () => window.clearTimeout(id);
  }, [playing, step]);

  // hero incident line → open the failed node here
  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<NodeId>).detail;
      if (!id || !(id in HOME)) return;
      setPanel("canvas");
      setPlaying(false);
      setStep(0);
      setSelected(id);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, []);

  const replay = useCallback(() => {
    setPanel("canvas");
    setStep(0);
    setPlaying(true);
  }, []);
  const goStep = (i: number) => {
    setPlaying(false);
    setStep(i);
  };

  const rerouted = step === STEPS.length - 1;
  const moved = NODES.some((n) => pos[n.id].x !== HOME[n.id].x || pos[n.id].y !== HOME[n.id].y);
  const active = selected ?? hovered;

  /* ---------- drag ---------- */
  const onPointerDown = (id: NodeId) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: pos[id].x, oy: pos[id].y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(d.id);
    }
    const w = BY_ID[d.id].w;
    setPos((p) => ({ ...p, [d.id]: { x: clamp(d.ox + dx, 8, CW - w - 8), y: clamp(d.oy + dy, 8, CH - NH - 8) } }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (d && !d.moved) setSelected((cur) => (cur === d.id ? null : d.id));
  };
  const onNodeKey = (id: NodeId) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected((cur) => (cur === id ? null : id));
      return;
    }
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    };
    const m = delta[e.key];
    if (!m) return;
    e.preventDefault();
    const w = BY_ID[id].w;
    setPos((p) => ({ ...p, [id]: { x: clamp(p[id].x + m[0], 8, CW - w - 8), y: clamp(p[id].y + m[1], 8, CH - NH - 8) } }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setPanel("canvas");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const metrics = [
    {
      k: "Status",
      v: rerouted ? "• REROUTED" : "• FAILED",
      sub: "run_01J8XK4P",
      cls: rerouted ? "text-active" : "text-destructive",
    },
    { k: "Tokens", v: "8,214", sub: "this run" },
    { k: "Cost", v: "$0.027", sub: "this run" },
    { k: "P95", v: "1.82s", sub: "latency" },
    { k: "Eval", v: "—", sub: "gate pending" },
    { k: "Nodes", v: rerouted ? "4/8" : "2/8", sub: rerouted ? "rerouted 00:41.8" : `paused 00:${STEPS[step].t.slice(2, 6)}` },
  ];

  const sel = selected ? BY_ID[selected] : null;
  const selState = selected ? nodeState(selected, step, policies) : null;

  return (
    <figure
      ref={rootRef}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sheen"
      aria-label="Interactive Aegis workbench preview: the Support triage workflow paused on a failed Web Search call"
    >
      {/* chrome */}
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
        </span>
        <div className="flex items-center gap-2">
          {moved && (
            <button
              type="button"
              onClick={() => setPos(HOME)}
              className="hidden h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-subtle transition-colors duration-1 hover:bg-surface-hover hover:text-foreground sm:inline-flex"
            >
              <LocateFixed className="h-3 w-3" aria-hidden />
              reset layout
            </button>
          )}
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-[11px] text-subtle">
            <History className={cn("h-3 w-3", playing && "animate-spin [animation-direction:reverse]")} aria-hidden />
            replay mode
          </span>
          <button
            type="button"
            onClick={replay}
            className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-opacity duration-1 hover:opacity-90"
          >
            Run
          </button>
        </div>
      </div>

      <div className="flex">
        {/* tool rail */}
        <div role="toolbar" aria-label="Workbench panels" className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r border-border py-3">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={panel === id}
              onClick={() => setPanel((cur) => (cur === id && id !== "canvas" ? "canvas" : id))}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md transition-colors duration-1",
                panel === id ? "bg-surface-hover text-foreground" : "text-subtle hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>

        {/* canvas */}
        <div className="relative min-w-0 flex-1">
          <div className="overflow-x-auto" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
            <div
              className="relative"
              style={{ width: CW, height: CH }}
              onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            >
              <div className={cn("pointer-events-none absolute inset-0", s.dots)} aria-hidden />
              <svg width={CW} height={CH} className="pointer-events-none absolute inset-0" aria-hidden>
                {EDGES.map((e) => {
                  const a = { ...pos[e.from], w: BY_ID[e.from].w };
                  const b = { ...pos[e.to], w: BY_ID[e.to].w };
                  const touches = active && (e.from === active || e.to === active);
                  const dim = active && !touches;
                  const fallbackOn = e.kind === "fallback" && rerouted;
                  const stroke =
                    e.kind === "live"
                      ? "var(--active)"
                      : e.kind === "fail"
                        ? "var(--destructive)"
                        : fallbackOn
                          ? "var(--success)"
                          : touches
                            ? "var(--fg-muted)"
                            : "var(--canvas-edge)";
                  return (
                    <path
                      key={`${e.from}-${e.to}`}
                      d={edgePath(a, b)}
                      stroke={stroke}
                      strokeWidth={touches || fallbackOn || e.kind === "live" ? 1.6 : 1.2}
                      strokeDasharray={
                        e.kind === "live" ? "4 4" : e.kind === "fail" ? "2 3" : e.kind === "fallback" ? "1.5 3.5" : undefined
                      }
                      strokeOpacity={dim ? 0.25 : e.kind === "fallback" && !rerouted ? 0.7 : 1}
                      fill="none"
                      className={cn("transition-[stroke,stroke-opacity] duration-2", (e.kind === "live" || fallbackOn) && s.edge)}
                    />
                  );
                })}
              </svg>

              {NODES.map((n) => {
                const st = nodeState(n.id, step, policies);
                const p = pos[n.id];
                const isSel = selected === n.id;
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={`${n.label}: ${st.sub}. Enter to inspect, arrow keys to move.`}
                    onPointerDown={onPointerDown(n.id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onPointerEnter={() => setHovered(n.id)}
                    onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                    onKeyDown={onNodeKey(n.id)}
                    className={cn(
                      "absolute flex touch-none select-none flex-col justify-center rounded-md border bg-surface-elevated pl-3 pr-2.5 outline-none transition-[border-color,box-shadow,opacity] duration-1 focus-visible:ring-2 focus-visible:ring-ring",
                      dragging === n.id ? "z-20 cursor-grabbing shadow-lg" : "cursor-grab",
                      st.tone === "fail"
                        ? "border-destructive/80 outline outline-1 outline-offset-[3px] outline-destructive/50"
                        : st.tone === "warn"
                          ? "border-active/60"
                          : st.tone === "ok" && (n.id === "router" || n.id === "agent")
                            ? "border-success/60"
                            : "border-border-strong hover:border-fg-subtle",
                      isSel && "z-10 ring-2 ring-foreground/70 ring-offset-2 ring-offset-surface",
                      st.tone === "fail" && step < 3 && s.failPulse,
                      active && !isSel && active !== n.id &&
                        !EDGES.some((e) => (e.from === active && e.to === n.id) || (e.to === active && e.from === n.id)) &&
                        "opacity-50"
                    )}
                    style={{ left: p.x, top: p.y, width: n.w, height: NH }}
                  >
                    <span className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full" style={{ background: n.bar }} aria-hidden />
                    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold leading-none text-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full transition-colors duration-2", DOT[st.tone])} aria-hidden />
                      {n.label}
                    </span>
                    <span className={cn("mt-1.5 truncate font-mono text-[9.5px] leading-none", st.tone === "fail" ? "text-destructive" : "text-subtle")}>
                      {st.sub}
                    </span>
                  </div>
                );
              })}

              {!rerouted && (
                <button
                  type="button"
                  onClick={replay}
                  className="absolute inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-destructive/50 bg-surface px-2 font-mono text-[10px] text-destructive transition-colors duration-1 hover:bg-destructive/10"
                  style={{ left: pos.agent.x + 9, top: pos.agent.y + 70 }}
                >
                  <Zap className="h-3 w-3" aria-hidden />
                  click to replay triage
                </button>
              )}

              <span
                className="absolute inline-flex h-7 items-center gap-2 rounded-md border border-border bg-surface px-2.5 font-mono text-[10.5px]"
                style={{ left: 36, top: 286 }}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", rerouted ? "bg-active" : "bg-destructive")} aria-hidden />
                <span className={rerouted ? "text-active" : "text-destructive"}>{rerouted ? "REROUTED" : "FAILED"}</span>
                <span className="text-subtle">run_01J8XK4P</span>
              </span>

              <button
                type="button"
                onClick={() => setPanel("versions")}
                className="absolute inline-flex h-8 items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-[12px] transition-colors duration-1 hover:border-border-strong"
                style={{ left: 694, top: 282 }}
              >
                <Spline className="h-3.5 w-3.5 text-subtle" aria-hidden />
                <span className="font-medium text-foreground">Support triage</span>
                <span className="rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-subtle">v0.7.3 · DRAFT</span>
              </button>
            </div>
          </div>

          {/* hint */}
          {!moved && !selected && panel === "canvas" && (
            <p className="pointer-events-none absolute right-3 top-3 hidden font-mono text-[10px] text-subtle/80 md:block">
              drag nodes · click to inspect
            </p>
          )}

          {/* node inspector */}
          {sel && selState && panel === "canvas" && (
            <aside
              className={cn("absolute bottom-3 right-3 top-3 z-30 flex w-[248px] flex-col rounded-lg border border-border-strong bg-surface-overlay p-4 shadow-lg", s.slideIn)}
              aria-label={`${sel.label} inspector`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{sel.kind}</p>
                  <p className="mt-1 text-[14px] font-semibold text-foreground">{sel.label}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close inspector"
                  className="grid h-6 w-6 place-items-center rounded-md text-subtle hover:bg-surface-hover hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className={cn("mt-3 flex items-center gap-1.5 font-mono text-[11px]", TXT[selState.tone])}>
                <span className={cn("h-1.5 w-1.5 rounded-full", DOT[selState.tone])} aria-hidden />
                {selState.sub}
              </p>
              <dl className="mt-4 space-y-2.5 border-t border-border pt-3 font-mono text-[10.5px]">
                {INFO[sel.id].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-2">
                    <dt className="text-subtle">{k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {sel.id === "search" && (
                  <button
                    type="button"
                    onClick={replay}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Zap className="h-3 w-3" aria-hidden /> Replay triage
                  </button>
                )}
                {sel.id === "guard" && (
                  <button
                    type="button"
                    onClick={() => setPanel("guardrails")}
                    className="inline-flex h-7 items-center rounded-md border border-border-strong px-2.5 text-[11.5px] hover:bg-surface-hover"
                  >
                    Edit policies
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanel("console")}
                  className="inline-flex h-7 items-center rounded-md border border-border-strong px-2.5 text-[11.5px] hover:bg-surface-hover"
                >
                  View logs
                </button>
              </div>
            </aside>
          )}

          {/* side panels from the rail */}
          {panel !== "canvas" && (
            <aside
              className={cn("absolute bottom-3 left-3 top-3 z-30 flex w-[min(320px,calc(100%-24px))] flex-col rounded-lg border border-border-strong bg-surface-overlay shadow-lg", s.slideInLeft)}
              aria-label={`${panel} panel`}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{TOOLS.find((t) => t.id === panel)?.label}</p>
                <button
                  type="button"
                  onClick={() => setPanel("canvas")}
                  aria-label="Close panel"
                  className="grid h-6 w-6 place-items-center rounded-md text-subtle hover:bg-surface-hover hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {panel === "runs" && (
                  <ul className="space-y-1.5">
                    {RUNS.map((r, i) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (i === 0) {
                              setPanel("canvas");
                              goStep(0);
                              setSelected("search");
                            }
                          }}
                          className={cn(
                            "w-full rounded-md border px-3 py-2 text-left font-mono text-[11px] transition-colors duration-1",
                            i === 0 ? "border-destructive/40 hover:bg-destructive/10" : "cursor-default border-border"
                          )}
                        >
                          <span className="flex items-center justify-between">
                            <span className="text-foreground">{r.id}</span>
                            <span className={TXT[r.tone]}>{r.status}</span>
                          </span>
                          <span className="mt-1 block text-subtle">{r.meta}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {panel === "guardrails" && (
                  <ul className="space-y-1.5">
                    {(
                      [
                        ["pii", "PII redaction", "Presidio · fail-closed"],
                        ["injection", "Prompt injection", "classifier · block ≥ 0.7"],
                      ] as Array<[keyof Policies, string, string]>
                    ).map(([key, name, meta]) => (
                      <li key={key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <span>
                          <span className="block text-[12px] font-medium text-foreground">{name}</span>
                          <span className="mt-0.5 block font-mono text-[10.5px] text-subtle">{meta}</span>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={policies[key]}
                          aria-label={`${name} policy`}
                          onClick={() => setPolicies((p) => ({ ...p, [key]: !p[key] }))}
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-1",
                            policies[key] ? "border-success/60 bg-success/30" : "border-border-strong bg-surface-input"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-[2px] h-3.5 w-3.5 rounded-full bg-foreground transition-transform duration-1",
                              policies[key] ? "translate-x-[18px]" : "translate-x-[2px]"
                            )}
                          />
                        </button>
                      </li>
                    ))}
                    <li className="px-1 pt-1 font-mono text-[10.5px] text-subtle">Toggles update the Guardrail node on the canvas.</li>
                  </ul>
                )}
                {panel === "versions" && (
                  <ul className="space-y-1.5">
                    {VERSIONS.map((v) => (
                      <li key={v.v} className="rounded-md border border-border px-3 py-2 font-mono text-[11px]">
                        <span className="flex items-center justify-between">
                          <span className="text-foreground">{v.v}</span>
                          {v.tag && (
                            <span className={cn("rounded-[4px] border px-1.5 text-[9.5px]", v.tag === "LIVE" ? "border-success/50 text-success" : "border-border text-subtle")}>
                              {v.tag}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-subtle">{v.meta}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {panel === "console" && (
                  <ol className="space-y-1 font-mono text-[10.5px] leading-[1.6]" aria-live="polite">
                    {LOG.filter((l) => l.step <= step).map((l, i) => (
                      <li key={i} className="grid grid-cols-[3.4rem_1fr] gap-2">
                        <span className="tabular-nums text-subtle">{l.t}</span>
                        <span className={l.tone === "ok" ? "text-muted" : TXT[l.tone]}>{l.text}</span>
                      </li>
                    ))}
                    {playing && <li className={cn("text-subtle", s.caret)}>streaming</li>}
                  </ol>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* replay scrubber */}
      <div className="flex items-center gap-3 overflow-x-auto border-t border-border px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => (playing ? setPlaying(false) : step >= STEPS.length - 1 ? replay() : setPlaying(true))}
          aria-label={playing ? "Pause replay" : "Play replay"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity duration-1 hover:opacity-90"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => goStep(0)}
          aria-label="Reset replay"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-subtle transition-colors duration-1 hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <ol className="relative flex min-w-[640px] flex-1 items-center justify-between gap-3" aria-label="Replay timeline">
          <span className="absolute left-0 right-0 top-1/2 h-px bg-border" aria-hidden />
          <span
            className="absolute left-0 top-1/2 h-px bg-foreground/60 transition-[width] duration-3"
            style={{ width: `${(step / (STEPS.length - 1)) * 88}%` }}
            aria-hidden
          />
          {STEPS.map((st, i) => (
            <li key={st.n} className="relative">
              <button
                type="button"
                onClick={() => goStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-md border bg-surface px-2.5 font-mono text-[10.5px] transition-colors duration-1",
                  i === step
                    ? st.tone === "fail"
                      ? "border-destructive/70 text-destructive"
                      : st.tone === "warn"
                        ? "border-active/70 text-active"
                        : "border-success/70 text-success"
                    : "border-border text-subtle hover:text-foreground",
                  i > step && "opacity-60"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", DOT[st.tone])} aria-hidden />
                {st.n} {st.label}
              </button>
            </li>
          ))}
          <li className="relative bg-surface pl-1 font-mono text-[10.5px] tabular-nums text-subtle">{STEPS[step].t}</li>
        </ol>
      </div>

      {/* run metrics */}
      <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.k} className="border-b border-r border-border px-5 py-4 lg:border-b-0 sm:px-6">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{m.k}</dt>
            <dd className={cn("mt-2 font-mono text-[20px] leading-none tabular-nums text-foreground transition-colors duration-2", m.cls)}>{m.v}</dd>
            <dd className="mt-1.5 font-mono text-[10.5px] text-subtle">{m.sub}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
