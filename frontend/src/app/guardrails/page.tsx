"use client";

import { GuardrailPlayground } from "@/components/guardrails/GuardrailPlayground";
import { PageHeader } from "@/components/ui/page-header";
import { PageEnter } from "@/components/motion";

export default function GuardrailsPage() {
  return (
    <PageEnter className="page-container space-y-6">
      <PageHeader
        title="Guardrails"
        description="Stress-test policies before adding guardrail nodes on the canvas."
      />
      <GuardrailPlayground />
    </PageEnter>
  );
}
