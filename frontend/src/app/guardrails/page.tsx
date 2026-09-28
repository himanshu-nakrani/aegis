"use client";

import { GuardrailPlayground } from "@/components/guardrails/GuardrailPlayground";
import { GettingStartedBanner } from "@/components/onboarding/GettingStartedBanner";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/layout/Page";

export default function GuardrailsPage() {
  return (
    <Page>
      <PageHeader
        title="Guardrails"
        description="Stress-test policies before adding guardrail nodes on the canvas."
      />
      <GettingStartedBanner
        onboardingKey="guardrails"
        title="Catch unsafe output before it ships"
        description="Draft a policy here, watch it block or mask a sample, then drop a guardrail node onto a workflow to enforce it in production."
        primaryHref="/templates?filter=guardrail"
        primaryLabel="Start from a guardrail template"
      />
      <GuardrailPlayground />
    </Page>
  );
}
