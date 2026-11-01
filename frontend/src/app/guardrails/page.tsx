"use client";

import { GuardrailPlayground } from "@/components/guardrails/GuardrailPlayground";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/layout/Page";

export default function GuardrailsPage() {
  return (
    <Page>
      <PageHeader
        title="Guardrails"
        description="Test policy checks against sample input."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/templates?filter=guardrail">Browse templates</Link>
          </Button>
        }
      />
      <GuardrailPlayground />
    </Page>
  );
}
