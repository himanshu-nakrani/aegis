import {
  BarChart3,
  Settings,
  Shield,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Workflows", exact: true, icon: Workflow },
  { href: "/observability", label: "Observability", icon: BarChart3 },
  { href: "/guardrails", label: "Guardrails", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) {
    // Workflows is home; keep it active on workflow/template subroutes too.
    return (
      pathname === href ||
      pathname.startsWith("/workflows") ||
      pathname.startsWith("/templates")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
