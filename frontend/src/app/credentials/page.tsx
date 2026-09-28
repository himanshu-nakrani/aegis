"use client";

import { CredentialsPanel } from "@/components/credentials/CredentialsPanel";
import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";

export default function CredentialsPage() {
  return (
    <Page>
      <PageHeader
        title="Credentials"
        description="Named secrets for integration nodes (Slack, Discord, Email, Postgres) and LLM providers (OpenAI, Anthropic, and more)."
      />
      <CredentialsPanel />
    </Page>
  );
}
