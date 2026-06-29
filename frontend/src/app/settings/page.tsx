"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Key } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="mx-auto max-w-xl space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
          <p className="text-slate-400">Authentication and platform configuration</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-sky-400" />
            API Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">
            When backend auth is enabled, set your Aegis API key here. It is sent as
            the <code className="text-slate-300">X-Aegis-API-Key</code> header on all requests.
          </p>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="your-aegis-api-key"
            />
          </div>
          <Button onClick={handleSave}>Save API Key</Button>
        </CardContent>
      </Card>
    </div>
  );
}