import type { Metadata } from "next";
import dynamic from "next/dynamic";
import localFont from "next/font/local";
import { AppShell } from "@/components/layout/AppShell";
import { ObservabilityStreamProvider } from "@/providers/ObservabilityStreamProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import "./globals.css";

const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((mod) => mod.Toaster),
  { ssr: false }
);

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
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
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}>
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