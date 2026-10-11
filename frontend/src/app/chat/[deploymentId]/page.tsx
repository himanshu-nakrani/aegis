import { cache } from "react";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { RecoveryState } from "@/components/ui/recovery-state";
import {
  descriptorVersionId,
  fetchDeploymentDescriptor,
  isUuid,
} from "@/lib/chat";

interface ChatPageProps {
  params: { deploymentId: string };
  // ?token= carries a scoped, expiring aegis_chat_ token exchanged on mount for
  // an httpOnly session cookie (the credential never re-enters client code).
  // ?key= is the legacy power-user fallback carrying a raw invoke key.
  searchParams: { token?: string; key?: string; w?: string; v?: string };
}

const getDescriptor = cache(fetchDeploymentDescriptor);

async function resolveDescriptor(props: ChatPageProps) {
  const key = props.searchParams.key?.trim();
  if (!key || !isUuid(props.params.deploymentId)) return null;
  return getDescriptor(props.params.deploymentId, key);
}

export async function generateMetadata(props: ChatPageProps): Promise<Metadata> {
  const descriptor = await resolveDescriptor(props);
  const name = descriptor?.workflow_name ?? descriptor?.name;
  return {
    // Absolute: the root "%s · Aegis" template would double-brand this surface.
    title: { absolute: name ? `${name} — Aegis Chat` : "Aegis Chat" },
    // Shared chat URLs must never reach an index.
    robots: { index: false, follow: false },
  };
}

export default async function ChatPage(props: ChatPageProps) {
  const { deploymentId } = props.params;
  const token = props.searchParams.token?.trim() ?? "";
  const key = props.searchParams.key?.trim() ?? "";
  const workflowId = isUuid(props.searchParams.w) ? props.searchParams.w : undefined;
  const versionId = isUuid(props.searchParams.v) ? props.searchParams.v : undefined;

  if ((!token && !key) || !isUuid(deploymentId)) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <RecoveryState
          tone="warning"
          icon={KeyRound}
          title="This chat link is incomplete"
          description="Hosted chat links carry a scoped chat token. Ask the workflow owner for the full URL — it looks like /chat/<deployment>?token=<chat token>."
        />
      </div>
    );
  }

  if (token) {
    // Token path: the workflow/version are bound server-side inside the
    // session token — no ?w=/?v= params, no descriptor fetch, no key.
    return <ChatPanel deploymentId={deploymentId} chatToken={token} />;
  }

  // Legacy invoke-key path: the descriptor endpoint may not exist on older
  // backends — every field here is optional and falls back to neutral copy.
  const descriptor = await resolveDescriptor(props);
  const name = descriptor?.workflow_name ?? descriptor?.name;
  return (
    <ChatPanel
      deploymentId={deploymentId}
      invokeKey={key}
      workflowId={
        workflowId ??
        (descriptor && isUuid(descriptor.workflow_id) ? descriptor.workflow_id : undefined)
      }
      versionId={versionId ?? (descriptor ? descriptorVersionId(descriptor) ?? undefined : undefined)}
      workflowName={typeof name === "string" && name.trim() ? name.trim() : undefined}
    />
  );
}
