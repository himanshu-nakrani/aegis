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
        title="Guardrail playground"
        description="Stress-test input and output policies before promoting them to workflow guardrail nodes."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Workflows
            </Link>
          </Button>
        }
      />
      <GuardrailPlayground />
    </div>
  );
}
