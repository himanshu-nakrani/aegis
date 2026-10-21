import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroGraph } from "./HeroGraph";
import s from "./landing.module.css";

/** lucide dropped brand marks; inline the GitHub glyph at icon size. */
function Github({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const REPO_URL = "https://github.com/himanshu-nakrani/aegis";

const PROVIDERS = [
  "Gemini",
  "OpenAI",
  "Anthropic",
  "Fireworks",
  "OpenRouter",
  "Featherless",
  "Vercel AI Gateway",
  "Ollama",
];

const FACTS: Array<[string, string]> = [
  ["30", "node types on the canvas"],
  ["8", "LLM providers, chosen per node"],
  ["ADK 2.11", "Google Agent Development Kit runtime"],
  ["MIT", "licensed, self-hosted"],
];

const LOOP: Array<{ n: string; verb: string; title: string; body: string; items: string[] }> = [
  {
    n: "01",
    verb: "Build",
    title: "Author the graph, not a prompt chain.",
    body: "A React Flow canvas with agents, tools, routers, joins, code, iteration, sub-workflows and RAG retrieval. Every graph is validated Trigger → End before it can save or compile.",
    items: ["Versioned prompt registry", "Templates & version history", "Reviewable AI assist — drafts, never silent edits"],
  },
  {
    n: "02",
    verb: "Guard",
    title: "Policies that sit on the canvas.",
    body: "Guardrail nodes and reusable policies run deterministic rules, Presidio PII, prompt-injection and LLM classifiers, and pre-execution tool-call checks.",
    items: ["Policy playground", "Tool-call frequency & parameter caps", "Fail-closed in production"],
  },
  {
    n: "03",
    verb: "Grade",
    title: "Know when quality moves.",
    body: "Multi-dimension LLM-judge evals with presets and pass thresholds, deterministic scorers, RAG retrieval metrics, and regression experiments across versions, models and datasets.",
    items: ["Datasets from real runs", "Model-matrix experiments", "aegis gate in CI"],
  },
  {
    n: "04",
    verb: "Operate",
    title: "Triage like an ops console.",
    body: "Nested span waterfalls, per-call tokens and cost, failure clusters, regression queue, cross-run trace search, and a feedback annotation queue — live over SSE.",
    items: ["OTLP & LangSmith export", "Quality alerts", "Online eval sampling"],
  },
];

const PIPELINE: Array<{ step: string; file: string; body: string }> = [
  { step: "Validate", file: "graph_validation", body: "DAG must run Trigger → … → End, acyclic, no orphan edges." },
  { step: "Compile", file: "compiler", body: "Graph JSON becomes a Google ADK workflow — agents, joins, routed edges." },
  { step: "Execute", file: "executor", body: "ADK Runner executes; each event is persisted with a per-run sequence." },
  { step: "Stream", file: "event_bus", body: "SSE fan-out, replayable after reconnect; Postgres NOTIFY wakes other pods." },
];

const DURABILITY: Array<[string, string]> = [
  ["Checkpoint resume", "Interrupted runs re-queue on boot and resume from run checkpoints."],
  ["Worker mode", "A separate worker claims runs with FOR UPDATE SKIP LOCKED — no double-claims."],
  ["Durable approvals", "Human-approval gates are database rows, so a restart never loses a decision."],
  ["Encrypted secrets", "Credentials, MCP headers and webhook secrets are Fernet-encrypted at rest."],
];

const SURFACES: Array<[string, string]> = [
  ["Invoke API", "Scoped deployment keys, wait or stream."],
  ["MCP server", "Every published workflow becomes an invoke tool."],
  ["Hosted chat", "Token-scoped sessions with turn memory, embeddable."],
  ["Webhooks & cron", "Signed webhooks and scheduled triggers."],
];

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-2xs uppercase tracking-[0.14em] text-subtle">
      <span className="text-muted">{index}</span>
      <span className="h-px w-8 bg-border-strong" aria-hidden />
      {children}
    </p>
  );
}

