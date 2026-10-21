"use client";

import { useEffect, useState } from "react";
import { Activity, Layers, Play, Pause, RotateCcw, ShieldCheck, Spline, Terminal, History, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import s from "./landing.module.css";

/* ------------------------------------------------------------------
   Product preview: a failed run paused on the canvas, with a replay
   scrubber. Illustrative data — mirrors what the run inspector shows.
------------------------------------------------------------------- */

type Tone = "ok" | "warn" | "fail" | "idle";

type CanvasNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  sub: string;
  tone: Tone;
  bar: string;
};

const NH = 42;
const CW = 940;
const CH = 330;

const NODES: CanvasNode[] = [
  { id: "trigger", x: 70, y: 147, w: 98, label: "Trigger", sub: "manual · api", tone: "ok", bar: "var(--cat-trigger)" },
  { id: "schema", x: 200, y: 147, w: 114, label: "Input Schema", sub: "zod · 4 fields", tone: "ok", bar: "var(--cat-flow)" },
  { id: "agent", x: 352, y: 126, w: 124, label: "LLM Agent", sub: "gemini-2.5-pro · agent", tone: "warn", bar: "var(--active)" },
  { id: "search", x: 357, y: 232, w: 114, label: "Web Search", sub: "tool · ETIMEDOUT 30.0s", tone: "fail", bar: "var(--destructive)" },
  { id: "guard", x: 515, y: 147, w: 110, label: "Guardrail", sub: "pii · injection", tone: "idle", bar: "var(--success)" },
  { id: "eval", x: 663, y: 73, w: 118, label: "Evaluation", sub: "judge · gate 0.80", tone: "idle", bar: "var(--cat-quality)" },
  { id: "router", x: 663, y: 207, w: 104, label: "Router", sub: "2 branches", tone: "idle", bar: "var(--cat-logic)" },
  { id: "end", x: 812, y: 147, w: 78, label: "End", sub: "respond", tone: "idle", bar: "var(--cat-flow)" },
];
const N = Object.fromEntries(NODES.map((n) => [n.id, n]));

const right = (n: CanvasNode) => [n.x + n.w, n.y + NH / 2] as const;
const left = (n: CanvasNode) => [n.x, n.y + NH / 2] as const;
const curve = ([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number]) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

const STEPS = [
  { n: "00", label: "failure detected", tone: "fail" as Tone },
  { n: "01", label: "attempt 1 · timeout", tone: "fail" as Tone },
  { n: "02", label: "attempt 2 · retry", tone: "warn" as Tone },
  { n: "03", label: "reroute decision", tone: "ok" as Tone },
];
const STEP_T = ["t+30.0s", "t+30.0s", "t+36.1s", "t+41.8s"];

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-active",
  fail: "bg-destructive",
  idle: "bg-subtle/60",
};

const TOOLS = [
  { icon: Spline, label: "Canvas" },
  { icon: Activity, label: "Runs" },
  { icon: ShieldCheck, label: "Guardrails" },
  { icon: Layers, label: "Versions" },
  { icon: Terminal, label: "Console" },
];

