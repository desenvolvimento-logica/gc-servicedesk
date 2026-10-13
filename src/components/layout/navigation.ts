import { CircleHelp, FileText, House, SquarePlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const navIcons = {
  home: House,
  "new-request": SquarePlus,
  requests: FileText,
  help: CircleHelp,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof navIcons;

/** Serializable, so the server can pass role-specific items to the client sidebar. */
export type NavItem = {
  title: string;
  href: string;
  icon: NavIconName;
};

/**
 * Application routes shown in the sidebar. These are app screens, not
 * services: the service catalog is always loaded from the database.
 *
 * Operator and administrator entries are added in Phase 2, once roles are
 * resolved server-side from the authenticated profile.
 */
export const requesterNavigation: readonly NavItem[] = [
  { title: "Início", href: "/", icon: "home" },
  { title: "Nova Solicitação", href: "/requests/new", icon: "new-request" },
  { title: "Minhas Solicitações", href: "/requests", icon: "requests" },
  { title: "Ajuda", href: "/help", icon: "help" },
];

/** Whether `href` is the active entry for `pathname`, preferring the most specific match. */
export function isNavItemActive(href: string, pathname: string, items: readonly NavItem[]): boolean {
  const matches = (candidate: string) =>
    candidate === "/" ? pathname === "/" : pathname === candidate || pathname.startsWith(`${candidate}/`);

  if (!matches(href)) return false;

  // A longer matching entry (e.g. /requests/new vs /requests) wins.
  return !items.some((item) => item.href.length > href.length && matches(item.href));
}
