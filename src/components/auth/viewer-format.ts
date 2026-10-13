import type { Viewer } from "@/server/auth/viewer";

/** Up to two initials from a person's name ("Ana Paula Bovi" -> "AB"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function roleLabel(viewer: Pick<Viewer, "isAdministrator" | "isOperator">): string {
  if (viewer.isAdministrator) return "Administrador";
  if (viewer.isOperator) return "Operador";
  return "Solicitante";
}
