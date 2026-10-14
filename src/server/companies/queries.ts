import "server-only";

import { z } from "zod";

import { companySearchTerm, type Company, type CompanySyncRun } from "@/lib/companies/types";
import { requireAdministrator } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/** Company reads with the user's session (RLS: anyone with access; sync log: administrators). */

const companyRowSchema = z.object({
  acessorias_id: z.number().int(),
  document: z.string(),
  legal_name: z.string(),
  trade_name: z.string().nullable(),
  active: z.boolean(),
  uf: z.string().nullable(),
});

const COMPANY_COLUMNS = "acessorias_id, document, legal_name, trade_name, active, uf";

const toCompany = (row: z.infer<typeof companyRowSchema>): Company => ({
  id: row.acessorias_id,
  document: row.document,
  legalName: row.legal_name,
  tradeName: row.trade_name,
  active: row.active,
  uf: row.uf,
});

/** Active companies matching the term (name, trade name, CNPJ/CPF or Acessórias ID). */
export async function searchActiveCompanies(term: string, limit = 20): Promise<Company[]> {
  const supabase = await createSupabaseServerClient();
  const search = companySearchTerm(term);

  let query = supabase.from("gestao_cadastros_companies").select(COMPANY_COLUMNS).eq("active", true);
  if (search) query = query.ilike("search_text", `%${search}%`);

  const { data, error } = await query.order("legal_name").limit(limit);
  if (error) throw new Error(`Failed to search companies: ${error.message}`);
  return z.array(companyRowSchema).parse(data).map(toCompany);
}

export type CompanyPage = { items: Company[]; total: number; active: number };

export async function listCompaniesForAdmin(term: string, limit = 50): Promise<CompanyPage> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();
  const search = companySearchTerm(term);

  let query = supabase.from("gestao_cadastros_companies").select(COMPANY_COLUMNS);
  if (search) query = query.ilike("search_text", `%${search}%`);

  const [list, total, active] = await Promise.all([
    query.order("active", { ascending: false }).order("legal_name").limit(limit),
    supabase.from("gestao_cadastros_companies").select("acessorias_id", { count: "exact", head: true }),
    supabase.from("gestao_cadastros_companies").select("acessorias_id", { count: "exact", head: true }).eq("active", true),
  ]);
  const failed = [list, total, active].find((result) => result.error);
  if (failed?.error) throw new Error(`Failed to load companies: ${failed.error.message}`);

  return {
    items: z.array(companyRowSchema).parse(list.data).map(toCompany),
    total: total.count ?? 0,
    active: active.count ?? 0,
  };
}

const runRowSchema = z.object({
  id: z.number().int(),
  trigger: z.enum(["cron", "manual"]),
  mode: z.enum(["full", "incremental"]),
  status: z.enum(["running", "success", "error"]),
  actor_name: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  upserted: z.number().int(),
  error: z.string().nullable(),
});

export async function listCompanySyncRuns(limit = 10): Promise<CompanySyncRun[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gestao_cadastros_company_sync_runs")
    .select("id, trigger, mode, status, actor_name, started_at, finished_at, upserted, error")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load sync runs: ${error.message}`);

  return z
    .array(runRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      trigger: row.trigger,
      mode: row.mode,
      status: row.status,
      actorName: row.actor_name,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      upserted: row.upserted,
      error: row.error,
    }));
}
