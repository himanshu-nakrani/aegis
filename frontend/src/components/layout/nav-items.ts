import {
  BarChart3,
  LayoutDashboard,
  LayoutTemplate,
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
  { href: "/", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/observability", label: "Observability", icon: BarChart3 },
  { href: "/guardrails", label: "Guardrails", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
