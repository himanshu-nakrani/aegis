import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppShell } from "@/components/layout/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ObservabilityStreamProvider } from "@/providers/ObservabilityStreamProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import "./globals.css";

const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((mod) => mod.Toaster),
  { ssr: false }
);

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Aegis — Visual Agent Development",
    template: "%s · Aegis",
  },
  description:
    "Build, run, and evaluate agent workflows with guardrails, observability, and human-in-the-loop approvals.",
  keywords: [
    "agent workflows",
    "LLM",
    "evaluation",
    "guardrails",
    "observability",
    "visual canvas",
  ],
  authors: [{ name: "Aegis" }],
  creator: "Aegis",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: appUrl,
    siteName: "Aegis",
    title: "Aegis — Visual Agent Development",
    description:
      "Build, run, and evaluate agent workflows with guardrails, observability, and human-in-the-loop approvals.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aegis — Visual Agent Development",
    description:
      "Build, run, and evaluate agent workflows with guardrails, observability, and human-in-the-loop approvals.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider>
          <QueryProvider>
            <ObservabilityStreamProvider>
              <AppShell>{children}</AppShell>
            </ObservabilityStreamProvider>
          </QueryProvider>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}