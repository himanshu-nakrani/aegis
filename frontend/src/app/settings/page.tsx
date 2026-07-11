"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentType, useEffect, useId, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Key,
  Mail,
  MessageCircle,
  Plug,
  Plus,
  ScrollText,
  Shield,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { GlassCard } from "@/components/ui/glass-card";
import { AlertsCard, OpsConfigCard } from "@/components/settings/AlertsCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
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

const CONFIG_HINTS: Record<IntegrationType, Array<{ key: string; label: string; secret?: boolean }>> = {
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

function SettingsSignal({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <GlassCard className="relative overflow-hidden p-0">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-accent/60 to-transparent" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="p-4">
          <p className="text-micro">{label}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-caption">{detail}</p>
        </div>
        <span className="m-4 rounded-lg border border-border bg-surface-input p-2 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </GlassCard>
  );
}

const INTEGRATION_ICON: Record<IntegrationType, ComponentType<{ className?: string }>> = {
  slack: MessageCircle,
  discord: MessageCircle,
  email: Mail,
  postgres: Database,
};

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
    { type: "credential"; id: string; name: string } | { type: "preset"; id: string; name: string } | null
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
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleDeleteCredential = async (id: string) => {
    try {
      await api.deleteCredential(id);
      await queryClient.invalidateQueries({ queryKey: ["credentials"] });
      toast.success("Credential deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
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
      <PageHeader
        title="Settings"
        description="Control authentication, reusable integrations, and evaluation policy defaults."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Workflows
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SettingsSignal
          icon={Shield}
          label="API access"
          value={apiKey.trim() ? "Configured" : "Not set"}
          detail="Stored locally for backend requests"
        />
        <SettingsSignal
          icon={Plug}
          label="Credentials"
          value={credentialsLoading ? "..." : String(credentials.length)}
          detail="Reusable integration secrets"
        />
        <SettingsSignal
          icon={Star}
          label="Eval presets"
          value={presetsLoading ? "..." : String(customEvalPresets.length)}
          detail="Custom scoring policies"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-border bg-surface-input/80 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary-muted text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <Key className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">API authentication</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Local request identity for secured backend calls.
                  </p>
                </div>
              </div>
              <Badge variant={apiKey.trim() ? "success" : "outline"}>
                {apiKey.trim() ? "Active" : "Optional"}
              </Badge>
            </div>
          </div>
          <div className="space-y-5 p-5">
            <div className="rounded-lg border border-border bg-background p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-medium text-foreground">Header contract</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Backend auth uses{" "}
                    <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-foreground">
                      X-Aegis-API-Key
                    </code>
                    . Keep this scoped to the current environment.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="your-aegis-api-key"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" onClick={handleSave}>Save key</Button>
              <Button type="button" variant="outline" onClick={handleRotate}>
                Rotate
              </Button>
              <Button
                type="button"
                variant="outline"
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

            <div className="rounded-lg border border-border bg-surface-input p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Key audit log
                  </p>
                </div>
                <Badge variant="outline">{auditLog.length} events</Badge>
              </div>
              {auditLog.length > 0 ? (
                <ul className="max-h-44 space-y-2 overflow-y-auto text-xs">
                  {auditLog.map((entry, index) => (
                    <li
                      key={`${entry.at}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                    >
                      <span className="capitalize text-foreground">{entry.action}</span>
                      <span className="shrink-0 font-mono">
                        {entry.keyHint ?? "-"} · {new Date(entry.at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                  No key changes recorded in this browser.
                </p>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-border bg-surface-input/80 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-muted text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <Star className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Custom eval presets</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Reusable grading criteria for evaluation nodes.
                  </p>
                </div>
              </div>
              <Badge variant="outline">{customEvalPresets.length} custom</Badge>
            </div>
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Preset library
              </p>
              {presetsLoading ? (
                <LoadingState variant="list" />
              ) : customEvalPresets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-background px-4 py-5">
                  <p className="text-sm font-medium text-foreground">No custom presets yet</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Add one to standardize quality checks across workflow eval nodes.
                  </p>
                </div>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {customEvalPresets.map((preset) => (
                    <li
                      key={preset.id}
                      className="focus-ring flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:border-border-strong hover:bg-surface-hover"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{preset.label}</p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="line-clamp-2 text-xs leading-5 text-muted">
                              {preset.criteria}
                            </p>
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
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-surface-input/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Create preset
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={fieldId("preset-name")}>Internal name</Label>
                  <Input
                    id={fieldId("preset-name")}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="support_quality_v2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={fieldId("preset-label")}>Display label</Label>
                  <Input
                    id={fieldId("preset-label")}
                    value={presetLabel}
                    onChange={(e) => setPresetLabel(e.target.value)}
                    placeholder="Support Quality v2"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={fieldId("preset-criteria")}>Criteria</Label>
                <Textarea
                  id={fieldId("preset-criteria")}
                  rows={3}
                  value={presetCriteria}
                  onChange={(e) => setPresetCriteria(e.target.value)}
                  placeholder="Tone, accuracy, and resolution quality for support replies"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={fieldId("preset-instruction")}>LLM instruction (optional)</Label>
                <Textarea
                  id={fieldId("preset-instruction")}
                  rows={3}
                  value={presetInstruction}
                  onChange={(e) => setPresetInstruction(e.target.value)}
                  placeholder="Override the default grading instruction"
                />
              </div>
              <Button type="button" onClick={handleCreateEvalPreset} disabled={savingPreset} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                {savingPreset ? "Saving..." : "Add eval preset"}
              </Button>
            </div>
          </div>
        </GlassCard>

        <AlertsCard />

        <OpsConfigCard />

        <GlassCard className="overflow-hidden p-0 xl:col-span-2">
          <div className="border-b border-border bg-surface-input/80 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary-muted text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <Plug className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Integration credentials</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Named secrets for Slack, Discord, Email, and Postgres nodes.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <p className="text-micro">Saved</p>
                  <p className="mt-1 font-semibold text-foreground">{credentials.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <p className="text-micro">Type</p>
                  <p className="mt-1 font-semibold capitalize text-foreground">{credType}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] max-sm:col-span-2">
                  <p className="text-micro">Required</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {REQUIRED_CREDENTIAL_FIELDS[credType].length} fields
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Saved credentials
              </p>
              {credentialsLoading ? (
                <LoadingState variant="list" />
              ) : credentials.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-background px-4 py-5">
                  <p className="text-sm font-medium text-foreground">No credentials saved yet</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Add a named secret here, then select it from integration nodes.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {credentials.map((cred) => {
                    const Icon = INTEGRATION_ICON[cred.type];
                    return (
                      <li
                        key={cred.id}
                        className="focus-ring flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:border-border-strong hover:bg-surface-hover"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{cred.name}</p>
                            <p className="text-xs text-muted capitalize">{cred.type}</p>
                          </div>
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
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-surface-input/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    New credential
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">{credType}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={fieldId("cred-name")}>Name</Label>
                  <Input
                    id={fieldId("cred-name")}
                    value={credName}
                    onChange={(e) => setCredName(e.target.value)}
                    placeholder="slack_default"
                  />
                </div>
                <div className="space-y-2">
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
                    <div key={field.key} className="space-y-2">
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
              <Button type="button" onClick={handleCreateCredential} disabled={savingCred} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                {savingCred ? "Saving..." : "Add credential"}
              </Button>
            </div>
          </div>
        </GlassCard>
      </div>

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
