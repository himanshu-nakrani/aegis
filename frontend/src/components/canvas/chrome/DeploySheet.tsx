"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, DeploymentCredential, DeploymentCredentialKind } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Detects the "no published version yet" case. The backend surfaces this as a
 * 409 whose detail message we can't read the status code of (request() throws a
 * plain Error with the detail string), so we match on the message shape.
 */
function isNoPublishedVersion(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("no published") ||
    msg.includes("not published") ||
    msg.includes("publish") && msg.includes("first") ||
    msg.includes("409")
  );
}

type DeployTab = "curl" | "endpoint" | "webhook" | "mcp" | "widget";

/** Monospace code block with a hairline frame and a corner copy button. */
function CodeBlock({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-surface-input",
        className
      )}
    >
      <div className="absolute right-2 top-2 z-10">
        <CopyButton
          text={value}
          label={`Copy ${label}`}
          className="bg-surface-overlay/80 backdrop-blur-sm"
        />
      </div>
      <pre className="max-h-[42vh] overflow-auto p-3 pr-10 font-mono text-xs leading-5 tabular-nums text-foreground">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-micro mb-1.5 text-subtle">{children}</p>;
}

function DeploySheetBody({ workflowId }: { workflowId: string }) {
  const publishedQuery = useQuery({
    queryKey: [...queryKeys.deployDescriptor(workflowId), "published"],
    queryFn: () => api.getPublished(workflowId),
    staleTime: 0,
  });

  const descriptorQuery = useQuery({
    queryKey: queryKeys.deployDescriptor(workflowId),
    queryFn: () => api.getDeployDescriptor(workflowId),
    // Only fetch the descriptor once we know something is published; otherwise
    // the descriptor endpoint 409s too.
    enabled: !!publishedQuery.data?.published_version_id,
    retry: false,
    staleTime: 0,
  });

  const [tab, setTab] = React.useState<DeployTab>("curl");
  const [credential, setCredential] = React.useState<DeploymentCredential | null>(null);
  const [credentialError, setCredentialError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setCredential(null);
  }, [publishedQuery.data?.published_version_id]);

  async function manageCredential(kind: DeploymentCredentialKind, revoke = false) {
    setBusy(true);
    setCredential(null);
    setCredentialError(null);
    try {
      if (revoke) {
        await api.revokeDeploymentCredential(workflowId, kind);
      } else {
        const issued = await api.issueDeploymentCredential(workflowId, kind);
        setCredential(issued);
      }
      await descriptorQuery.refetch();
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : "Could not update deployment credentials");
    } finally {
      setBusy(false);
    }
  }

  // Loading: while we resolve whether there's a published version, or while the
  // descriptor loads for a published workflow.
  const loading =
    publishedQuery.isLoading ||
    (!!publishedQuery.data?.published_version_id && descriptorQuery.isLoading);

  if (loading) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-busy="true">
        <div className="skeleton h-9 w-full rounded-lg" />
        <div className="space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // No published version — either getPublished says so, or the descriptor 409'd.
  const notPublished =
    (!publishedQuery.isLoading && !publishedQuery.data?.published_version_id) ||
    (descriptorQuery.isError && isNoPublishedVersion(descriptorQuery.error));

  if (notPublished) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <EmptyState
          icon={Rocket}
          variant="info"
          title="Nothing published yet"
          description="Publish a version of this workflow, then provision scoped credentials to invoke it over HTTP."
        />
      </div>
    );
  }

  // Descriptor failed for some other reason.
  if (publishedQuery.isError || descriptorQuery.isError) {
    const err = publishedQuery.error ?? descriptorQuery.error;
    return (
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <EmptyState
          variant="error"
          title="Couldn’t load deploy details"
          description={err instanceof Error ? err.message : "Please try again."}
        />
      </div>
    );
  }

  const descriptor = descriptorQuery.data;
  if (!descriptor) return null;

  const versionNumber =
    descriptor.published_version_number ??
    publishedQuery.data?.published_version_number ??
    null;


  const mcpJson = JSON.stringify(descriptor.mcp_tool, null, 2);

  // Hosted chat embed — the ?token= chat token resolves deployment + pinned
  // version server-side and only exchanges for a session cookie, so the URL
  // never carries an invoke-capable credential.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  const chatUrl =
    `${appOrigin}/chat/${descriptor.deployment_id ?? "DEPLOYMENT_ID"}` +
    `?token=YOUR_CHAT_TOKEN`;
  const widgetSnippet =
    `<iframe\n  src="${chatUrl}"\n  title="${descriptor.workflow_name} — Aegis Chat"` +
    `\n  style="width:400px;height:600px;border:0;border-radius:12px"\n></iframe>`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Live status — the ONLY color in the sheet. */}
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Badge variant={descriptor.invoke_key_active || descriptor.webhook_secret_active || descriptor.chat_token_active ? "success" : "outline"} className="gap-1.5">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", descriptor.invoke_key_active || descriptor.webhook_secret_active || descriptor.chat_token_active ? "bg-success" : "bg-muted")}
            aria-hidden="true"
          />
          {descriptor.invoke_key_active || descriptor.webhook_secret_active || descriptor.chat_token_active
            ? versionNumber != null ? `Live v${versionNumber}` : "Live"
            : "Credentials required"}
        </Badge>
        <span className="truncate font-mono text-xs text-muted tabular-nums">
          {descriptor.method} {descriptor.invoke_path}
        </span>
      </div>

      <div className="space-y-3 border-b border-border px-5 py-4">
        <FieldLabel>Deployment credentials · owner managed</FieldLabel>
        <p className="text-xs leading-5 text-muted">
          Credentials only reach this published version. Rotation invalidates the old value;
          publishing a different version revokes all credentials. Account API keys cannot invoke.
        </p>
        {(["invoke_key", "webhook_secret", "chat_token"] as const).map((kind) => {
          const active =
            kind === "invoke_key"
              ? descriptor.invoke_key_active
              : kind === "webhook_secret"
                ? descriptor.webhook_secret_active
                : descriptor.chat_token_active;
          return (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-foreground">
                {kind === "invoke_key"
                  ? "Scoped invoke key"
                  : kind === "webhook_secret"
                    ? "Webhook signing secret"
                    : `Chat token${descriptor.chat_token_expires_at ? ` · expires ${new Date(descriptor.chat_token_expires_at).toLocaleDateString()}` : ""}`}
                {" · "}{active ? "active" : "not provisioned"}
              </span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void manageCredential(kind)}>
                {active ? "Rotate" : "Issue"}
              </Button>
              {active && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void manageCredential(kind, true)}>Revoke</Button>}
            </div>
          );
        })}
        {credentialError && <p role="alert" className="text-xs text-destructive">{credentialError}</p>}
        {credential && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-xs text-foreground">Copy this {credential.kind === "invoke_key" ? "invoke key" : credential.kind === "webhook_secret" ? "webhook secret" : "chat token"} now. It is shown once and cannot be retrieved.</p>
            <CodeBlock value={credential.secret} label="one-time credential" />
            <Button size="sm" variant="ghost" onClick={() => setCredential(null)}>Dismiss secret</Button>
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as DeployTab)}
        className="flex flex-1 flex-col gap-0 overflow-hidden"
      >
        <div className="px-5 pt-3">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="curl">cURL</TabsTrigger>
            <TabsTrigger value="endpoint">Endpoint</TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
            <TabsTrigger value="mcp">MCP tool</TabsTrigger>
            <TabsTrigger value="widget">Widget</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
          <TabsContent value="curl" className="space-y-1.5">
            <FieldLabel>Request</FieldLabel>
            <CodeBlock value={descriptor.curl} label="cURL command" />
            <p className="pt-2 text-xs leading-5 text-muted">
              Replace the scoped-key placeholder with your one-time invoke key.
              Keep it server-side; never embed it in a public page or URL.
            </p>
          </TabsContent>

          <TabsContent value="endpoint" className="space-y-4">
            <div>
              <FieldLabel>Invoke URL</FieldLabel>
              <CodeBlock value={descriptor.invoke_url} label="invoke URL" />
            </div>
            <div>
              <FieldLabel>Method &amp; path</FieldLabel>
              <CodeBlock
                value={`${descriptor.method} ${descriptor.invoke_path}`}
                label="method and path"
              />
            </div>
            <div>
              <FieldLabel>Required scoped-key headers</FieldLabel>
              <CodeBlock value={JSON.stringify(descriptor.headers, null, 2)} label="invoke headers" />
            </div>
          </TabsContent>

          <TabsContent value="webhook" className="space-y-3">
            <FieldLabel>HMAC-SHA256 signing format</FieldLabel>
            <CodeBlock value={descriptor.webhook.signing_format.replace(/\\n/g, "\n")} label="webhook signing format" />
            <p className="text-xs leading-5 text-muted">
              Sign these UTF-8 lines with the one-time webhook secret, followed by the exact raw JSON body bytes.
              Send X-Aegis-Deployment-ID and X-Aegis-Version-ID plus X-Aegis-Timestamp (Unix seconds),
              X-Aegis-Nonce (a unique random URL-safe value, 16–128 characters), and X-Aegis-Signature
              (sha256= followed by the hex digest). Timestamps must be within {descriptor.webhook.window_seconds} seconds.
              Reused nonces are rejected. Do not send the invoke-key header when using a signature.
            </p>
            <p className="text-xs text-muted">Issuing a webhook secret requires a valid APP_ENCRYPTION_KEY on the server.</p>
          </TabsContent>

          <TabsContent value="mcp" className="space-y-1.5">
            <FieldLabel>MCP tool spec</FieldLabel>
            <CodeBlock value={mcpJson} label="MCP tool JSON" />
            <p className="pt-2 text-xs leading-5 text-muted">
              Register{" "}
              <span className="font-mono text-foreground">
                {descriptor.mcp_tool.name}
              </span>{" "}
              in your own MCP adapter and invoke via the authenticated HTTP endpoint. This is a tool schema, not a hosted MCP server.
            </p>
          </TabsContent>

          <TabsContent value="widget" className="space-y-1.5">
            <FieldLabel>Embeddable chat</FieldLabel>
            <CodeBlock value={widgetSnippet} label="chat iframe snippet" />
            <p className="pt-2 text-xs leading-5 text-muted">
              Paste this iframe into any page to embed a hosted chat against this deployment.
              Replace <span className="font-mono text-foreground">YOUR_CHAT_TOKEN</span> with the
              chat token issued above — it can only exchange for a deployment-scoped chat session
              (it cannot invoke the API directly) and expires automatically. The snippet uses{" "}
              <span className="font-mono text-foreground">NEXT_PUBLIC_APP_URL</span> when set,
              otherwise this window&apos;s origin.
            </p>
            <p className="text-xs leading-5 text-muted">
              Share the same URL directly for a standalone chat page: it opens
              without workspace chrome and resumes the conversation on reload.
            </p>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * Publish & Deploy slide-over. Fetches the published-version state + the deploy
 * descriptor and presents credentials, cURL / endpoint / webhook / MCP details.
 *
 * Controlled: pass `open` + `onOpenChange`. `workflowId` is required to fetch;
 * the sheet body only mounts (and queries fire) while open.
 */
export function DeploySheet({
  open,
  onOpenChange,
  workflowId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="px-5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-muted" aria-hidden="true" />
            Publish &amp; Deploy
          </SheetTitle>
          <SheetDescription>
            Invoke this published workflow with a scoped key or signed webhook.
          </SheetDescription>
        </SheetHeader>

        {open && workflowId ? (
          <DeploySheetBody key={workflowId} workflowId={workflowId} />
        ) : (
          <div className="flex-1" />
        )}
      </SheetContent>
    </Sheet>
  );
}
