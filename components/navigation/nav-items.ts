import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Users,
  UserCircle,
  Handshake,
  Trophy,
  Sparkles,
  BarChart3,
  Settings,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Business",
    items: [
      { label: "Inventory", href: "/app/inventory", icon: Package },
      { label: "Leads", href: "/app/leads", icon: Users },
      { label: "Deals", href: "/app/deals", icon: Handshake },
      { label: "Sales", href: "/app/sales", icon: Trophy },
      { label: "Customers", href: "/app/customers", icon: UserCircle },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "AI Intelligence", href: "/app/intelligence", icon: Sparkles },
      { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", href: "/app/settings", icon: Settings }],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
}
