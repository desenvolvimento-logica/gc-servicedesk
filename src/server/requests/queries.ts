import "server-only";

import { z } from "zod";

import { FIELD_TYPES, SERVICE_KINDS } from "@/lib/catalog/field-types";
import type { RequestFormField } from "@/lib/requests/form-schema";
import { REQUEST_EVENT_TYPES, REQUEST_STATUSES } from "@/lib/requests/status";
import type {
  RequestableDepartment,
  RequestableService,
  RequestDetail,
  RequestEvent,
  LinkedRequest,
  RequestEventDetails,
  RequestSummary,
  SubmittedField,
} from "@/lib/requests/types";
import { requireRequestOpener, requireViewer } from "@/server/auth/session";
import type { Viewer } from "@/server/auth/viewer";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * Request reads for the requester screens. Each one re-checks the viewer;
 * RLS enforces ownership (requesters) and staff access in the database.
 */

export const REQUESTS_PAGE_SIZE = 20;

// --- Requestable catalog ------------------------------------------------------

const formFieldRowSchema = z.object({
  id: z.uuid(),
  field_key: z.string(),
  label: z.string(),
  field_type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string(), label: z.string(), active: z.boolean() })),
  placeholder: z.string().nullable(),
  help_text: z.string().nullable(),
  validation: z.object({
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  sort_order: z.number().int(),
  active: z.boolean(),
});

const requestableServiceRowSchema = z.object({
  id: z.uuid(),
  dpto_id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(SERVICE_KINDS),
  sort_order: z.number().int(),
  gestao_cadastros_service_fields: z.array(formFieldRowSchema),
});

const SERVICE_SELECT = `id, dpto_id, name, description, kind, sort_order,
  gestao_cadastros_service_fields (id, field_key, label, field_type, required, options, placeholder, help_text, validation, sort_order, active)`;

