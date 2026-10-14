import { describe, expect, it, vi } from "vitest";

import { AcessoriasError, createAcessoriasClient, MIN_REQUEST_INTERVAL_MS, type AcessoriasDeps } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function deps(responses: Response[]): AcessoriasDeps & { calls: string[]; slept: number[] } {
  let clock = 0;
  const calls: string[] = [];
  const slept: number[] = [];
  return {
    calls,
    slept,
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${String(input)} ${new Headers(init?.headers).get("Authorization")}`);
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return next;
    }) as unknown as typeof fetch,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
    now: () => clock,
  };
}

const company = { ID: 1, Identificador: "12345678000190", Razao: "Empresa", Status: "Ativa" };

describe("Acessórias client", () => {
  it("requests a page with the token and the incremental cursor", async () => {
    const d = deps([json([company])]);
    const result = await createAcessoriasClient("tok", d).listCompanies(2, "2026-10-01 00:00:00");
    expect(result).toHaveLength(1);
    expect(d.calls[0]).toBe("https://api.acessorias.com/companies/ListAll?Pagina=2&DtLastDH=2026-10-01+00%3A00%3A00 Bearer tok");
  });

  it("paces consecutive requests", async () => {
    const d = deps([json([company]), json([])]);
    const client = createAcessoriasClient("tok", d);
    await client.listCompanies(1, null);
    await client.listCompanies(2, null);
    expect(d.slept).toContain(MIN_REQUEST_INTERVAL_MS);
  });

  it("retries after HTTP 429", async () => {
    const d = deps([new Response(null, { status: 429 }), json([])]);
    expect(await createAcessoriasClient("tok", d).listCompanies(1, null)).toEqual([]);
    expect(d.slept).toContain(15_000);
  });

  it("reports an invalid token and API errors returned with HTTP 200", async () => {
    await expect(createAcessoriasClient("tok", deps([new Response(null, { status: 401 })])).listCompanies(1, null)).rejects.toMatchObject({
      kind: "unauthorized",
    });
    await expect(createAcessoriasClient("tok", deps([json({ Erro: "DtLastDH inválido" })])).listCompanies(1, null)).rejects.toThrow(
      AcessoriasError,
    );
  });

  it("treats 404 and empty bodies as the end of the list", async () => {
    expect(await createAcessoriasClient("tok", deps([new Response(null, { status: 404 })])).listCompanies(9, null)).toEqual([]);
    expect(await createAcessoriasClient("tok", deps([json({})])).listCompanies(9, null)).toEqual([]);
  });
});
