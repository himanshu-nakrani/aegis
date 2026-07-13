"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { AlertsCard, OpsConfigCard } from "@/components/settings/AlertsCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  clearApiKey,
  getApiKey,
  getApiKeyAuditLog,
  rotateApiKey,
  setApiKey,
  type ApiKeyAuditEntry,
} from "@/lib/auth";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IntegrationType } from "@/types/workflow";

const REQUIRED_CREDENTIAL_FIELDS: Record<IntegrationType, string[]> = {
  slack: ["webhook_url"],
  discord: ["webhook_url"],
  postgres: ["connection_url"],
  email: ["smtp_host", "smtp_user", "smtp_password"],
};

const CONFIG_HINTS: Record<
  IntegrationType,
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
};

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-surface shadow-elev-1"
      aria-labelledby={id}
    >
      <header className="border-b border-border px-4 py-3 sm:px-5">
        <h2 id={id} className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKeyState] = useState("");
  const [auditLog, setAuditLog] = useState<ApiKeyAuditEntry[]>([]);
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState<IntegrationType>("slack");
  const [credConfig, setCredConfig] = useState<Record<string, string>>({});
  const [savingCred, setSavingCred] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetLabel, setPresetLabel] = useState("");
  const [presetCriteria, setPresetCriteria] = useState("");
  const [presetInstruction, setPresetInstruction] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "credential"; id: string; name: string }
    | { type: "preset"; id: string; name: string }
    | null
  >(null);
  const [credFieldErrors, setCredFieldErrors] = useState<Record<string, string>>({});
  const baseId = useId();
  const fieldId = (name: string) => `${baseId}-${name}`;

  const {
    data: credentials = [],
    isLoading: credentialsLoading,
    isError: credentialsError,
    error: credentialsQueryError,
    refetch: refetchCredentials,
  } = useQuery({
    queryKey: ["credentials"],
    queryFn: api.listCredentials,
  });
  const {
    data: evalPresets = [],
    isLoading: presetsLoading,
    isError: presetsError,
    error: presetsQueryError,
    refetch: refetchPresets,
  } = useQuery({
    queryKey: ["eval-presets"],
    queryFn: api.listEvalPresets,
  });

  useEffect(() => {
    setApiKeyState(getApiKey() || "");
    setAuditLog(getApiKeyAuditLog());
  }, []);

  const refreshAuditLog = () => setAuditLog(getApiKeyAuditLog());

  const handleSave = () => {
    if (apiKey.trim()) {
      setApiKey(apiKey.trim());
      refreshAuditLog();
      toast.success("API key saved");
    } else {
      clearApiKey();
      refreshAuditLog();
      toast.info("API key cleared");
    }
  };

  const handleRotate = () => {
    if (!apiKey.trim()) {
      toast.error("Enter a new API key before rotating");
      return;
    }
    rotateApiKey(apiKey.trim());
    refreshAuditLog();
    toast.success("API key rotated");
  };

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
      await queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setCredName("");
      setCredConfig({});
      setCredFieldErrors({});
      toast.success(`Credential "${created.name}" saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save credential");
    } finally {
      setSavingCred(false);
    }
  };

  const handleCreateEvalPreset = async () => {
    if (!presetName.trim() || !presetLabel.trim() || !presetCriteria.trim()) {
      toast.error("Name, label, and criteria are required");
      return;
    }
    setSavingPreset(true);
    try {
      await api.createEvalPreset({
        name: presetName.trim(),
        label: presetLabel.trim(),
        criteria: presetCriteria.trim(),
        instruction: presetInstruction.trim() || undefined,
        score_weights: {
          faithfulness: 0.3,
          helpfulness: 0.3,
          relevance: 0.25,
          toxicity: 0.15,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["eval-presets"] });
      setPresetName("");
      setPresetLabel("");
      setPresetCriteria("");
      setPresetInstruction("");
      toast.success("Eval preset saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save preset");
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeleteEvalPreset = async (id: string) => {
    try {
      await api.deleteEvalPreset(id);
      await queryClient.invalidateQueries({ queryKey: ["eval-presets"] });
      toast.success("Eval preset deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete preset");
    }
  };

  const handleDeleteCredential = async (id: string) => {
    try {
      await api.deleteCredential(id);
      await queryClient.invalidateQueries({ queryKey: ["credentials"] });
      toast.success("Credential deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete credential");
    }
  };

  if (credentialsError || presetsError) {
    return (
      <div className="page-container">
        <ApiConnectionState
          description="Settings data could not be loaded. Check the API target, then retry."
          error={credentialsQueryError || presetsQueryError}
          onRetry={() => {
            void refetchCredentials();
            void refetchPresets();
          }}
        />
      </div>
    );
  }

  const customEvalPresets = evalPresets.filter((p) => p.source === "custom");

  return (
    <div className="page-container space-y-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-foreground sm:text-[32px] sm:leading-10">
          Settings
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted">
          API access, credentials, eval presets, and alerts.
        </p>
      </div>

      {/* 1 · API key */}
      <SettingsSection
        id="settings-api"
        title="API key"
        description="Local request identity for secured backend calls (X-Aegis-API-Key)."
      >
        <div className="space-y-1.5">
          <Label htmlFor="api-key">Key</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="your-aegis-api-key"
            className="max-w-xl font-mono text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleRotate}>
            Rotate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setApiKeyState("");
              clearApiKey();
              refreshAuditLog();
              toast.info("API key cleared");
            }}
          >
            Clear
          </Button>
        </div>
        {auditLog.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-muted">
              Audit · {auditLog.length}
            </p>
            <ul className="max-h-36 space-y-1 overflow-y-auto font-mono text-2xs text-subtle">
              {auditLog.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex justify-between gap-3">
                  <span className="capitalize text-muted">{entry.action}</span>
                  <span>
                    {entry.keyHint ?? "—"} · {new Date(entry.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SettingsSection>

      {/* 2 · Credentials */}
      <SettingsSection
        id="settings-credentials"
        title="Credentials"
        description="Named secrets for Slack, Discord, Email, and Postgres nodes."
      >
        {credentialsLoading ? (
          <LoadingState variant="list" />
        ) : credentials.length === 0 ? (
          <p className="text-sm text-muted">No credentials yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {credentials.map((cred) => (
              <li
                key={cred.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{cred.name}</p>
                  <p className="font-mono text-2xs capitalize text-subtle">{cred.type}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete credential ${cred.name}`}
                  onClick={() =>
                    setDeleteTarget({ type: "credential", id: cred.id, name: cred.name })
                  }
                >
                  <Trash2 className="h-4 w-4 text-muted" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted">Add credential</p>
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
                  setCredType(value as IntegrationType);
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
      </SettingsSection>

      {/* 3 · Eval presets */}
      <SettingsSection
        id="settings-presets"
        title="Eval presets"
        description="Reusable grading criteria for evaluation nodes."
      >
        {presetsLoading ? (
          <LoadingState variant="list" />
        ) : customEvalPresets.length === 0 ? (
          <p className="text-sm text-muted">No custom presets yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {customEvalPresets.map((preset) => (
              <li
                key={preset.id}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{preset.label}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{preset.criteria}</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">{preset.criteria}</TooltipContent>
                  </Tooltip>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete preset ${preset.label}`}
                  onClick={() =>
                    setDeleteTarget({ type: "preset", id: preset.id, name: preset.label })
                  }
                >
                  <Trash2 className="h-4 w-4 text-muted" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted">Create preset</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("preset-name")}>Internal name</Label>
              <Input
                id={fieldId("preset-name")}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="support_quality_v2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("preset-label")}>Display label</Label>
              <Input
                id={fieldId("preset-label")}
                value={presetLabel}
                onChange={(e) => setPresetLabel(e.target.value)}
                placeholder="Support Quality v2"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("preset-criteria")}>Criteria</Label>
            <Textarea
              id={fieldId("preset-criteria")}
              rows={2}
              value={presetCriteria}
              onChange={(e) => setPresetCriteria(e.target.value)}
              placeholder="Tone, accuracy, and resolution quality"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("preset-instruction")}>LLM instruction (optional)</Label>
            <Textarea
              id={fieldId("preset-instruction")}
              rows={2}
              value={presetInstruction}
              onChange={(e) => setPresetInstruction(e.target.value)}
              placeholder="Override the default grading instruction"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleCreateEvalPreset}
            disabled={savingPreset}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {savingPreset ? "Saving…" : "Add preset"}
          </Button>
        </div>
      </SettingsSection>

      {/* 4 · Alerts + ops */}
      <AlertsCard />
      <OpsConfigCard />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === "credential" ? "Delete credential?" : "Delete eval preset?"
        }
        description={
          deleteTarget?.type === "credential"
            ? "This will break any workflow that uses this credential. The change cannot be undone."
            : deleteTarget?.type === "preset"
              ? "Workflows still referencing this preset will fall back to defaults."
              : ""
        }
        confirmLabel={
          deleteTarget
            ? deleteTarget.type === "credential"
              ? `Delete credential '${deleteTarget.name}'`
              : `Delete preset '${deleteTarget.name}'`
            : "Delete"
        }
        loadingLabel={
          deleteTarget?.type === "credential"
            ? "Deleting credential…"
            : deleteTarget?.type === "preset"
              ? "Deleting preset…"
              : "Deleting…"
        }
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "credential") {
            await handleDeleteCredential(deleteTarget.id);
          } else {
            await handleDeleteEvalPreset(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
