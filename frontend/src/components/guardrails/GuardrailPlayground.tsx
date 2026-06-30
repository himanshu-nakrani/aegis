"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { GuardrailMode, GuardrailType } from "@/types/workflow";

export function GuardrailPlayground() {
  const [sample, setSample] = useState("Contact me at user@example.com or visit https://evil.test");
  const [guardrailType, setGuardrailType] = useState<GuardrailType>("rules");
  const [mode, setMode] = useState<GuardrailMode>("output");
  const [keywords, setKeywords] = useState("spam, banned");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    passed: boolean;
    message: string;
    would_block: boolean;
  } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await api.previewGuardrail(sample, {
        guardrail_type: guardrailType,
        mode,
        fail_behavior: "block",
        blocked_keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        detect_pii: guardrailType === "presidio",
      });
      setResult(response);
    } catch {
      setResult({ passed: false, message: "Preview request failed", would_block: false });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Test guardrail rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={guardrailType}
              onChange={(e) => setGuardrailType(e.target.value as GuardrailType)}
            >
              <option value="rules">Rules</option>
              <option value="presidio">Presidio PII</option>
              <option value="prompt_injection">Prompt injection</option>
              <option value="llm">LLM classifier</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as GuardrailMode)}>
              <option value="output">Output</option>
              <option value="input">Input</option>
            </Select>
          </div>
        </div>
        {guardrailType === "rules" && (
          <div className="space-y-2">
            <Label>Blocked keywords (comma-separated)</Label>
            <Textarea rows={2} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label>Sample text</Label>
          <Textarea rows={5} value={sample} onChange={(e) => setSample(e.target.value)} />
        </div>
        <Button onClick={handleTest} disabled={testing}>
          {testing ? "Testing…" : "Run preview"}
        </Button>
        {result && (
          <p className={`text-sm ${result.passed ? "text-success" : "text-destructive"}`}>
            {result.message}
            {result.would_block ? " — would block workflow" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}