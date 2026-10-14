import "server-only";

import { canOpenRequests, type Viewer } from "@/server/auth/viewer";

import type { NavItem, NavSection } from "./navigation";

/**
 * Sidebar entries for the viewer. These are app screens, not services: the
 * service catalog is always loaded from the database. Hiding an entry is a
 * convenience only — every page re-checks permissions on the server.
 */
export function buildNavigation(viewer: Viewer): NavSection[] {
  const main: NavItem[] = [{ title: "Início", href: "/", icon: "home" }];
  if (canOpenRequests(viewer)) main.push({ title: "Nova Solicitação", href: "/requests/new", icon: "new-request" });
  main.push(
    { title: "Minhas Solicitações", href: "/requests", icon: "requests" },
    { title: "Ajuda", href: "/help", icon: "help" },
  );

  const sections: NavSection[] = [{ items: main }];

  if (viewer.isStaff) {
    sections.push({
      title: "Atendimento",
      items: [
        { title: "Fila de Atendimento", href: "/queue", icon: "queue" },
        { title: "Relatórios", href: "/reports", icon: "reports" },
      ],
    });
  }

  if (viewer.isAdministrator) {
    sections.push({
      title: "Administração",
      items: [
        { title: "Serviços", href: "/admin/services", icon: "services" },
        { title: "Departamentos", href: "/admin/departments", icon: "departments" },
        { title: "Usuários", href: "/admin/users", icon: "users" },
      ],
    });
  }

  return sections;
}
