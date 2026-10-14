/** Mirrors the database enum `public.gestao_cadastros_role`. */
export const GC_ROLES = ["operator", "administrator"] as const;

export type GcRole = (typeof GC_ROLES)[number];

export const gcRoleLabels: Record<GcRole, string> = {
  operator: "Operador",
  administrator: "Administrador",
};

/** A corporate user (public.users) with their GC Service Desk access. */
export type AdminUser = {
  userId: number;
  name: string;
  email: string;
  departmentName: string | null;
  /** Has signed in with Microsoft at least once. */
  linked: boolean;
  /** Member of an active requester department. */
  canOpenRequests: boolean;
  isOperator: boolean;
  isAdministrator: boolean;
};

export type RoleEvent = {
  id: number;
  userName: string | null;
  role: GcRole;
  granted: boolean;
  actorName: string | null;
  createdAt: string;
};

export const USER_FILTERS = ["all", "with-role", "operator", "administrator", "requester"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

export const userFilterLabels: Record<UserFilter, string> = {
  all: "Todos os usuários",
  "with-role": "Com papel no GC",
  operator: "Operadores",
  administrator: "Administradores",
  requester: "Solicitantes",
};

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function filterUsers(users: readonly AdminUser[], filter: UserFilter, query: string): AdminUser[] {
  const term = normalize(query.trim());
  return users.filter((user) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "with-role" && (user.isOperator || user.isAdministrator)) ||
      (filter === "operator" && user.isOperator) ||
      (filter === "administrator" && user.isAdministrator) ||
      (filter === "requester" && user.canOpenRequests);
    return matchesFilter && (!term || normalize(`${user.name} ${user.email} ${user.departmentName ?? ""}`).includes(term));
  });
}
