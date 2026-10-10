"use client";

import { CredentialsPanel } from "@/components/credentials/CredentialsPanel";
import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";

export default function CredentialsPage() {
  return (
    <Page>
      <PageHeader
        title="Credentials"
        description="Named credentials for integrations, LLM providers, and trusted MCP tool servers."
      />
      <CredentialsPanel />
    </Page>
  );
}
