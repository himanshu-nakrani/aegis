"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GuardrailPlayground } from "@/components/guardrails/GuardrailPlayground";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function GuardrailsPage() {
  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Guardrail Playground"
        description="Test guardrail rules, PII detection, and prompt-injection shields before wiring them into workflows."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        }
      />
      <GuardrailPlayground />
    </div>
  );
}