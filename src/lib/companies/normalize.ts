import { z } from "zod";

/**
 * Mapping of Acessórias companies (GET /companies/ListAll) to the local copy.
 * Lenient on purpose: unknown fields are ignored and optional ones may be
 * missing or empty.
 */

const text = z.preprocess((value) => (value === null || value === undefined ? "" : String(value)), z.string());

export const acessoriasCompanySchema = z.object({
  ID: z.coerce.number().int().positive(),
  Identificador: text,
  Razao: text,
  Fantasia: text.optional(),
  Status: text.optional(),
  UF: text.optional(),
  Regime: text.optional(),
  DtLastDH: text.optional(),
});

export type AcessoriasCompany = z.infer<typeof acessoriasCompanySchema>;

/** A row of public.gestao_cadastros_companies. */
export type CompanyRow = {
  acessorias_id: number;
  document: string;
  legal_name: string;
  trade_name: string | null;
  active: boolean;
  uf: string | null;
  tax_regime: string | null;
  search_text: string;
  acessorias_updated_at: string | null;
  synced_at: string;
};

/** Lowercase, accent-free, single-spaced: what the search compares against. */
export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

const emptyToNull = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/** "Ativa"/"ATIVA" are active; anything else (Inativa, Baixada…) is not. */
export const isActiveStatus = (status: string | undefined) => normalizeSearch(status ?? "") === "ativa";

export function toCompanyRow(company: AcessoriasCompany, syncedAt: string): CompanyRow {
  const legalName = company.Razao.trim() || `Empresa ${company.ID}`;
  const tradeName = emptyToNull(company.Fantasia);
  const document = digitsOnly(company.Identificador);

  return {
    acessorias_id: company.ID,
    document,
    legal_name: legalName,
    trade_name: tradeName,
    active: isActiveStatus(company.Status),
    uf: emptyToNull(company.UF)?.toUpperCase() ?? null,
    tax_regime: emptyToNull(company.Regime),
    search_text: normalizeSearch([legalName, tradeName ?? "", document, String(company.ID)].join(" ")),
    acessorias_updated_at: emptyToNull(company.DtLastDH),
    synced_at: syncedAt,
  };
}

/** Latest of two DtLastDH values ("YYYY-MM-DD HH:MM:SS" or ISO: both sort as text). */
export function laterCursor(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

/** Formats a CNPJ (14 digits) or CPF (11 digits) for display; other lengths as-is. */
export function formatDocument(document: string): string {
  if (document.length === 14) return document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (document.length === 11) return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return document;
}
