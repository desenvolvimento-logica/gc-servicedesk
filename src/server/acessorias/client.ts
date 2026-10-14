import { z } from "zod";

import { acessoriasCompanySchema, type AcessoriasCompany } from "@/lib/companies/normalize";

/**
 * Minimal Acessórias API client (https://api.acessorias.com/documentation).
 * GET /companies/ListAll returns 20 companies per page ("Pagina"); an empty
 * list ends the listing. Limit: 100 requests/minute (HTTP 429 above it).
 * Business errors may come as HTTP 200 with an "Erro" key.
 */

export const ACESSORIAS_BASE_URL = "https://api.acessorias.com";

/** ≈ 85 requests/minute: stays under the 100/min limit. */
export const MIN_REQUEST_INTERVAL_MS = 700;
const MAX_RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_WAIT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

export class AcessoriasError extends Error {
  constructor(
    message: string,
    readonly kind: "unauthorized" | "rate-limited" | "http" | "api" | "invalid-response",
  ) {
    super(message);
    this.name = "AcessoriasError";
  }
}

export type AcessoriasDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const defaultDeps: AcessoriasDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const errorBodySchema = z.object({ Erro: z.unknown() });

export function createAcessoriasClient(token: string, deps: AcessoriasDeps = defaultDeps) {
  let lastRequestAt = 0;

  async function throttle() {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - deps.now();
    if (wait > 0) await deps.sleep(wait);
    lastRequestAt = deps.now();
  }

  /** One page of companies; `since` (DtLastDH) limits to companies changed after it. */
  async function listCompanies(page: number, since: string | null): Promise<AcessoriasCompany[]> {
    const url = new URL("/companies/ListAll", ACESSORIAS_BASE_URL);
    url.searchParams.set("Pagina", String(page));
    if (since) url.searchParams.set("DtLastDH", since);

    for (let attempt = 0; ; attempt++) {
      await throttle();
      const response = await deps.fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });

      if (response.status === 429) {
        if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new AcessoriasError("Limite de requisições do Acessórias excedido.", "rate-limited");
        await deps.sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }
      if (response.status === 401) throw new AcessoriasError("Token do Acessórias inválido ou expirado.", "unauthorized");
      // An out-of-range page may come back as 404: treat it as the end of the list.
      if (response.status === 404) return [];
      if (!response.ok) throw new AcessoriasError(`Acessórias respondeu HTTP ${response.status}.`, "http");

      const body: unknown = await response.json().catch(() => null);
      if (Array.isArray(body)) {
        const parsed = z.array(acessoriasCompanySchema).safeParse(body);
        if (!parsed.success) throw new AcessoriasError("Resposta do Acessórias em formato inesperado.", "invalid-response");
        return parsed.data;
      }
      const apiError = errorBodySchema.safeParse(body);
      if (apiError.success) throw new AcessoriasError(`Acessórias: ${String(apiError.data.Erro)}`.slice(0, 500), "api");
      // A single company object (some endpoints return one instead of a list).
      const single = acessoriasCompanySchema.safeParse(body);
      if (single.success) return [single.data];
      if (body === null || (typeof body === "object" && Object.keys(body).length === 0)) return [];
      throw new AcessoriasError("Resposta do Acessórias em formato inesperado.", "invalid-response");
    }
  }

  return { listCompanies };
}

export type AcessoriasClient = ReturnType<typeof createAcessoriasClient>;
