import type { Metadata } from "next";

// The credentials page is a client component, so the tab title is set here;
// the root layout's "%s · Aegis" template supplies the suffix.
export const metadata: Metadata = { title: "Credentials" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
