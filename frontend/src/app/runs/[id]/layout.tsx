import type { Metadata } from "next";

// Pages under this segment are client components, so the tab title is set
// here; the root layout's "%s · Aegis" template supplies the suffix.
export const metadata: Metadata = { title: "Run" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
