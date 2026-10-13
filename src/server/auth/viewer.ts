import { z } from "zod";

/** Shape returned by `public.gestao_cadastros_my_profile()`. */
export const profileDtoSchema = z.object({
  user_id: z.number().int(),
  name: z.string(),
  email: z.string(),
  department: z.object({ id: z.number().int(), name: z.string().nullable() }).nullable(),
  roles: z.array(z.enum(["operator", "administrator"])),
  is_requester: z.boolean(),
  request_departments: z.array(z.object({ id: z.number().int(), name: z.string().nullable() })),
});

export type ProfileDto = z.infer<typeof profileDtoSchema>;

export type Department = { id: number; name: string };

/** The signed-in user's resolved permissions. Serializable (safe to pass to client components). */
export type Viewer = {
  userId: number;
  name: string;
  email: string;
  department: Department | null;
  isRequester: boolean;
  isOperator: boolean;
  isAdministrator: boolean;
  /** Operator or administrator: opens requests for any department and sees all requests. */
  isStaff: boolean;
  /** Departments the user may open requests for (own one for requesters, all active for staff). */
  requestDepartments: Department[];
};

export type ViewerResolution =
  | { status: "authorized"; viewer: Viewer }
  /** Login not linked to a corporate user (public.users). */
  | { status: "unlinked" }
  /** Linked, but neither in a requester department nor holding a GC role. */
  | { status: "no-access"; viewer: Viewer };

const toDepartment = (dept: { id: number; name: string | null }): Department => ({
  id: dept.id,
  name: dept.name ?? `Departamento ${dept.id}`,
});

export function resolveViewer(profile: ProfileDto | null): ViewerResolution {
  if (!profile) return { status: "unlinked" };

  const isOperator = profile.roles.includes("operator");
  const isAdministrator = profile.roles.includes("administrator");
  const isStaff = isOperator || isAdministrator;

  const viewer: Viewer = {
    userId: profile.user_id,
    name: profile.name,
    email: profile.email,
    department: profile.department ? toDepartment(profile.department) : null,
    isRequester: profile.is_requester,
    isOperator,
    isAdministrator,
    isStaff,
    requestDepartments: profile.request_departments.map(toDepartment),
  };

  return isStaff || profile.is_requester ? { status: "authorized", viewer } : { status: "no-access", viewer };
}

export const canOpenRequests = (viewer: Viewer) => viewer.requestDepartments.length > 0;
