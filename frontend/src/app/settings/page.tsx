"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Key, Plug, Shield, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { clearApiKey, getApiKey, setApiKey } from "@/lib/auth";
import { Textarea } from "@/components/ui/textarea";
import type { IntegrationType } from "@/types/workflow";

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

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKeyState] = useState("");
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState<IntegrationType>("slack");
  const [credConfig, setCredConfig] = useState<Record<string, string>>({});
  const [savingCred, setSavingCred] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetLabel, setPresetLabel] = useState("");
  const [presetCriteria, setPresetCriteria] = useState("");
  const [presetInstruction, setPresetInstruction] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const { data: credentials = [] } = useQuery({
    queryKey: ["credentials"],
    queryFn: api.listCredentials,
  });
  const { data: evalPresets = [] } = useQuery({
    queryKey: ["eval-presets"],
    queryFn: api.listEvalPresets,
  });

  useEffect(() => {
    setApiKeyState(getApiKey() || "");
  }, []);

  const handleSave = () => {
    if (apiKey.trim()) {
      setApiKey(apiKey.trim());
      toast.success("API key saved");
    } else {
      clearApiKey();
      toast.info("API key cleared");
    }
  };

  const handleCreateCredential = async () => {
    if (!credName.trim()) {
      toast.error("Credential name is required");
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

  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Settings"
        description="Authentication, credentials, and platform configuration."
        back={
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        }
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            API Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-xl border border-border bg-surface p-4">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-sm text-muted">
              When backend auth is enabled, set your Aegis API key here. It is sent as the{" "}
              <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-foreground">
                X-Aegis-API-Key
              </code>{" "}
              header on all requests.
            </p>
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
          <div className="flex gap-2">
            <Button onClick={handleSave}>Save API Key</Button>
            <Button
              variant="outline"
              onClick={() => {
                setApiKeyState("");
                clearApiKey();
                toast.info("API key cleared");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-accent" />
            Custom Eval Presets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted">
            Define reusable LLM evaluation criteria and dimension weights for workflow eval nodes.
          </p>

          {evalPresets.filter((p) => p.source === "custom").length > 0 && (
            <ul className="space-y-2">
              {evalPresets
                .filter((p) => p.source === "custom")
                .map((preset) => (
                  <li
                    key={preset.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{preset.label}</p>
                      <p className="text-xs text-muted line-clamp-2">{preset.criteria}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEvalPreset(preset.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted" />
                    </Button>
                  </li>
                ))}
            </ul>
          )}

          <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
            <div className="space-y-2">
              <Label>Internal name</Label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="support_quality_v2"
              />
            </div>
            <div className="space-y-2">
              <Label>Display label</Label>
              <Input
                value={presetLabel}
                onChange={(e) => setPresetLabel(e.target.value)}
                placeholder="Support Quality v2"
              />
            </div>
            <div className="space-y-2">
              <Label>Criteria</Label>
              <Textarea
                rows={3}
                value={presetCriteria}
                onChange={(e) => setPresetCriteria(e.target.value)}
                placeholder="Tone, accuracy, and resolution quality for support replies"
              />
            </div>
            <div className="space-y-2">
              <Label>LLM instruction (optional)</Label>
              <Textarea
                rows={3}
                value={presetInstruction}
                onChange={(e) => setPresetInstruction(e.target.value)}
                placeholder="Override the default grading instruction"
              />
            </div>
            <Button onClick={handleCreateEvalPreset} disabled={savingPreset}>
              {savingPreset ? "Saving…" : "Add eval preset"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-accent" />
            Integration Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted">
            Named credentials for Slack, Email, and Postgres integration nodes.
          </p>

          {credentials.length > 0 && (
            <ul className="space-y-2">
              {credentials.map((cred) => (
                <li
                  key={cred.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{cred.name}</p>
                    <p className="text-xs text-muted capitalize">{cred.type}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteCredential(cred.id)}
                  >
                    <Trash2 className="h-4 w-4 text-muted" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                placeholder="slack_default"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={credType}
                onChange={(e) => {
                  setCredType(e.target.value as IntegrationType);
                  setCredConfig({});
                }}
              >
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="email">Email</option>
                <option value="postgres">Postgres</option>
              </Select>
            </div>
            {CONFIG_HINTS[credType].map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input
                  type={field.secret ? "password" : "text"}
                  value={credConfig[field.key] || ""}
                  onChange={(e) =>
                    setCredConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              </div>
            ))}
            <Button onClick={handleCreateCredential} disabled={savingCred}>
              {savingCred ? "Saving…" : "Add credential"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}