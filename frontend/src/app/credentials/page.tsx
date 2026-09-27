"use client";

import { CredentialsPanel } from "@/components/credentials/CredentialsPanel";
import { PageEnter } from "@/components/motion";
import { PageHeader } from "@/components/ui/page-header";

export default function CredentialsPage() {
  return (
    <PageEnter className="page-container space-y-6">
      <PageHeader
        title="Credentials"
        description="Named secrets for integration nodes (Slack, Discord, Email, Postgres) and LLM providers (OpenAI, Anthropic, and more)."
      />
      <CredentialsPanel />
    </PageEnter>
  );
}
