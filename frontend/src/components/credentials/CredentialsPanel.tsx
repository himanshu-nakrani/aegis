"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Row } from "@/components/ui/row";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { LLM_PROVIDERS } from "@/lib/llm-providers";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import type { CredentialType } from "@/types/workflow";

const REQUIRED_CREDENTIAL_FIELDS: Record<CredentialType, string[]> = {
  slack: ["webhook_url"],
  discord: ["webhook_url"],
  postgres: ["connection_url"],
  email: ["smtp_host", "smtp_user", "smtp_password"],
  openai: ["api_key"],
  anthropic: ["api_key"],
  fireworks: ["api_key"],
  openrouter: ["api_key"],
  featherless: ["api_key"],
  vercel: ["api_key"],
};

const API_KEY_FIELD = { key: "api_key", label: "API key", secret: true };
const BASE_URL_FIELD = { key: "base_url", label: "Base URL (optional)" };

const CONFIG_HINTS: Record<
  CredentialType,
  Array<{ key: string; label: string; secret?: boolean }>
> = {
  slack: [{ key: "webhook_url", label: "Webhook URL", secret: true }],
  discord: [{ key: "webhook_url", label: "Webhook URL", secret: true }],
  email: [
    { key: "smtp_host", label: "SMTP host" },
    { key: "smtp_port", label: "SMTP port" },
    { key: "smtp_user", label: "SMTP user" },
    { key: "smtp_password", label: "SMTP password", secret: true },
    { key: "from", label: "From address" },
    { key: "to", label: "Default to address" },
  ],
  postgres: [{ key: "connection_url", label: "Connection URL", secret: true }],
  openai: [API_KEY_FIELD],
  anthropic: [API_KEY_FIELD],
  fireworks: [API_KEY_FIELD],
  openrouter: [API_KEY_FIELD, BASE_URL_FIELD],
  featherless: [API_KEY_FIELD, BASE_URL_FIELD],
  vercel: [API_KEY_FIELD, BASE_URL_FIELD],
};

/**
 * The whole credentials manager: saved-secret list with delete, plus the
 * typed add form. Owns its query and error state so a credentials outage
 * degrades only this page, never the surfaces that link to it.
 */
export function CredentialsPanel() {
  const queryClient = useQueryClient();
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState<CredentialType>("slack");
  const [credConfig, setCredConfig] = useState<Record<string, string>>({});
  const [savingCred, setSavingCred] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [credFieldErrors, setCredFieldErrors] = useState<Record<string, string>>({});
  const baseId = useId();
  const fieldId = (name: string) => `${baseId}-${name}`;

  const {
    data: credentials = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.credentials,
    queryFn: api.listCredentials,
  });

  const validateCredField = (fieldKey: string, value = credConfig[fieldKey]) => {
    const required = REQUIRED_CREDENTIAL_FIELDS[credType];
    if (!required.includes(fieldKey)) return true;
    const valid = Boolean(value?.trim());
    setCredFieldErrors((prev) => ({
      ...prev,
      [fieldKey]: valid ? "" : "This field is required",
    }));
    return valid;
  };

  const validateAllCredFields = () => {
    const errors: Record<string, string> = {};
    for (const fieldKey of REQUIRED_CREDENTIAL_FIELDS[credType]) {
      if (!credConfig[fieldKey]?.trim()) {
        errors[fieldKey] = "This field is required";
      }
    }
    setCredFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateCredential = async () => {
    if (!credName.trim()) {
      toast.error("Credential name is required");
      return;
    }
    if (!validateAllCredFields()) {
      toast.error("Fill in all required credential fields");
      return;
    }
    setSavingCred(true);
    try {
      const created = await api.createCredential({
        name: credName.trim(),
        type: credType,
        config: credConfig,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
      setCredName("");
      setCredConfig({});
      setCredFieldErrors({});
      toast.success(`Credential "${created.name}" saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save credential");
    } finally {
      setSavingCred(false);
    }
  };

  const handleDeleteCredential = async (id: string) => {
    try {
      await api.deleteCredential(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
      toast.success("Credential deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete credential");
    }
  };

  if (isError) {
    return (
      <ApiConnectionState
        description="Credentials could not be loaded. Check the API target, then retry."
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Saved credentials"
        description="Integration nodes and LLM-provider agents reference these by name"
        flush
        actions={
          <span className="font-mono text-2xs text-muted tabular-nums">
            {credentials.length}
          </span>
        }
      >
        {isLoading ? (
          <LoadingState variant="list" />
        ) : credentials.length === 0 ? (
          <EmptyState
            compact
            icon={KeyRound}
            title="No credentials yet"
            description="Add one below — integration nodes and LLM-provider agents reference credentials by name."
          />
        ) : (
          <ul className="divide-y divide-border">
            {credentials.map((cred) => (
              <li key={cred.id} className="group relative">
                <Row className="pr-10">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {cred.name}
                    </p>
                    <Badge variant="outline" className="font-mono text-2xs lowercase">
                      {cred.type}
                    </Badge>
                  </div>
                </Row>
                <button
                  type="button"
                  aria-label={`Delete credential ${cred.name}`}
                  onClick={() => setDeleteTarget({ id: cred.id, name: cred.name })}
                  className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Add credential"
        description="Secrets are encrypted at rest when APP_ENCRYPTION_KEY is set on the backend"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("cred-name")}>Name</Label>
              <Input
                id={fieldId("cred-name")}
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                placeholder="slack_default"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("cred-type")}>Type</Label>
              <Select
                value={credType}
                onValueChange={(value) => {
                  setCredType(value as CredentialType);
                  setCredConfig({});
                  setCredFieldErrors({});
                }}
              >
                <SelectTrigger id={fieldId("cred-type")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="postgres">Postgres</SelectItem>
                  {LLM_PROVIDERS.filter((p) => p.needsCredential).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONFIG_HINTS[credType].map((field) => {
              const fid = fieldId(`cred-field-${field.key}`);
              return (
                <div key={field.key} className="space-y-1.5">
                  <Label
                    htmlFor={fid}
                    required={REQUIRED_CREDENTIAL_FIELDS[credType].includes(field.key)}
                  >
                    {field.label}
                  </Label>
                  <Input
                    id={fid}
                    type={field.secret ? "password" : "text"}
                    value={credConfig[field.key] || ""}
                    onChange={(e) =>
                      setCredConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    onBlur={() => validateCredField(field.key)}
                    className={cn(credFieldErrors[field.key] && "border-destructive")}
                  />
                  {credFieldErrors[field.key] && (
                    <p className="text-xs text-destructive">{credFieldErrors[field.key]}</p>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleCreateCredential}
            disabled={savingCred}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {savingCred ? "Saving…" : "Add credential"}
          </Button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete credential?"
        description="This will break any workflow that uses this credential. The change cannot be undone."
        confirmLabel={deleteTarget ? `Delete credential '${deleteTarget.name}'` : "Delete"}
        loadingLabel="Deleting credential…"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDeleteCredential(deleteTarget.id);
        }}
      />
    </div>
  );
}
