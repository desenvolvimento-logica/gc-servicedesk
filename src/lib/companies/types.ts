import { digitsOnly, normalizeSearch } from "./normalize";

/** A company offered by the picker / listed to administrators. */
export type Company = {
  id: number;
  document: string;
  legalName: string;
  tradeName: string | null;
  active: boolean;
  uf: string | null;
};

export type CompanySyncRun = {
  id: number;
  trigger: "cron" | "manual";
  mode: "full" | "incremental";
  status: "running" | "success" | "error";
  actorName: string | null;
  startedAt: string;
  finishedAt: string | null;
  upserted: number;
  error: string | null;
};

export const COMPANY_SEARCH_MAX_LENGTH = 100;

/**
 * Pattern for search_text: digits only for document/code searches (so a
 * formatted CNPJ matches), otherwise the accent-free lowercase text. Only
 * letters, digits and spaces survive, so the value is safe in an ILIKE.
 */
export function companySearchTerm(raw: string): string {
  const value = raw.slice(0, COMPANY_SEARCH_MAX_LENGTH);
  if (/^[\d.\-/\s]+$/.test(value)) return digitsOnly(value);
  return normalizeSearch(value.replace(/[^\p{L}\p{N}\s]/gu, " "));
}
