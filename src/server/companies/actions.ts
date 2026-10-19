"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/catalog/types";
import type { Company } from "@/lib/companies/types";
import { getAdministrator, getSession } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";

import { searchActiveCompanies } from "./queries";
import { runCompanySync } from "./run-sync";

/** Company picker search (anyone with access to the service desk; RLS applies too). */
export async function searchCompanies(term: unknown): Promise<ActionResult<Company[]>> {
  const session = await getSession();
  if (session.status !== "authorized") return { ok: false, message: FORBIDDEN_MESSAGE };

  const parsed = z.string().max(200).safeParse(term ?? "");
  if (!parsed.success) return { ok: false, message: "Busca inválida." };

  try {
    return { ok: true, data: await searchActiveCompanies(parsed.data) };
  } catch {
    return { ok: false, message: "Não foi possível buscar as empresas. Tente novamente." };
  }
}

/**
 * "Sincronizar agora" / "Sincronização completa" (administrators). Runs on
 * the server with the secret key.
 */
export async function syncCompaniesNow(full: unknown = false): Promise<ActionResult<{ upserted: number }>> {
  const admin = await getAdministrator();
  if (!admin) return { ok: false, message: FORBIDDEN_MESSAGE };

  const parsed = z.boolean().safeParse(full);
  if (!parsed.success) return { ok: false, message: "Opção de sincronização inválida." };

  const result = await runCompanySync("manual", { id: admin.userId, name: admin.name }, { full: parsed.data });
  refresh();

  switch (result.status) {
    case "success":
      return { ok: true, data: { upserted: result.upserted } };
    case "skipped":
    case "not-configured":
      return { ok: false, message: result.message };
    case "error":
      return { ok: false, message: `A sincronização falhou: ${result.message}` };
  }
}
