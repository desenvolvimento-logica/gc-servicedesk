import "server-only";

import { z } from "zod";

import { GC_ROLES, type AdminUser, type RoleEvent } from "@/lib/admin/users";
import { requireAdministrator } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * User/role administration reads. Administrators only: checked here and by
 * the database (RPC role check; RLS on the role history).
 */

const userRowSchema = z.object({
  user_id: z.number().int(),
  name: z.string(),
  email: z.string(),
  department_name: z.string().nullable(),
  linked: z.boolean(),
  can_open_requests: z.boolean(),
  is_operator: z.boolean(),
  is_administrator: z.boolean(),
});

export async function listAdminUsers(): Promise<AdminUser[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("gestao_cadastros_admin_users");
  if (error) throw new Error(`Failed to load users: ${error.message}`);

  return z
    .array(userRowSchema)
    .parse(data)
    .map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      departmentName: row.department_name,
      linked: row.linked,
      canOpenRequests: row.can_open_requests,
      isOperator: row.is_operator,
      isAdministrator: row.is_administrator,
    }));
}

const eventRowSchema = z.object({
  id: z.number().int(),
  user_name: z.string().nullable(),
  role: z.enum(GC_ROLES),
  granted: z.boolean(),
  actor_name: z.string().nullable(),
  created_at: z.string(),
});

export const ROLE_HISTORY_LIMIT = 30;

export async function listRoleEvents(): Promise<RoleEvent[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("gestao_cadastros_role_events")
    .select("id, user_name, role, granted, actor_name, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ROLE_HISTORY_LIMIT);
  if (error) throw new Error(`Failed to load role history: ${error.message}`);

  return z
    .array(eventRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      userName: row.user_name,
      role: row.role,
      granted: row.granted,
      actorName: row.actor_name,
      createdAt: row.created_at,
    }));
}
