"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Key, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { clearApiKey, getApiKey, setApiKey } from "@/lib/auth";

export default function SettingsPage() {
  const [apiKey, setApiKeyState] = useState("");

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

  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Settings"
        description="Authentication and platform configuration for your Aegis workspace."
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
    </div>
  );
}