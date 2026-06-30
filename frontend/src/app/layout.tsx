import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { ObservabilityStreamProvider } from "@/providers/ObservabilityStreamProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import "./globals.css";

const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((mod) => mod.Toaster),
  { ssr: false }
);

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Aegis — Visual Agent Development",
  description: "Build, run, and evaluate agent workflows with guardrails",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${jetbrainsMono.variable} min-h-screen bg-background font-sans antialiased`}>
        <QueryProvider>
          <ObservabilityStreamProvider>
            <AppShell>{children}</AppShell>
          </ObservabilityStreamProvider>
        </QueryProvider>
        <Toaster />
      </body>
    </html>
  );
}