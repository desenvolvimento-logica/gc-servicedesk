import "server-only";

import { createAcessoriasClient } from "@/server/acessorias/client";
import { getSyncEnv } from "@/server/env";
import { createSupabaseAdminClient } from "@/server/supabase/admin-client";

import { syncCompanies, type SyncResult, type SyncStore, type SyncTrigger } from "./sync";

/** A run older than this is considered dead (function killed) and no longer blocks new runs. */
const STALE_RUN_MINUTES = 10;
const UPSERT_CHUNK = 500;

function supabaseStore(secretKey: string): SyncStore {
  const db = createSupabaseAdminClient(secretKey);
  const fail = (what: string, error: { message: string }) => new Error(`Falha ao ${what}: ${error.message}`);

  return {
    async hasRunningRun() {
      const since = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
      const { count, error } = await db
        .from("gestao_cadastros_company_sync_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .gte("started_at", since);
      if (error) throw fail("consultar sincronizações", error);
      return (count ?? 0) > 0;
    },

    async lastSuccessfulCursor() {
      const { data, error } = await db
        .from("gestao_cadastros_company_sync_runs")
        .select("cursor")
        .eq("status", "success")
        .not("cursor", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw fail("consultar a última sincronização", error);
      return typeof data?.cursor === "string" ? data.cursor : null;
    },

    async startRun(run) {
      const { data, error } = await db
        .from("gestao_cadastros_company_sync_runs")
        .insert({ trigger: run.trigger, mode: run.mode, actor_id: run.actorId, actor_name: run.actorName })
        .select("id")
        .single();
      if (error) throw fail("registrar a sincronização", error);
      return Number(data.id);
    },

    async upsertCompanies(rows) {
      for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
        const { error } = await db
          .from("gestao_cadastros_companies")
          .upsert(rows.slice(index, index + UPSERT_CHUNK), { onConflict: "acessorias_id" });
        if (error) throw fail("gravar empresas", error);
      }
    },

    async finishRun(runId, result) {
      const { error } = await db
        .from("gestao_cadastros_company_sync_runs")
        .update({ ...result, finished_at: new Date().toISOString() })
        .eq("id", runId);
      if (error) throw fail("concluir o registro da sincronização", error);
    },
  };
}

export type RunSyncResult = SyncResult | { status: "not-configured"; message: string };

/**
 * Runs the Acessórias company sync on the server. Callers must already have
 * authorized the request (Vercel Cron secret or an administrator session).
 */
export async function runCompanySync(trigger: SyncTrigger, actor: { id: number; name: string } | null): Promise<RunSyncResult> {
  const env = getSyncEnv();
  if (!env) {
    return {
      status: "not-configured",
      message: "Integração com o Acessórias não configurada (ACESSORIAS_API_TOKEN e SUPABASE_SECRET_KEY).",
    };
  }

  return syncCompanies({
    client: createAcessoriasClient(env.ACESSORIAS_API_TOKEN),
    store: supabaseStore(env.SUPABASE_SECRET_KEY),
    trigger,
    actor,
  });
}
