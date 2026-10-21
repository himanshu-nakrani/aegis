import { cn } from "@/lib/utils";
import s from "./landing.module.css";

type GraphNode = {
  id: string;
  x: number;
  y: number;
  label: string;
  sub: string;
  cat: string;
  state: "done" | "live";
};

const W = 104;
const H = 46;

/** Illustrative run: a deterministic skeleton with agentic judgment at nodes. */
const NODES: GraphNode[] = [
  { id: "trigger", x: 8, y: 147, label: "Trigger", sub: "webhook", cat: "--cat-trigger", state: "done" },
  { id: "router", x: 140, y: 147, label: "Router", sub: "intent", cat: "--cat-logic", state: "done" },
  { id: "agent", x: 272, y: 64, label: "Agent", sub: "gemini-2.5-flash", cat: "--cat-llm", state: "done" },
  { id: "kb", x: 272, y: 230, label: "KB retrieve", sub: "pgvector", cat: "--cat-data", state: "done" },
  { id: "guard", x: 404, y: 147, label: "Guardrail", sub: "pii · injection", cat: "--cat-quality", state: "done" },
  { id: "eval", x: 536, y: 147, label: "Eval", sub: "llm-judge ≥ 0.8", cat: "--cat-quality", state: "live" },
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

const EDGES: Array<{ from: string; to: string; live?: boolean }> = [
  { from: "trigger", to: "router" },
  { from: "router", to: "agent" },
  { from: "router", to: "kb" },
  { from: "agent", to: "guard" },
  { from: "kb", to: "guard" },
  { from: "guard", to: "eval", live: true },
];

function edgePath(a: GraphNode, b: GraphNode) {
  const x1 = a.x + W;
  const y1 = a.y + H / 2;
  const x2 = b.x;
  const y2 = b.y + H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

const TRACE: Array<[string, string, string]> = [
  ["trigger", "payload accepted", "0 ms"],
  ["router", "→ research, retrieve", "11 ms"],
  ["kb_retrieve", "4 chunks · cited", "212 ms"],
  ["agent", "1,204 tok · $0.0004", "1.84 s"],
  ["guardrail", "pii clear · injection clear", "38 ms"],
];

export function HeroGraph() {
  return (
    <figure
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sheen"
      aria-label="Example workflow run on the Aegis canvas"
    >
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-2xs text-subtle">
          <span className="text-muted">support-triage</span>
          <span aria-hidden>/</span>
          <span>v12 · live</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-2xs text-active">
          <span className={cn("h-1.5 w-1.5 rounded-full bg-active", s.pulse)} aria-hidden />
          running
        </div>
      </div>

      <div className="relative">
        <div className={cn("pointer-events-none absolute inset-0", s.grid)} aria-hidden />
        <svg
          viewBox="0 0 648 340"
          className="relative block h-auto w-full"
          role="img"
          aria-label="Trigger, router, agent and knowledge retrieval, guardrail, then an eval node currently running"
        >
          {EDGES.map((e, i) => (
            <path
              key={`${e.from}-${e.to}`}
              d={edgePath(byId[e.from], byId[e.to])}
              fill="none"
              stroke={e.live ? "var(--active)" : "var(--canvas-edge)"}
              strokeWidth={e.live ? 1.75 : 1.25}
              className={cn(s.node, e.live && s.edge)}
              style={{ animationDelay: `${260 + i * 90}ms` }}
            />
          ))}

          {NODES.map((n, i) => (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              className={s.node}
              style={{ animationDelay: `${180 + i * 110}ms` }}
            >
              <rect
                width={W}
                height={H}
                rx={5}
                fill="var(--surface-elevated)"
                stroke={n.state === "live" ? "var(--active)" : "var(--border-strong)"}
                strokeOpacity={n.state === "live" ? 0.8 : 1}
              />
              <rect x={0} y={8} width={2} height={H - 16} fill={`var(${n.cat})`} />
              <text
                x={12}
                y={19}
                fill="var(--fg)"
                fontSize={11.5}
                fontWeight={600}
                fontFamily="inherit"
              >
                {n.label}
              </text>
              <text x={12} y={34} fill="var(--fg-subtle)" fontSize={9.5} fontFamily="var(--font-mono)">
                {n.sub}
              </text>
              <circle
                cx={W - 10}
                cy={12}
                r={3}
                fill={n.state === "live" ? "var(--active)" : "var(--success)"}
                className={n.state === "live" ? s.pulse : undefined}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* trace readout */}
      <div className="border-t border-border bg-surface-input/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between font-mono text-2xs uppercase tracking-[0.08em] text-subtle">
          <span>Span trace</span>
          <span>example run</span>
        </div>
        <ol className="space-y-1 font-mono text-2xs tabular-nums">
          {TRACE.map(([node, detail, dur], i) => (
            <li
              key={node}
              className={cn("grid grid-cols-[7.5rem_1fr_auto] gap-3", s.traceRow)}
              style={{ animationDelay: `${900 + i * 140}ms` }}
            >
              <span className="flex items-center gap-2 text-muted">
                <span className="h-1 w-1 rounded-full bg-success" aria-hidden />
                {node}
              </span>
              <span className="truncate text-subtle">{detail}</span>
              <span className="text-muted">{dur}</span>
            </li>
          ))}
          <li
            className={cn("grid grid-cols-[7.5rem_1fr_auto] gap-3", s.traceRow)}
            style={{ animationDelay: `${900 + TRACE.length * 140}ms` }}
          >
            <span className="flex items-center gap-2 text-active">
              <span className="h-1 w-1 rounded-full bg-active" aria-hidden />
              eval
            </span>
            <span className={cn("text-subtle", s.caret)}>scoring faithfulness</span>
            <span className="text-subtle">—</span>
          </li>
        </ol>
      </div>
    </figure>
  );
}