export function LandingPage() {
  return (
    <div className={cn("relative min-h-screen bg-background text-foreground", s.page)}>
      {/* ───────────── Header ───────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Link href="/welcome" className="flex items-center gap-2.5 rounded-md" aria-label="Aegis home">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border-strong bg-surface-elevated">
              <Shield className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Aegis</span>
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-7 text-[13px] text-muted md:flex">
            <a href="#loop" className="transition-colors duration-1 hover:text-foreground">The loop</a>
            <a href="#architecture" className="transition-colors duration-1 hover:text-foreground">Architecture</a>
            <a href="#ship" className="transition-colors duration-1 hover:text-foreground">Ship</a>
            <a href="#start" className="transition-colors duration-1 hover:text-foreground">Quick start</a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={REPO_URL}
              className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted transition-colors duration-1 hover:bg-surface-hover hover:text-foreground sm:inline-flex"
            >
              <Github className="h-3.5 w-3.5" />
              GitHub
            </a>
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity duration-1 hover:opacity-90"
            >
              Open workbench
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ───────────── Hero ───────────── */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24">
            <div>
              <p className={cn("font-mono text-2xs uppercase tracking-[0.14em] text-subtle", s.reveal, s.d1)}>
                Self-hosted · model-neutral · open source
              </p>
              <h1
                className={cn(
                  "mt-6 text-[52px] leading-[0.98] sm:text-[68px] lg:text-[84px]",
                  s.display,
                  s.reveal,
                  s.d2
                )}
              >
                Agents you can
                <br />
                <em className="text-muted">actually</em> trust.
              </h1>
              <p className={cn("mt-7 max-w-[34rem] text-[15px] leading-[1.6] text-muted", s.reveal, s.d3)}>
                Aegis is the workbench that runs the whole loop on one canvas —{" "}
                <span className="text-foreground">build</span> graph workflows,{" "}
                <span className="text-foreground">guard</span> them with policies,{" "}
                <span className="text-foreground">grade</span> them with evals, and{" "}
                <span className="text-foreground">operate</span> them like production software.
              </p>
              <div className={cn("mt-9 flex flex-wrap items-center gap-3", s.reveal, s.d4)}>
                <Link
                  href="/workflows/new"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-opacity duration-1 hover:opacity-90"
                >
                  Start a workflow
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={REPO_URL}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-4 text-[14px] text-foreground transition-colors duration-1 hover:bg-surface-hover"
                >
                  <Github className="h-4 w-4" />
                  Read the source
                </a>
              </div>
              <dl className={cn("mt-12 grid max-w-[34rem] grid-cols-2 gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid-cols-4", s.reveal, s.d5)}>
                {FACTS.map(([value, label]) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="font-mono text-[18px] font-medium tabular-nums tracking-[-0.01em]">{value}</dd>
                    <dd className="mt-1 text-[12px] leading-snug text-subtle">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className={cn(s.reveal, s.d3)}>
              <HeroGraph />
            </div>
          </div>

          {/* provider marquee */}
          <div className="border-t border-border py-4">
            <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-5 sm:px-8">
              <span className="shrink-0 font-mono text-2xs uppercase tracking-[0.14em] text-subtle">
                Bring any model
              </span>
              <div className={cn("relative min-w-0 flex-1 overflow-hidden", s.marquee)}>
                <ul className={cn("flex w-max gap-10", s.marqueeTrack)} aria-label="Supported LLM providers">
                  {[...PROVIDERS, ...PROVIDERS].map((p, i) => (
                    <li
                      key={`${p}-${i}`}
                      aria-hidden={i >= PROVIDERS.length}
                      className="whitespace-nowrap text-[14px] text-muted"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── The loop ───────────── */}
        <section id="loop" className="scroll-mt-14 border-b border-border">
          <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
              <div>
                <SectionLabel index="01">The loop</SectionLabel>
                <h2 className={cn("mt-6 text-[40px] leading-[1.04] sm:text-[52px]", s.display)}>
                  Most agent tools stop at
                  <br />
                  <em className="text-muted">“make a graph and hope.”</em>
                </h2>
              </div>
              <p className="max-w-[30rem] text-[15px] leading-[1.6] text-muted lg:justify-self-end">
                Aegis closes the loop. The same canvas that authors a workflow also enforces its policies,
                scores its output, and shows you exactly which span failed — so a change ships with evidence,
                not vibes.
              </p>
            </div>

            <ol className="mt-16 grid border-t border-border-strong md:grid-cols-2 xl:grid-cols-4">
              {LOOP.map((step, i) => (
                <li
                  key={step.verb}
                  className={cn(
                    "flex flex-col border-b border-border py-8 md:px-6 xl:border-b-0",
                    i % 2 === 1 && "md:border-l",
                    i > 0 && "xl:border-l",
                    "md:first:pl-0 xl:pl-6 xl:first:pl-0"
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={cn("text-[34px] leading-none", s.display)}>{step.verb}</span>
                    <span className="font-mono text-2xs tabular-nums text-subtle">{step.n}</span>
                  </div>
                  <h3 className="mt-6 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{step.title}</h3>
                  <p className="mt-3 text-[13.5px] leading-[1.6] text-muted">{step.body}</p>
                  <ul className="mt-6 space-y-2 border-t border-border pt-4">
                    {step.items.map((item) => (
                      <li key={item} className="flex gap-2.5 text-[13px] text-muted">
                        <span className="mt-[7px] h-px w-3 shrink-0 bg-border-strong" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────────── Architecture ───────────── */}
        <section id="architecture" className="scroll-mt-14 border-b border-border bg-surface">
          <div className="mx-auto grid max-w-[1240px] gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <SectionLabel index="02">Architecture</SectionLabel>
              <h2 className={cn("mt-6 text-[40px] leading-[1.04] sm:text-[48px]", s.display)}>
                A deterministic skeleton.
                <br />
                <em className="text-muted">Judgment where it counts.</em>
              </h2>
              <p className="mt-6 max-w-[28rem] text-[15px] leading-[1.6] text-muted">
                Graphs are stored as JSON, validated, then compiled into a Google ADK workflow. Agentic
                reasoning lives at specific nodes; the path between them is explicit, inspectable and
                testable.
              </p>
              <dl className="mt-10 space-y-3 font-mono text-2xs">
                {[
                  ["UI", "Next.js 14 · React Flow · TanStack Query"],
                  ["API", "FastAPI · SQLAlchemy 2 · Alembic"],
                  ["Runtime", "Google ADK 2.11 · google-genai · LiteLLM"],
                  ["Data", "PostgreSQL · pgvector / sqlite-vec"],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[5rem_1fr] gap-3 border-t border-border pt-3">
                    <dt className="uppercase tracking-[0.1em] text-subtle">{k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              {/* pipeline */}
              <div className="rounded-xl border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border px-5 py-3 font-mono text-2xs uppercase tracking-[0.1em] text-subtle">
                  <span>Run pipeline</span>
                  <span>app/services</span>
                </div>
                <ol>
                  {PIPELINE.map((p, i) => (
                    <li
                      key={p.step}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-b border-border px-5 py-5 last:border-b-0 sm:grid-cols-[2.5rem_9rem_minmax(0,1fr)]"
                    >
                      <span className="relative font-mono text-2xs tabular-nums text-subtle">
                        {String(i + 1).padStart(2, "0")}
                        {i < PIPELINE.length - 1 && (
                          <span className="absolute left-[5px] top-6 h-[calc(100%+12px)] w-px bg-border-strong" aria-hidden />
                        )}
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold tracking-[-0.01em]">{p.step}</p>
                        <p className="mt-0.5 font-mono text-2xs text-subtle">{p.file}.py</p>
                      </div>
                      <p className="col-start-2 text-[13.5px] leading-[1.6] text-muted sm:col-start-auto">{p.body}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* durability */}
              <div className="mt-12">
                <p className="font-mono text-2xs uppercase tracking-[0.14em] text-subtle">Built to survive a restart</p>
                <dl className="mt-5 grid gap-x-10 sm:grid-cols-2">
                  {DURABILITY.map(([title, body]) => (
                    <div key={title} className="border-t border-border py-5">
                      <dt className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em]">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                        {title}
                      </dt>
                      <dd className="mt-2 text-[13.5px] leading-[1.6] text-muted">{body}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── Ship ───────────── */}
        <section id="ship" className="scroll-mt-14 border-b border-border">
          <div className="mx-auto grid max-w-[1240px] gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="overflow-hidden rounded-xl border border-border bg-surface-input">
                <div className="flex items-center gap-1 border-b border-border px-3 py-2 font-mono text-2xs">
                  <span className="rounded-sm bg-surface-hover px-2 py-1 text-foreground">invoke.sh</span>
                  <span className="px-2 py-1 text-subtle">ci.yml</span>
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.75] text-muted">
                  <code>
                    <span className="text-subtle"># Call the pinned, published version — stream events as SSE</span>
                    {"\n"}
                    <span className="text-foreground">curl</span> -N -X POST \{"\n"}
                    {"  "}&quot;$AEGIS/v1/workflows/$WORKFLOW_ID/invoke?stream=true&quot; \{"\n"}
                    {"  "}-H <span className="text-foreground">&quot;X-Aegis-Invoke-Key: $DEPLOY_KEY&quot;</span> \{"\n"}
                    {"  "}-H &quot;Content-Type: application/json&quot; \{"\n"}
                    {"  "}-d &apos;{"{"}&quot;input&quot;: &quot;Refund order #4821?&quot;{"}"}&apos;{"\n\n"}
                    <span className="text-subtle"># Block the merge if eval quality regresses</span>
                    {"\n"}
                    <span className="text-foreground">aegis gate</span> --url $AEGIS --workflow $WORKFLOW_ID \{"\n"}
                    {"  "}--dataset $GOLDEN_SET --threshold 0.05
                  </code>
                </pre>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <SectionLabel index="03">Ship</SectionLabel>
              <h2 className={cn("mt-6 text-[40px] leading-[1.04] sm:text-[48px]", s.display)}>
                Publish once.
                <br />
                <em className="text-muted">Serve it everywhere.</em>
              </h2>
              <p className="mt-6 max-w-[28rem] text-[15px] leading-[1.6] text-muted">
                Promote a version to live and Aegis gives it a consumption surface — without a separate
                deployment stack.
              </p>
              <dl className="mt-10">
                {SURFACES.map(([title, body]) => (
                  <div key={title} className="grid grid-cols-[8.5rem_1fr] gap-4 border-t border-border py-4 last:border-b">
                    <dt className="text-[14px] font-semibold tracking-[-0.01em]">{title}</dt>
                    <dd className="text-[13.5px] leading-[1.55] text-muted">{body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ───────────── Quick start ───────────── */}
        <section id="start" className="scroll-mt-14">
          <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <div>
                <SectionLabel index="04">Quick start</SectionLabel>
                <h2 className={cn("mt-6 text-[48px] leading-[1] sm:text-[64px]", s.display)}>
                  Your models.
                  <br />
                  Your infra.
                  <br />
                  <em className="text-muted">Your evidence.</em>
                </h2>
              </div>
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="font-mono text-2xs uppercase tracking-[0.1em] text-subtle">terminal</p>
                <pre className="mt-3 overflow-x-auto font-mono text-[12.5px] leading-[1.8] text-muted">
                  <code>
                    <span className="text-subtle">$</span> git clone {REPO_URL}.git{"\n"}
                    <span className="text-subtle">$</span> cd aegis &amp;&amp; cp .env.example .env{"\n"}
                    <span className="text-subtle">$</span> docker compose up -d postgres{"\n"}
                    <span className="text-subtle">$</span> cd backend &amp;&amp; alembic upgrade head{"\n"}
                    <span className="text-subtle">$</span> <span className={s.caret}>uvicorn app.main:app --port 8000</span>
                  </code>
                </pre>
                <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
                  <Link
                    href="/templates"
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity duration-1 hover:opacity-90"
                  >
                    Browse templates
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <a
                    href={`${REPO_URL}#quick-start`}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong px-3.5 text-[13px] transition-colors duration-1 hover:bg-surface-hover"
                  >
                    Full setup guide
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-8 text-[12.5px] text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <Shield className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="text-muted">Aegis</span>
            <span aria-hidden>·</span>
            <span>Build → Guard → Grade → Operate</span>
          </div>
          <div className="flex items-center gap-5 font-mono text-2xs">
            <a href={REPO_URL} className="transition-colors duration-1 hover:text-foreground">GitHub</a>
            <a href={`${REPO_URL}/blob/main/LICENSE`} className="transition-colors duration-1 hover:text-foreground">MIT License</a>
            <Link href="/" className="transition-colors duration-1 hover:text-foreground">Workbench</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
