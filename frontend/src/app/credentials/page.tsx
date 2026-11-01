"use client";

import { CredentialsPanel } from "@/components/credentials/CredentialsPanel";
import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/ui/page-header";

export default function CredentialsPage() {
  return (
    <Page>
      <PageHeader
        title="Credentials"
        description="Manage secrets for integrations, providers, and MCP servers."
      />
      <CredentialsPanel />
    </Page>
  );
}
