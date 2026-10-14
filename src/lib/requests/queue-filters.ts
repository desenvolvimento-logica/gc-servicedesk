import { z } from "zod";

import { SERVICE_KINDS, type ServiceKind } from "@/lib/catalog/field-types";

import { REQUEST_STATUSES, type RequestStatus } from "./status";

/**
 * Operational queue filters, carried in the URL. Parsing never throws:
 * anything invalid falls back to the default for that filter.
 */

export const ALL = "all";
/** Default status filter: everything not closed yet. */
export const ACTIVE = "active";
export const UNASSIGNED = "unassigned";

export type QueueStatusFilter = RequestStatus | typeof ACTIVE | typeof ALL;

export type QueueFilters = {
  q: string;
  status: QueueStatusFilter;
  /** New requests or corrections; null for both. */
  kind: ServiceKind | null;
  department: number | null;
  service: string | null;
  /** Operator user id, "unassigned", or null for anyone. */
  assignee: number | typeof UNASSIGNED | null;
  /** ISO calendar dates (inclusive), São Paulo time. */
  from: string | null;
  to: string | null;
  page: number;
};

export const SEARCH_MAX_LENGTH = 100;

/**
 * Keeps letters, digits and a few separators so the term is safe inside a
 * PostgREST `or=(...)` filter and has no LIKE wildcards.
 */
export function sanitizeSearch(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s\-./@]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const isoDate = z.iso.date();
const positiveInt = z.coerce.number().int().positive();
const statusFilter = z.enum([...REQUEST_STATUSES, ACTIVE, ALL]);

export function parseQueueFilters(params: RawParams): QueueFilters {
  const assignee = first(params.assignee);
  const from = isoDate.safeParse(first(params.from));
  const to = isoDate.safeParse(first(params.to));

  return {
    q: sanitizeSearch(first(params.q)),
    status: statusFilter.safeParse(first(params.status)).data ?? ACTIVE,
    kind: z.enum(SERVICE_KINDS).safeParse(first(params.kind)).data ?? null,
    department: positiveInt.safeParse(first(params.department)).data ?? null,
    service: z.uuid().safeParse(first(params.service)).data ?? null,
    assignee: assignee === UNASSIGNED ? UNASSIGNED : (positiveInt.safeParse(assignee).data ?? null),
    from: from.success ? from.data : null,
    to: to.success ? to.data : null,
    page: positiveInt.safeParse(first(params.page)).data ?? 1,
  };
}

/** URL query for the filters, omitting defaults. */
export function queueFiltersToSearch(filters: Partial<QueueFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status && filters.status !== ACTIVE) params.set("status", filters.status);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.department) params.set("department", String(filters.department));
  if (filters.service) params.set("service", filters.service);
  if (filters.assignee) params.set("assignee", String(filters.assignee));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Start of a São Paulo calendar day as an ISO timestamp (Brazil has no DST since 2019). */
export const startOfDaySaoPaulo = (date: string) => `${date}T00:00:00-03:00`;

/** Exclusive upper bound for an inclusive "to" date. */
export function startOfNextDaySaoPaulo(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDaySaoPaulo(next.toISOString().slice(0, 10));
}

/** Today's date in São Paulo, as YYYY-MM-DD. */
export function todaySaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}
