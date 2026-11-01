"use client";

import { useEffect, useState } from "react";
import { Compass, Moon, Rows3, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertsCard, OpsConfigCard } from "@/components/settings/AlertsCard";
import { EvalRubricCard } from "@/components/settings/EvalRubricCard";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { MCPServersPanel } from "@/components/credentials/MCPServersPanel";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/layout/Page";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/providers/ThemeProvider";
import { useDensity } from "@/hooks/use-density";
import {
  clearApiKey,
  getApiKey,
  getApiKeyAuditLog,
  rotateApiKey,
  setApiKey,
  type ApiKeyAuditEntry,
} from "@/lib/auth";
import { formatFullTimestamp } from "@/lib/format-date";
import { resetOnboarding } from "@/lib/onboarding";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { density, mounted: densityMounted, setDensity } = useDensity();
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKeyState] = useState("");
  const [auditLog, setAuditLog] = useState<ApiKeyAuditEntry[]>([]);

  useEffect(() => {
    setMounted(true);
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

  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Manage appearance, access, and operational preferences."
      />

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        <SettingsNav />
        <div className="space-y-6">
      {/* 0 · Appearance */}
      <SettingsSection
        id="settings-appearance"
        title="Appearance"
        description="Theme and interface density."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input text-muted">
              {/* Both icons in the markup, CSS picks one so server/client HTML
                  match — the theme class is applied pre-hydration. */}
              <Moon className="hidden h-4 w-4 dark:block" aria-hidden />
              <Sun className="h-4 w-4 dark:hidden" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Color theme</p>
            </div>
          </div>
          {mounted ? (
            <SegmentedControl
              ariaLabel="Color theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "dark", label: "Dark", icon: Moon },
                { value: "light", label: "Light", icon: Sun },
              ]}
            />
          ) : (
            /* Reserved footprint: the stored theme is unknown until after mount,
               and painting the control before then would flash the wrong side. */
            <div
              aria-hidden
              className="h-[34px] w-[147px] shrink-0 rounded-lg border border-border bg-surface-input"
            />
          )}
        </div>
        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input text-muted">
              <Rows3 className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Density</p>
              <p className="mt-0.5 text-xs text-muted">
                Controls spacing across lists and cards.
              </p>
            </div>
          </div>
          {densityMounted ? (
            <SegmentedControl
              ariaLabel="Interface density"
              value={density}
              onChange={setDensity}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
          ) : (
            /* Same footprint as the mounted control (measured 172×34) so the
               swap never shifts the row. */
            <div
              aria-hidden
              className="h-[34px] w-[172px] shrink-0 rounded-lg border border-border bg-surface-input"
            />
          )}
        </div>
      </SettingsSection>

      {/* 1 · Onboarding */}
      <SettingsSection
        id="settings-onboarding"
        title="Onboarding"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input text-muted">
              <Compass className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Tips &amp; tour</p>
              <p className="mt-0.5 text-xs text-muted">
                Restore dismissed guides and the canvas tour.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              resetOnboarding();
              toast.success("Tips & tour restored");
            }}
          >
            Replay
          </Button>
        </div>
      </SettingsSection>

      {/* 2 · API key */}
      <SettingsSection
        id="settings-api"
        title="API key"
        description="Used to authenticate secured API requests."
      >
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="your-aegis-api-key"
              className="font-mono text-sm"
            />
          </div>
          <Button type="submit" size="sm" className="w-full sm:w-auto">
            Save
          </Button>
        </form>
        <details className="rounded-md border border-border bg-surface-input px-3 py-2">
          <summary className="focus-ring cursor-pointer text-xs font-medium text-foreground">
            More key actions
          </summary>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button type="button" size="sm" variant="outline" onClick={handleRotate}>
              Rotate key
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
              Clear key
            </Button>
          </div>
        </details>
        {auditLog.length > 0 && (
          <details className="border-t border-border pt-3">
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 text-2xs font-medium uppercase tracking-wider text-muted [&::-webkit-details-marker]:hidden">
              <span>Audit history</span>
              <span className="font-mono tabular-nums">{auditLog.length}</span>
            </summary>
            <ul className="max-h-36 space-y-1 overflow-y-auto font-mono text-2xs text-subtle">
              {auditLog.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex justify-between gap-3">
                  <span className="capitalize text-muted">{entry.action}</span>
                  <span>
                    {entry.keyHint ?? "—"} · {formatFullTimestamp(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </SettingsSection>

      <MCPServersPanel id="settings-mcp" />

      {/* 4 · Eval rubrics */}
      <EvalRubricCard />

      {/* 5 · Alerts + ops */}
      <AlertsCard />
      <OpsConfigCard />
        </div>
      </div>
    </Page>
  );
}
