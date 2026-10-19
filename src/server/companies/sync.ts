import { laterCursor, toCompanyRow, type CompanyRow } from "@/lib/companies/normalize";

import { AcessoriasError, type AcessoriasClient } from "../acessorias/client";

/**
 * Copies Acessórias companies into gestao_cadastros_companies.
 * - First run (no successful run with a cursor): full listing.
 * - Next runs: only companies changed since the last cursor (DtLastDH).
 * - `full`: ignores the cursor and lists everything again (e.g. after new
 *   columns are added to the local copy).
 * Stops before the function time limit; an unfinished run is an error and
 * the next one starts again from the last successful cursor.
 */

export type SyncTrigger = "cron" | "manual";
export type SyncMode = "full" | "incremental";

export type SyncStore = {
  /** A run started recently and not finished (avoids overlapping runs). */
  hasRunningRun(): Promise<boolean>;
  lastSuccessfulCursor(): Promise<string | null>;
  startRun(run: { trigger: SyncTrigger; mode: SyncMode; actorId: number | null; actorName: string | null }): Promise<number>;
  upsertCompanies(rows: CompanyRow[]): Promise<void>;
  finishRun(
    runId: number,
    result: { status: "success" | "error"; pages: number; upserted: number; cursor: string | null; error: string | null },
  ): Promise<void>;
};

export type SyncOptions = {
  client: AcessoriasClient;
  store: SyncStore;
  trigger: SyncTrigger;
  actor?: { id: number; name: string } | null;
  full?: boolean;
  /** Milliseconds available before giving up (function limit minus margin). */
  timeBudgetMs?: number;
  now?: () => number;
};

export type SyncResult =
  | { status: "success"; mode: SyncMode; pages: number; upserted: number }
  | { status: "error"; mode: SyncMode; pages: number; upserted: number; message: string }
  | { status: "skipped"; message: string };

const DEFAULT_TIME_BUDGET_MS = 270_000;
/** Safety stop against an API that never returns an empty page. */
const MAX_PAGES = 2_000;

export async function syncCompanies(options: SyncOptions): Promise<SyncResult> {
  const { client, store, trigger } = options;
  const now = options.now ?? (() => Date.now());
  const deadline = now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);

  if (await store.hasRunningRun()) {
    return { status: "skipped", message: "Já existe uma sincronização em andamento." };
  }

  const since = options.full ? null : await store.lastSuccessfulCursor();
  const mode: SyncMode = since ? "incremental" : "full";
  const runId = await store.startRun({
    trigger,
    mode,
    actorId: options.actor?.id ?? null,
    actorName: options.actor?.name ?? null,
  });

  let pages = 0;
  let upserted = 0;
  let cursor = since;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (now() > deadline) throw new Error("Tempo limite atingido antes do fim da sincronização.");

      const companies = await client.listCompanies(page, since);
      if (companies.length === 0) break;
      pages++;

      const syncedAt = new Date(now()).toISOString();
      const rows = companies.map((company) => toCompanyRow(company, syncedAt));
      await store.upsertCompanies(rows);
      upserted += rows.length;
      for (const row of rows) cursor = laterCursor(cursor, row.acessorias_updated_at);
    }

    await store.finishRun(runId, { status: "success", pages, upserted, cursor, error: null });
    return { status: "success", mode, pages, upserted };
  } catch (error) {
    const message =
      error instanceof AcessoriasError || error instanceof Error ? error.message : "Erro desconhecido na sincronização.";
    // The previous cursor is kept: the next run retries everything since then.
    await store.finishRun(runId, { status: "error", pages, upserted, cursor: since, error: message.slice(0, 2000) });
    return { status: "error", mode, pages, upserted, message };
  }
}
