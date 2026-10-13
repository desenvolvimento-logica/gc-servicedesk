import "server-only";

import { z } from "zod";

import { FIELD_TYPES, SERVICE_KINDS } from "@/lib/catalog/field-types";
import type { AdminDepartment, AdminService, AdminServiceField, AdminServiceSummary } from "@/lib/catalog/types";
import { requireAdministrator } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * Catalog reads for the administration screens. Each one re-checks the
 * administrator role; RLS enforces the same rule in the database.
 */

const departmentRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  is_requester_department: z.boolean(),
  active: z.boolean(),
  sort_order: z.number().int(),
});

const optionRowSchema = z.object({ value: z.string(), label: z.string(), active: z.boolean() });

const fieldRowSchema = z.object({
  id: z.uuid(),
  field_key: z.string(),
  label: z.string(),
  field_type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(optionRowSchema),
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

const serviceRowSchema = z.object({
  id: z.uuid(),
  dpto_id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(SERVICE_KINDS),
  active: z.boolean(),
  sort_order: z.number().int(),
  updated_at: z.string(),
});

const SERVICE_COLUMNS = "id, dpto_id, name, description, kind, active, sort_order, updated_at";
const FIELD_COLUMNS =
  "id, field_key, label, field_type, required, options, placeholder, help_text, validation, sort_order, active";

export async function listAdminDepartments(): Promise<AdminDepartment[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("gestao_cadastros_admin_departments");
  if (error) throw new Error(`Failed to load departments: ${error.message}`);

  return z
    .array(departmentRowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      name: row.name,
      isRequesterDepartment: row.is_requester_department,
      active: row.active,
      sortOrder: row.sort_order,
    }));
}

const departmentNames = (departments: readonly AdminDepartment[]) =>
  new Map(departments.map((department) => [department.id, department.name]));

export async function listAdminServices(): Promise<AdminServiceSummary[]> {
  await requireAdministrator();
  const supabase = await createSupabaseServerClient();

  const [departments, services] = await Promise.all([
    listAdminDepartments(),
    supabase
      .from("gestao_cadastros_services")
      .select(`${SERVICE_COLUMNS}, gestao_cadastros_service_fields (active)`)
      .order("sort_order")
      .order("name"),
  ]);
  if (services.error) throw new Error(`Failed to load services: ${services.error.message}`);

  const names = departmentNames(departments);
  const rows = z
    .array(serviceRowSchema.extend({ gestao_cadastros_service_fields: z.array(z.object({ active: z.boolean() })) }))
    .parse(services.data);

  return rows.map(({ gestao_cadastros_service_fields: fields, ...row }) => ({
    ...toService(row, names),
    fieldCount: fields.length,
    activeFieldCount: fields.filter((field) => field.active).length,
  }));
}

/** Null when the id does not exist. */
export async function getAdminService(serviceId: string): Promise<AdminService | null> {
  await requireAdministrator();
  if (!z.uuid().safeParse(serviceId).success) return null;

  const supabase = await createSupabaseServerClient();
  const [departments, service] = await Promise.all([
    listAdminDepartments(),
    supabase
      .from("gestao_cadastros_services")
      .select(`${SERVICE_COLUMNS}, gestao_cadastros_service_fields (${FIELD_COLUMNS})`)
      .eq("id", serviceId)
      .maybeSingle(),
  ]);
  if (service.error) throw new Error(`Failed to load service: ${service.error.message}`);
  if (!service.data) return null;

  const { gestao_cadastros_service_fields: fields, ...row } = serviceRowSchema
    .extend({ gestao_cadastros_service_fields: z.array(fieldRowSchema) })
    .parse(service.data);

  return {
    ...toService(row, departmentNames(departments)),
    fields: fields
      .map(toField)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR")),
  };
}

function toService(row: z.infer<typeof serviceRowSchema>, names: Map<number, string>): Omit<AdminService, "fields"> {
  return {
    id: row.id,
    dptoId: row.dpto_id,
    departmentName: names.get(row.dpto_id) ?? `Departamento ${row.dpto_id}`,
    name: row.name,
    description: row.description,
    kind: row.kind,
    active: row.active,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function toField(row: z.infer<typeof fieldRowSchema>): AdminServiceField {
  return {
    id: row.id,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type,
    required: row.required,
    options: row.options,
    placeholder: row.placeholder,
    helpText: row.help_text,
    validation: row.validation,
    sortOrder: row.sort_order,
    active: row.active,
  };
}
