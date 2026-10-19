import { describe, expect, it } from "vitest";

import type { AcessoriasCompany } from "@/lib/companies/normalize";
import type { CompanyRow } from "@/lib/companies/normalize";

import { AcessoriasError, type AcessoriasClient } from "../acessorias/client";
import { syncCompanies, type SyncStore } from "./sync";

const company = (id: number, dt: string): AcessoriasCompany => ({
  ID: id,
  Identificador: String(id).padStart(14, "0"),
  Razao: `Empresa ${id}`,
  Status: "Ativa",
  DtLastDH: dt,
});

function fakeStore(cursor: string | null, running = false) {
  const state = {
    rows: [] as CompanyRow[],
    runs: [] as { trigger: string; mode: string }[],
    finished: [] as { status: string; pages: number; upserted: number; cursor: string | null; error: string | null }[],
  };
  const store: SyncStore = {
    hasRunningRun: async () => running,
    lastSuccessfulCursor: async () => cursor,
    startRun: async (run) => {
      state.runs.push(run);
      return state.runs.length;
    },
    upsertCompanies: async (rows) => {
      state.rows.push(...rows);
    },
    finishRun: async (_id, result) => {
      state.finished.push(result);
    },
  };
  return { store, state };
}

const pagedClient = (pages: AcessoriasCompany[][], seen: (string | null)[] = []): AcessoriasClient => ({
  listCompanies: async (page, since) => {
    seen.push(since);
    return pages[page - 1] ?? [];
  },
});

describe("syncCompanies", () => {
  it("runs a full sync first and records the latest DtLastDH as cursor", async () => {
    const { store, state } = fakeStore(null);
    const result = await syncCompanies({
      client: pagedClient([[company(1, "2026-10-01 10:00:00"), company(2, "2026-10-03 09:00:00")], [company(3, "2026-10-02 08:00:00")]]),
      store,
      trigger: "cron",
    });
    expect(result).toEqual({ status: "success", mode: "full", pages: 2, upserted: 3 });
    expect(state.finished[0]).toMatchObject({ status: "success", cursor: "2026-10-03 09:00:00" });
  });

  it("runs incrementally from the last cursor", async () => {
    const seen: (string | null)[] = [];
    const { store, state } = fakeStore("2026-10-03 09:00:00");
    const result = await syncCompanies({ client: pagedClient([], seen), store, trigger: "manual", actor: { id: 1, name: "Admin" } });
    expect(result).toMatchObject({ status: "success", mode: "incremental", upserted: 0 });
    expect(seen).toEqual(["2026-10-03 09:00:00"]);
    expect(state.finished[0]?.cursor).toBe("2026-10-03 09:00:00");
    expect(state.runs[0]).toMatchObject({ trigger: "manual", actorName: "Admin" });
  });

  it("ignores the cursor on a full sync", async () => {
    const seen: (string | null)[] = [];
    const { store, state } = fakeStore("2026-10-03 09:00:00");
    const result = await syncCompanies({
      client: pagedClient([[company(1, "2026-09-01 10:00:00")]], seen),
      store,
      trigger: "manual",
      actor: { id: 1, name: "Admin" },
      full: true,
    });
    expect(result).toMatchObject({ status: "success", mode: "full", upserted: 1 });
    expect(seen).toEqual([null, null]);
    expect(state.runs[0]).toMatchObject({ mode: "full" });
  });

  it("keeps the previous cursor when the API fails", async () => {
    const { store, state } = fakeStore("2026-10-01 00:00:00");
    const client: AcessoriasClient = {
      listCompanies: async () => {
        throw new AcessoriasError("Token do Acessórias inválido ou expirado.", "unauthorized");
      },
    };
    const result = await syncCompanies({ client, store, trigger: "cron" });
    expect(result).toMatchObject({ status: "error", message: "Token do Acessórias inválido ou expirado." });
    expect(state.finished[0]).toMatchObject({ status: "error", cursor: "2026-10-01 00:00:00" });
  });

  it("stops when the time budget runs out", async () => {
    let clock = 0;
    const { store, state } = fakeStore(null);
    const client: AcessoriasClient = {
      listCompanies: async (page) => {
        clock += 1_000;
        return [company(page, "2026-10-01 00:00:00")];
      },
    };
    const result = await syncCompanies({ client, store, trigger: "cron", timeBudgetMs: 2_500, now: () => clock });
    expect(result.status).toBe("error");
    expect(state.finished[0]).toMatchObject({ status: "error", cursor: null });
    expect(state.rows.length).toBeGreaterThan(0);
  });

  it("does not overlap a running sync", async () => {
    const { store, state } = fakeStore(null, true);
    expect((await syncCompanies({ client: pagedClient([]), store, trigger: "cron" })).status).toBe("skipped");
    expect(state.runs).toHaveLength(0);
  });
});
