"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/layout/AppNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onCanvas = pathname.startsWith("/workflows/") && pathname !== "/workflows/new";

  if (onCanvas) {
    return <div className="app-shell">{children}</div>;
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main>{children}</main>
    </div>
  );
}