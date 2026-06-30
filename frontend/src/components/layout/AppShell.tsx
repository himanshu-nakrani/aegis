"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppNav } from "@/components/layout/AppNav";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ShortcutsHelp } from "@/components/layout/ShortcutsHelp";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isEditableTarget } from "@/lib/shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onCanvas = pathname.startsWith("/workflows/") && pathname !== "/workflows/new";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "?" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const content = (
    <>
      {!onCanvas && (
        <>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <AppNav onOpenCommandPalette={openPalette} onOpenShortcutsHelp={openHelp} />
        </>
      )}
      <ErrorBoundary title="Something went wrong">
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </ErrorBoundary>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} onCanvas={onCanvas} />
    </>
  );

  return <div className="app-shell">{content}</div>;
}