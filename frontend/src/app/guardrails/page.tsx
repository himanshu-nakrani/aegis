"use client";

import { GuardrailPlayground } from "@/components/guardrails/GuardrailPlayground";

export default function GuardrailsPage() {
  return (
    <div className="page-container space-y-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-foreground sm:text-[32px] sm:leading-10">
          Guardrails
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted">
          Stress-test policies before adding guardrail nodes on the canvas.
        </p>
      </div>
      <GuardrailPlayground />
    </div>
  );
}
