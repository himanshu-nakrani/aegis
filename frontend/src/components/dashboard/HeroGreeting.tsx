"use client";

import Link from "next/link";
import { ArrowRight, Gauge, GitBranch, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** User's display name, or null/undefined for a nameless greeting. */
  name?: string | null;
  /** Optional secondary info line. */
  meta?: string;
  /** Last-edited workflow id, used to power the "Open last canvas" CTA. Hide CTA if absent. */
  lastWorkflowId?: string | null;
};

function partOfDay(d = new Date()): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function HeroGreeting({ name, meta, lastWorkflowId }: Props) {
  const part = partOfDay();
  return (
    <section className="dashboard-panel overflow-hidden rounded-xl">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
        <div className="flex min-w-0 flex-col justify-between gap-6">
          <div className="space-y-3">
            <p className="text-caption">
              Good {part}
              {name ? ", " : ""}
              {name && <span className="text-gradient-primary">{name}</span>}
            </p>
            <div className="max-w-3xl space-y-2">
              <h1 className="text-display">Dashboard</h1>
              {meta && <p className="text-caption">{meta}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="default">
              <Link href="/workflows/new">
                <Plus className="mr-2 h-4 w-4" />
                New workflow
              </Link>
            </Button>
            {lastWorkflowId && (
              <Button asChild variant="outline">
                <Link href={`/workflows/${lastWorkflowId}/edit`}>
                  Open last canvas <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <Link
            href="/guardrails"
            className="flex items-center justify-between rounded-lg border border-border bg-surface-input px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Guardrails
            </span>
            <ArrowRight className="h-4 w-4 text-subtle" />
          </Link>
          <Link
            href="/observability"
            className="flex items-center justify-between rounded-lg border border-border bg-surface-input px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Gauge className="h-4 w-4 text-accent-300" />
              Observability
            </span>
            <ArrowRight className="h-4 w-4 text-subtle" />
          </Link>
          <Link
            href="/workflows"
            className="flex items-center justify-between rounded-lg border border-border bg-surface-input px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <GitBranch className="h-4 w-4 text-success" />
              Workflows
            </span>
            <ArrowRight className="h-4 w-4 text-subtle" />
          </Link>
        </div>
      </div>
    </section>
  );
}
