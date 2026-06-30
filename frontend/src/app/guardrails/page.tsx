"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GuardrailPlayground } from "@/components/guardrails/GuardrailPlayground";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function GuardrailsPage() {
  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Guardrail Playground"
        description="Test guardrail rules, PII detection, and prompt-injection shields before wiring them into workflows."
        back={
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        }
      />
      <GuardrailPlayground />
    </div>
  );
}