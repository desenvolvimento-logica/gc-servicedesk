import { z } from "zod";

import { SERVICE_KINDS, type ServiceKind } from "@/lib/catalog/field-types";

import { todaySaoPaulo } from "./queue-filters";

/**
 * Report filters, carried in the URL. The period is always resolved to
 * inclusive calendar dates (São Paulo) and applies to the opening date.
 */

export const REPORT_PERIODS = ["month", "30d", "custom"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const reportPeriodLabels: Record<ReportPeriod, string> = {
  month: "Mês atual",
  "30d": "Últimos 30 dias",
  custom: "Período personalizado",
};

/** Same limit as the database (two years). */
export const MAX_PERIOD_DAYS = 731;

export type ReportFilters = {
  period: ReportPeriod;
  from: string;
  to: string;
  department: number | null;
  service: string | null;
  kind: ServiceKind | null;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const isoDate = z.iso.date();
const positiveInt = z.coerce.number().int().positive();

const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);

export function addDays(date: string, days: number): string {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);

export function parseReportFilters(params: RawParams, today = todaySaoPaulo()): ReportFilters {
  const common = {
    department: positiveInt.safeParse(first(params.department)).data ?? null,
    service: z.uuid().safeParse(first(params.service)).data ?? null,
    kind: z.enum(SERVICE_KINDS).safeParse(first(params.kind)).data ?? null,
  };
  const period = z.enum(REPORT_PERIODS).safeParse(first(params.period)).data ?? "month";

  if (period === "custom") {
    const from = isoDate.safeParse(first(params.from));
    const to = isoDate.safeParse(first(params.to));
    if (from.success && to.success && from.data <= to.data && daysBetween(from.data, to.data) <= MAX_PERIOD_DAYS) {
      return { period, from: from.data, to: to.data, ...common };
    }
  }
  if (period === "30d") return { period, from: addDays(today, -29), to: today, ...common };
  return { period: "month", from: `${today.slice(0, 8)}01`, to: today, ...common };
}

/** URL query for the filters; dates only for a custom period. */
export function reportFiltersToSearch(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.period !== "month") params.set("period", filters.period);
  if (filters.period === "custom") {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.department) params.set("department", String(filters.department));
  if (filters.service) params.set("service", filters.service);
  if (filters.kind) params.set("kind", filters.kind);
  const query = params.toString();
  return query ? `?${query}` : "";
}