function toRequestableService(row: z.infer<typeof requestableServiceRowSchema>): RequestableService {
  const fields = row.gestao_cadastros_service_fields
    .filter((field) => field.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pt-BR"))
    .map(
      (field): RequestFormField => ({
        id: field.id,
        fieldKey: field.field_key,
        label: field.label,
        fieldType: field.field_type,
        required: field.required,
        options: field.options.filter((option) => option.active).map(({ value, label }) => ({ value, label })),
        placeholder: field.placeholder,
        helpText: field.help_text,
        validation: field.validation,
      }),
    );

  return {
    id: row.id,
    dptoId: row.dpto_id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    fields,
  };
}

/** Active services with active fields of the departments the viewer may open requests for. */
async function loadRequestableServices(viewer: Viewer, serviceId?: string): Promise<RequestableService[]> {
  const departmentIds = viewer.requestDepartments.map((department) => department.id);
  if (departmentIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("gestao_cadastros_services")
    .select(SERVICE_SELECT)
    .eq("active", true)
    .in("dpto_id", departmentIds);
  if (serviceId) query = query.eq("id", serviceId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load services: ${error.message}`);

  return z
    .array(requestableServiceRowSchema)
    .parse(data)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"))
    .map(toRequestableService)
    .filter((service) => service.fields.length > 0);
}

export async function listRequestableDepartments(): Promise<RequestableDepartment[]> {
  const viewer = await requireRequestOpener();
  const services = await loadRequestableServices(viewer);

  return viewer.requestDepartments
    .map((department) => ({
      ...department,
      services: services.filter((service) => service.dptoId === department.id),
    }))
    .filter((department) => department.services.length > 0);
}

/** For the create action: the service only if the viewer may request it right now. */
export async function getRequestableService(viewer: Viewer, serviceId: string): Promise<RequestableService | null> {
  if (!z.uuid().safeParse(serviceId).success) return null;
  const [service] = await loadRequestableServices(viewer, serviceId);
  return service ?? null;
}

// --- Requests -----------------------------------------------------------------

const requestRowSchema = z.object({
  id: z.uuid(),
  request_number: z.string(),
  service_name: z.string(),
  service_kind: z.enum(SERVICE_KINDS),
  dpto_name: z.string(),
  company_name: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  opened_at: z.string(),
  updated_at: z.string(),
  assigned_to_name: z.string().nullable(),
});

export const REQUEST_COLUMNS =
  "id, request_number, service_name, service_kind, dpto_name, company_name, status, opened_at, updated_at, assigned_to_name";

export const requestRowsSchema = z.array(requestRowSchema);

export function toSummary(row: z.infer<typeof requestRowSchema>): RequestSummary {
  return {
    id: row.id,
    requestNumber: row.request_number,
    serviceName: row.service_name,
    serviceKind: row.service_kind,
    departmentName: row.dpto_name,
    companyName: row.company_name,
    status: row.status,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    assignedToName: row.assigned_to_name,
  };
}

export type RequestPage = { items: RequestSummary[]; total: number; page: number; pageCount: number };

/** The viewer's own requests, newest first (staff included: this is "Minhas Solicitações"). */
export async function listMyRequests(page: number, pageSize = REQUESTS_PAGE_SIZE): Promise<RequestPage> {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  const current = Math.max(1, Math.floor(page));
  const from = (current - 1) * pageSize;

  const { data, error, count } = await supabase
    .from("gestao_cadastros_requests")
    .select(REQUEST_COLUMNS, { count: "exact" })
    .eq("requester_id", viewer.userId)
    .order("opened_at", { ascending: false })
    .order("id")
    .range(from, from + pageSize - 1);
  // Out-of-range pages (PGRST103) are reported as empty.
  if (error && error.code !== "PGRST103") throw new Error(`Failed to load requests: ${error.message}`);

  const total = count ?? 0;
  return {
    items: requestRowsSchema.parse(data ?? []).map(toSummary),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const valueRowSchema = z.object({
  field_key: z.string(),
  label: z.string(),
  field_type: z.enum(FIELD_TYPES),
  sort_order: z.number().int(),
  value_text: z.string().nullable(),
  value_number: z.number().nullable(),
  value_date: z.string().nullable(),
  value_boolean: z.boolean().nullable(),
  value_options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
});

const eventValueSchema = z
  .object({
    status: z.enum(REQUEST_STATUSES).optional(),
    name: z.string().nullable().optional(),
    text: z.string().optional(),
  })
  .nullable();

const eventRowSchema = z.object({
  id: z.number().int(),
  event_type: z.enum(REQUEST_EVENT_TYPES),
  visibility: z.enum(["requester", "internal"]),
  actor_name: z.string().nullable(),
  previous_value: eventValueSchema,
  new_value: eventValueSchema,
  created_at: z.string(),
});

function toEventDetails(row: z.infer<typeof eventRowSchema>): RequestEventDetails {
  const details: RequestEventDetails = {};
  const previous = row.previous_value;
  const next = row.new_value;
  if (previous?.status) details.fromStatus = previous.status;
  if (next?.status) details.toStatus = next.status;
  if (previous?.name) details.previousAssigneeName = previous.name;
  if (next?.name) details.assigneeName = next.name;
  if (next?.text) details.text = next.text;
  return details;
}

const detailRowSchema = requestRowSchema.extend({
  dpto_id: z.number().int(),
  original_request_id: z.uuid().nullable(),
  original_operator_name: z.string().nullable(),
  requester_name: z.string().nullable(),
  requester_email: z.string().nullable(),
  company_code: z.string().nullable(),
  assigned_to: z.number().int().nullable(),
  completed_at: z.string().nullable(),
  closed_by_name: z.string().nullable(),
  gestao_cadastros_request_values: z.array(valueRowSchema),
  gestao_cadastros_request_events: z.array(eventRowSchema),
});

const linkedRowSchema = z.object({
  id: z.uuid(),
  request_number: z.string(),
  service_name: z.string(),
  status: z.enum(REQUEST_STATUSES),
});

/** Original or corrections of a request; RLS drops the ones the viewer may not read. */
async function loadLinkedRequests(column: "id" | "original_request_id", value: string): Promise<LinkedRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gestao_cadastros_requests")
    .select("id, request_number, service_name, status")
    .eq(column, value)
    .order("opened_at");
  if (error) throw new Error(`Failed to load linked requests: ${error.message}`);

  return z
    .array(linkedRowSchema)
    .parse(data)
    .map((row) => ({ id: row.id, requestNumber: row.request_number, serviceName: row.service_name, status: row.status }));
}

/** Null when the request does not exist or the viewer may not read it (RLS). */
export async function getRequestDetail(requestId: string): Promise<RequestDetail | null> {
  await requireViewer();
  if (!z.uuid().safeParse(requestId).success) return null;

  const supabase = await createSupabaseServerClient();
  // Internal events never reach requesters: the events policy filters them.
  const { data, error } = await supabase
    .from("gestao_cadastros_requests")
    .select(
      `${REQUEST_COLUMNS}, dpto_id, original_request_id, original_operator_name, requester_name, requester_email, company_code, assigned_to, completed_at, closed_by_name,
       gestao_cadastros_request_values (field_key, label, field_type, sort_order, value_text, value_number, value_date, value_boolean, value_options),
       gestao_cadastros_request_events (id, event_type, visibility, actor_name, previous_value, new_value, created_at)`,
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load request: ${error.message}`);
  if (!data) return null;

  const row = detailRowSchema.parse(data);
  const [originals, corrections] = await Promise.all([
    row.original_request_id ? loadLinkedRequests("id", row.original_request_id) : Promise.resolve([]),
    loadLinkedRequests("original_request_id", row.id),
  ]);

  return {
    ...toSummary(row),
    dptoId: row.dpto_id,
    originalRequest: originals[0] ?? null,
    originalOperatorName: row.original_operator_name,
    corrections,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    companyCode: row.company_code,
    assignedTo: row.assigned_to,
    completedAt: row.completed_at,
    closedByName: row.closed_by_name,
    values: row.gestao_cadastros_request_values
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map(
        (value): SubmittedField => ({
          fieldKey: value.field_key,
          label: value.label,
          fieldType: value.field_type,
          text: value.value_text,
          number: value.value_number,
          date: value.value_date,
          boolean: value.value_boolean,
          options: value.value_options,
        }),
      ),
    events: row.gestao_cadastros_request_events
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
      .map(
        (event): RequestEvent => ({
          id: event.id,
          eventType: event.event_type,
          visibility: event.visibility,
          actorName: event.actor_name,
          createdAt: event.created_at,
          details: toEventDetails(event),
        }),
      ),
  };
}
