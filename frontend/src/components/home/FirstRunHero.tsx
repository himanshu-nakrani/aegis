"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createWorkflowFromTemplate } from "@/lib/create-from-template";
import { dismissOnboarding, isOnboardingDismissed } from "@/lib/onboarding";

/**
 * First-run panel shown in place of the empty-library EmptyState. Renders null
 * on the server and first client paint (hydration-safe) and when dismissed —
 * the page falls back to its existing EmptyState in that case.
 */
export function FirstRunHero({ fallback }: { fallback: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    setReady(!isOnboardingDismissed("dashboard"));
  }, []);

  if (!ready) return <>{fallback}</>;

  const handleDismiss = () => {
    dismissOnboarding("dashboard");
    setReady(false);
  };

  const handleCreateFromTemplate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const templates = await queryClient.fetchQuery({
        queryKey: queryKeys.templates,
        queryFn: api.listTemplates,
      });
      const first = templates[0];
      if (!first) {
        router.push("/templates");
        return;
      }
      // O6: createWorkflowFromTemplate already routes through useTemplate —
      // calling it here too double-counted persisted template usage.
      const workflow = await createWorkflowFromTemplate(queryClient, first, {
        name: "My first workflow",
      });
      router.push(`/workflows/${workflow.id}`);
    } catch {
      // toast surfaced by createWorkflowFromTemplate / fetch errors
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="relative rounded-xl border border-border bg-surface px-6 py-10 sm:px-10 sm:py-12">
      <Button variant="ghost" size="icon-sm" onClick={handleDismiss} aria-label="Dismiss getting started" className="absolute right-4 top-4 text-muted"><X className="h-4 w-4" /></Button>
      <span className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-elevated"><Sparkles className="h-5 w-5 text-muted" /></span>
      <p className="mb-2 text-xs font-medium text-muted">Your workspace is ready</p>
      <h2 className="text-title tracking-tight text-foreground sm:text-page">Build your first agent workflow</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted">Connect agents and tools on a visual canvas. Start with a ready-to-use template, then make it your own.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={handleCreateFromTemplate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutTemplate className="h-4 w-4" />}
          {creating ? "Creating…" : "Start with a template"}
        </Button>
        <Button asChild variant="outline"><Link href="/workflows/new?starter=describe"><Sparkles className="h-4 w-4" />Describe with AI</Link></Button>
        <Button asChild variant="ghost" className="text-muted"><Link href="/workflows/new?starter=blank"><Plus className="h-4 w-4" />Start from scratch</Link></Button>
      </div>
    </section>
  );
}