export function Workbench() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (step >= STEPS.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStep((v) => v + 1), 1100);
    return () => window.clearTimeout(id);
  }, [playing, step]);

  const replay = () => {
    setStep(0);
    setPlaying(true);
  };
  const rerouted = step === STEPS.length - 1;

  return (
    <figure
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sheen"
      aria-label="Aegis workbench: the Support triage workflow paused on a failed Web Search call"
    >
      {/* chrome */}
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong" />
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-[11px] text-subtle">
            <History className="h-3 w-3" aria-hidden />
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
        <nav aria-label="Workbench sections (preview)" className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r border-border py-3">
          {TOOLS.map(({ icon: Icon, label }, i) => (
            <span
              key={label}
              title={label}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md text-subtle",
                i === 0 && "bg-surface-hover text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
          ))}
        </nav>

        {/* canvas */}
        <div className="relative min-w-0 flex-1 overflow-x-auto">
          <div className={cn("pointer-events-none absolute inset-0", s.dots)} aria-hidden />
          <div className="relative" style={{ width: CW, height: CH }}>
            <svg width={CW} height={CH} className="absolute inset-0" aria-hidden>
              <path d={curve(right(N.trigger), left(N.schema))} stroke="var(--canvas-edge)" strokeWidth={1.25} fill="none" />
              <path
                d={curve(right(N.schema), left(N.agent))}
                stroke="var(--active)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                className={s.edge}
              />
              <path d={curve(right(N.agent), left(N.guard))} stroke="var(--canvas-edge)" strokeWidth={1.25} fill="none" />
              <path
                d={`M ${N.agent.x + 62} ${N.agent.y + NH} L ${N.agent.x + 62} ${N.search.y}`}
                stroke="var(--destructive)"
                strokeWidth={1.25}
                strokeDasharray="2 3"
                fill="none"
              />
              <path d={curve(right(N.guard), left(N.eval))} stroke="var(--canvas-edge)" strokeWidth={1.25} fill="none" />
              <path
                d={`M ${N.eval.x + 50} ${N.eval.y + NH} L ${N.eval.x + 50} ${N.router.y}`}
                stroke="var(--canvas-edge)"
                strokeWidth={1.25}
                fill="none"
              />
              <path
                d={curve(right(N.search), [N.router.x, N.router.y + NH / 2])}
                stroke={rerouted ? "var(--success)" : "var(--canvas-edge)"}
                strokeWidth={rerouted ? 1.5 : 1}
                strokeDasharray="1.5 3.5"
                strokeOpacity={rerouted ? 1 : 0.7}
                fill="none"
                className="transition-[stroke] duration-2"
              />
              <path d={curve(right(N.router), left(N.end))} stroke="var(--canvas-edge)" strokeWidth={1.25} fill="none" />
            </svg>

            {NODES.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "absolute flex flex-col justify-center rounded-md border bg-surface-elevated pl-3 pr-2.5",
                  n.tone === "fail"
                    ? "border-destructive/80 outline outline-1 outline-offset-[3px] outline-destructive/50"
                    : n.tone === "warn"
                      ? "border-active/50"
                      : "border-border-strong",
                  n.tone === "fail" && step < 3 && s.failPulse
                )}
                style={{ left: n.x, top: n.y, width: n.w, height: NH }}
              >
                <span className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full" style={{ background: n.bar }} aria-hidden />
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold leading-none text-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", DOT[n.tone])} aria-hidden />
                  {n.label}
                </span>
                <span
                  className={cn(
                    "mt-1.5 truncate font-mono text-[9.5px] leading-none",
                    n.tone === "fail" ? "text-destructive" : "text-subtle"
                  )}
                >
                  {n.sub}
                </span>
              </div>
            ))}

            <button
              type="button"
              onClick={replay}
              className="absolute inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-destructive/50 bg-surface px-2 font-mono text-[10px] text-destructive transition-colors duration-1 hover:bg-destructive/10"
              style={{ left: 361, top: 196 }}
            >
              <Zap className="h-3 w-3" aria-hidden />
              click to replay triage
            </button>

            <span
              className="absolute inline-flex h-7 items-center gap-2 rounded-md border border-border bg-surface px-2.5 font-mono text-[10.5px]"
              style={{ left: 70, top: 286 }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
              <span className="text-destructive">FAILED</span>
              <span className="text-subtle">run_01J8XK4P</span>
            </span>

            <span
              className="absolute inline-flex h-8 items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-[12px]"
              style={{ left: 694, top: 282 }}
            >
              <Spline className="h-3.5 w-3.5 text-subtle" aria-hidden />
              <span className="font-medium text-foreground">Support triage</span>
              <span className="rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-subtle">v0.7.3 · DRAFT</span>
            </span>
          </div>
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
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
          aria-label="Reset replay"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-subtle transition-colors duration-1 hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <ol className="relative flex min-w-[640px] flex-1 items-center justify-between gap-3" aria-label="Replay timeline">
          <span className="absolute left-0 right-0 top-1/2 h-px bg-border" aria-hidden />
          {STEPS.map((st, i) => (
            <li key={st.n} className="relative">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setStep(i);
                }}
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
          <li className="relative bg-surface pl-1 font-mono text-[10.5px] tabular-nums text-subtle">{STEP_T[step]}</li>
        </ol>
      </div>

      {/* run metrics */}
      <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "Status", v: "• FAILED", sub: "run_01J8XK4P", cls: "text-destructive" },
          { k: "Tokens", v: "8,214", sub: "this run" },
          { k: "Cost", v: "$0.027", sub: "this run" },
          { k: "P95", v: "1.82s", sub: "latency" },
          { k: "Eval", v: "—", sub: "gate pending" },
          { k: "Nodes", v: "2/8", sub: rerouted ? "rerouted 00:41.8" : "paused 00:41.8" },
        ].map((m) => (
          <div key={m.k} className="border-b border-r border-border px-5 py-4 lg:border-b-0 sm:px-6">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{m.k}</dt>
            <dd className={cn("mt-2 font-mono text-[20px] leading-none tabular-nums text-foreground", m.cls)}>{m.v}</dd>
            <dd className="mt-1.5 font-mono text-[10.5px] text-subtle">{m.sub}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
