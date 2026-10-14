import "server-only";

import { z } from "zod";

import { FIELD_TYPES, SERVICE_KINDS } from "@/lib/catalog/field-types";
import type { ExportRow } from "@/lib/requests/report-export";
import type { ReportFilters } from "@/lib/requests/report-filters";
import { REQUEST_STATUSES } from "@/lib/requests/status";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * Report reads. Staff only: checked here, and again by the database
 * functions (SECURITY INVOKER, so RLS applies too).
 */

const filterArgs = (filters: ReportFilters) => ({
  p_from: filters.from,
  p_to: filters.to,
  p_dpto_id: filters.department,
  p_service_id: filters.service,
  p_kind: filters.kind,
});

const hours = z.number().nullable();
const named = z.object({ name: z.string().nullable(), total: z.number().int() });

const summarySchema = z.object({
  total: z.number().int(),
  by_status: z.object({ open: z.number().int(), in_progress: z.number().int(), closed: z.number().int() }),
  avg_resolution_hours: hours,
  by_department: z.array(named),
  by_service: z.array(
    z.object({
      name: z.string(),
      department: z.string(),
      total: z.number().int(),
      closed: z.number().int(),
      avg_resolution_hours: hours,
    }),
  ),
  by_operator: z.array(named.extend({ closed: z.number().int(), avg_resolution_hours: hours })),
  rework: z.object({
    corrections: z.number().int(),
    by_original_operator: z.array(named),
    by_original_service: z.array(named),
  }),
});

export type ReportSummary = z.infer<typeof summarySchema>;

export async function getReportSummary(filters: ReportFilters): Promise<ReportSummary> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("gestao_cadastros_report_summary", filterArgs(filters));
  if (error) throw new Error(`Failed to load report: ${error.message}`);
  return summarySchema.parse(data);
}

const exportRowSchema = z.object({
  request_number: z.string(),
  service_kind: z.enum(SERVICE_KINDS),
  dpto_name: z.string(),
  service_name: z.string(),
  company_name: z.string().nullable(),
  company_code: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  requester_name: z.string().nullable(),
  requester_email: z.string().nullable(),
  assigned_to_name: z.string().nullable(),
  opened_at: z.string(),
  completed_at: z.string().nullable(),
  closed_by_name: z.string().nullable(),
  original_request_number: z.string().nullable(),
  original_operator_name: z.string().nullable(),
  field_values: z
    .array(
      z.object({
        field_key: z.string(),
        label: z.string(),
        field_type: z.enum(FIELD_TYPES),
        sort_order: z.number().int(),
        value_text: z.string().nullable(),
        value_number: z.number().nullable(),
        value_date: z.string().nullable(),
        value_boolean: z.boolean().nullable(),
        value_options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
      }),
    )
    .nullable(),
});

const PAGE_SIZE = 1000;
/** Larger exports must be split by period or service. */
export const MAX_EXPORT_ROWS = 20_000;

export type ExportResult = { ok: true; rows: ExportRow[] } | { ok: false; reason: "too-many-rows" };

/** Every request of the report, oldest first. Field values only for a single service. */
export async function loadExportRows(filters: ReportFilters): Promise<ExportResult> {
  const supabase = await createSupabaseServerClient();
  const rows: ExportRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.rpc("gestao_cadastros_report_requests", {
      ...filterArgs(filters),
      p_include_values: filters.service !== null,
      p_offset: offset,
      p_limit: PAGE_SIZE,
    });
    if (error) throw new Error(`Failed to export report: ${error.message}`);

    const page = z.array(exportRowSchema).parse(data);
    rows.push(...page.map(toExportRow));
    if (rows.length > MAX_EXPORT_ROWS) return { ok: false, reason: "too-many-rows" };
    if (page.length < PAGE_SIZE) return { ok: true, rows };
  }
}

function toExportRow(row: z.infer<typeof exportRowSchema>): ExportRow {
  return {
    requestNumber: row.request_number,
    serviceKind: row.service_kind,
    departmentName: row.dpto_name,
    serviceName: row.service_name,
    companyName: row.company_name,
    companyCode: row.company_code,
    status: row.status,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    assignedToName: row.assigned_to_name,
    openedAt: row.opened_at,
    completedAt: row.completed_at,
    closedByName: row.closed_by_name,
    originalRequestNumber: row.original_request_number,
    originalOperatorName: row.original_operator_name,
    fieldValues:
      row.field_values?.map((value) => ({
        fieldKey: value.field_key,
        label: value.label,
        fieldType: value.field_type,
        sortOrder: value.sort_order,
        text: value.value_text,
        number: value.value_number,
        date: value.value_date,
        boolean: value.value_boolean,
        options: value.value_options,
      })) ?? null,
  };
}
