import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { Shield } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

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
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-950 antialiased`}>
        <header className="border-b border-slate-800 bg-slate-950/90">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
            <Link href="/" className="flex items-center gap-2 text-slate-100">
              <Shield className="h-5 w-5 text-sky-400" />
              <span className="font-semibold tracking-tight">Aegis</span>
            </Link>
            <nav className="ml-6 flex gap-4 text-sm text-slate-400">
              <Link href="/" className="hover:text-slate-200">
                Dashboard
              </Link>
              <Link href="/workflows/new" className="hover:text-slate-200">
                New Workflow
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  );
}