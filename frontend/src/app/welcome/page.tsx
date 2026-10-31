import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  // Marketing page: the root "%s · Aegis" template would double the brand
  // ("… workbench · Aegis"), so this route opts out with an absolute title.
  title: { absolute: "Aegis — The self-hosted agent workbench" },
  description:
    "Build agent workflows on a canvas, guard them with policies, grade them with evals, and operate them from one self-hosted, model-neutral workbench.",
  openGraph: {
    title: "Aegis — The self-hosted agent workbench",
    description:
      "Build → Guard → Grade → Operate. Visual agent workflows with guardrails, evals, and observability built in.",
  },
};

export default function WelcomePage() {
  return <LandingPage />;
}
