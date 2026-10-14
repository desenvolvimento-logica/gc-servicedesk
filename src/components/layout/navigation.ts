import { Building2, ChartColumn, CircleHelp, FileText, Headset, House, Settings, SquarePlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const navIcons = {
  home: House,
  "new-request": SquarePlus,
  requests: FileText,
  help: CircleHelp,
  queue: Headset,
  reports: ChartColumn,
  services: Settings,
  departments: Building2,
  users: Users,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof navIcons;

/** Serializable, so the server can pass role-specific items to the client sidebar. */
export type NavItem = {
  title: string;
  href: string;
  icon: NavIconName;
};

export type NavSection = {
  /** Omitted for the main section. */
  title?: string;
  items: NavItem[];
};

/** Whether `href` is the active entry for `pathname`, preferring the most specific match. */
export function isNavItemActive(href: string, pathname: string, items: readonly NavItem[]): boolean {
  const matches = (candidate: string) =>
    candidate === "/" ? pathname === "/" : pathname === candidate || pathname.startsWith(`${candidate}/`);

  if (!matches(href)) return false;

  // A longer matching entry (e.g. /requests/new vs /requests) wins.
  return !items.some((item) => item.href.length > href.length && matches(item.href));
}
