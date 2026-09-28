import {
  BarChart3,
  KeyRound,
  LayoutTemplate,
  Settings,
  Shield,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** One-line purpose, shown by the expanded rail and the command palette. */
  description: string;
  exact?: boolean;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  {
    href: "/",
    label: "Workflows",
    description: "Browse, edit, and version workflow graphs",
    exact: true,
    icon: Workflow,
  },
  {
    href: "/templates",
    label: "Templates",
    description: "Clone production-ready workflow patterns",
    icon: LayoutTemplate,
  },
  {
    href: "/observability",
    label: "Observability",
    description: "Inspect runs, quality, traces, and scheduler health",
    icon: BarChart3,
  },
  {
    href: "/guardrails",
    label: "Guardrails",
    description: "Preview policy checks before wiring nodes",
    icon: Shield,
  },
  {
    href: "/credentials",
    label: "Credentials",
    description: "Manage integration and provider secrets",
    icon: KeyRound,
  },
  {
    href: "/settings",
    label: "Settings",
    description: "API auth, eval rubrics, and alerts",
    icon: Settings,
  },
];

export function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) {
    // Workflows is home; keep it active on workflow subroutes too.
    // Templates owns its own active state via the /templates nav item.
    return pathname === href || pathname.startsWith("/workflows");
  }
  // Run detail pages (/runs/*) belong to Observability.
  if (href === "/observability" && pathname.startsWith("/runs")) {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Canvas routes own the full viewport (no app rail); everything else is shell. */
export function isCanvasRoute(pathname: string): boolean {
  return pathname.startsWith("/workflows/") && pathname !== "/workflows/new";
}
