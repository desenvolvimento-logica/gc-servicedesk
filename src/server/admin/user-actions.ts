"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { GC_ROLES } from "@/lib/admin/users";
import type { ActionResult } from "@/lib/catalog/types";
import { getAdministrator } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { roleErrorMessage } from "./role-errors";

const argsSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(GC_ROLES),
  granted: z.boolean(),
});

/**
 * Grants or revokes a GC role. Re-checks the administrator role; the
 * database checks it again, blocks self/last-administrator removal and
 * records the change in the role history.
 */
export async function setUserRole(userId: unknown, role: unknown, granted: unknown): Promise<ActionResult> {
  if (!(await getAdministrator())) return { ok: false, message: FORBIDDEN_MESSAGE };

  const args = argsSchema.safeParse({ userId, role, granted });
  if (!args.success) return { ok: false, message: "Dados inválidos. Atualize a página e tente novamente." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gestao_cadastros_set_user_role", {
    p_user_id: args.data.userId,
    p_role: args.data.role,
    p_granted: args.data.granted,
  });
  refresh();
  return error ? { ok: false, message: roleErrorMessage(error) } : { ok: true, data: undefined };
}
