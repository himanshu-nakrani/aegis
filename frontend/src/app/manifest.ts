import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aegis — Visual Agent Development",
    short_name: "Aegis",
    description: "Build, run, and evaluate agent workflows with guardrails",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "any",
    categories: ["productivity", "developer"],
  };
}