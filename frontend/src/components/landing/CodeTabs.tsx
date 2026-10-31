"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

export type CodeTab = { name: string; code: string; caption: string };

/** Minimal shell/YAML tinting: comments recede, commands and keys step forward. */
function tint(line: string) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) return <span className="text-subtle">{line}</span>;
  const cmd = line.match(/^(\s*)(curl|aegis gate|pip install)(.*)$/);
  if (cmd)
    return (
      <>
        {cmd[1]}
        <span className="text-foreground">{cmd[2]}</span>
        {cmd[3]}
      </>
    );
  const key = line.match(/^(\s*-?\s*)([a-zA-Z_-]+:)(.*)$/);
  if (key)
    return (
      <>
        {key[1]}
        <span className="text-foreground">{key[2]}</span>
        {key[3]}
      </>
    );
  return line;
}

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const tab = tabs[active];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-input shadow-elev-1">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div role="tablist" aria-label="Code examples" className="flex items-center gap-0.5 font-mono text-2xs">
          {tabs.map((t, i) => (
            <button
              key={t.name}
              role="tab"
              type="button"
              id={`${base}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                setActive(next);
                document.getElementById(`${base}-tab-${next}`)?.focus();
              }}
              className={cn(
                "focus-ring rounded-sm px-2 py-1 transition-colors duration-1",
                i === active ? "bg-surface-hover text-foreground" : "text-subtle hover:text-muted"
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} label={`Copy ${tab.name}`} />
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`}>
        <pre className="min-h-[15.5rem] overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.75] text-muted">
          <code>
            {tab.code.split("\n").map((line, i) => (
              <span key={i} className="block">
                {tint(line) || "\u00a0"}
              </span>
            ))}
          </code>
        </pre>
        <p className="border-t border-border px-5 py-2.5 font-mono text-2xs text-subtle">{tab.caption}</p>
      </div>
    </div>
  );
}
