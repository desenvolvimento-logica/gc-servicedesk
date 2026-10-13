"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { toFieldColumns } from "@/lib/catalog/field-row";
import { FIELD_TYPES, isSupportedFieldType } from "@/lib/catalog/field-types";
import { moveItem, OBSERVATIONS_FIELD_KEY, placeNewField, type SortOrderChange } from "@/lib/catalog/ordering";
import {
  createServiceSchema,
  dptoIdSchema,
  fieldFormSchema,
  fieldOptionSchema,
  idSchema,
  serviceFormSchema,
} from "@/lib/catalog/schemas";
import type { ActionResult } from "@/lib/catalog/types";
import { getAdministrator } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { databaseErrorMessage, FORBIDDEN_MESSAGE, NOT_FOUND_MESSAGE } from "./errors";

/**
 * Catalog mutations. Every action re-checks the administrator role and
 * validates its arguments; the database enforces the same rules through RLS,
 * constraints and triggers (actor stamping, immutable key/type).
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const INVALID_INPUT = "Revise os campos destacados.";

const fail = (message: string, error?: z.ZodError): ActionResult<never> => ({
  ok: false,
  message,
  fieldErrors: error ? z.flattenError(error).fieldErrors : undefined,
});

const done = <T>(data: T): ActionResult<T> => {
  refresh();
  return { ok: true, data };
};

async function adminClient(): Promise<Supabase | null> {
  return (await getAdministrator()) ? createSupabaseServerClient() : null;
}

/** Updates rows by id; RLS silently filters rows the caller may not change, so count them. */
async function updateById(
  supabase: Supabase,
  table: "gestao_cadastros_services" | "gestao_cadastros_service_fields",
  id: string,
  values: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase.from(table).update(values).eq("id", id).select("id");
  if (error) return databaseErrorMessage(error);
  return data.length === 1 ? null : NOT_FOUND_MESSAGE;
}

async function applySortOrders(
  supabase: Supabase,
  table: "gestao_cadastros_services" | "gestao_cadastros_service_fields",
  changes: readonly SortOrderChange[],
): Promise<string | null> {
  for (const change of changes) {
    const message = await updateById(supabase, table, change.id, { sort_order: change.sortOrder });
    if (message) return message;
  }
  return null;
}

// --- Services ---------------------------------------------------------------

export async function createService(input: unknown): Promise<ActionResult<{ id: string }>> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const parsed = createServiceSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID_INPUT, parsed.error);
  const values = parsed.data;

  const { data, error } = await supabase
    .from("gestao_cadastros_services")
    .insert({
      dpto_id: values.dptoId,
      name: values.name,
      description: values.description,
      kind: values.kind,
      sort_order: values.sortOrder,
    })
    .select("id")
    .single();
  if (error) return fail(databaseErrorMessage(error));

  // Every service exposes the optional common "Observações" field (specs/05).
  const observations = await supabase.from("gestao_cadastros_service_fields").insert({
    service_id: data.id,
    field_key: OBSERVATIONS_FIELD_KEY,
    label: "Observações",
    field_type: "textarea",
    required: false,
    sort_order: 10,
  });
  if (observations.error) {
    return fail(`Serviço criado, mas o campo "Observações" não pôde ser adicionado. Adicione-o manualmente.`);
  }

  return done({ id: data.id });
}

export async function updateService(serviceId: unknown, input: unknown): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = idSchema.safeParse(serviceId);
  if (!id.success) return fail(NOT_FOUND_MESSAGE);
  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID_INPUT, parsed.error);

  const message = await updateById(supabase, "gestao_cadastros_services", id.data, {
    name: parsed.data.name,
    description: parsed.data.description,
    sort_order: parsed.data.sortOrder,
  });
  return message ? fail(message) : done(undefined);
}

export async function setServiceActive(serviceId: unknown, active: unknown): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = idSchema.safeParse(serviceId);
  const flag = z.boolean().safeParse(active);
  if (!id.success || !flag.success) return fail(NOT_FOUND_MESSAGE);

  const message = await updateById(supabase, "gestao_cadastros_services", id.data, { active: flag.data });
  return message ? fail(message) : done(undefined);
}

// --- Fields -----------------------------------------------------------------

const storedFieldSchema = z.object({
  id: z.uuid(),
  service_id: z.uuid(),
  field_key: z.string(),
  field_type: z.enum(FIELD_TYPES),
  options: z.array(fieldOptionSchema),
  sort_order: z.number().int(),
});

async function loadField(supabase: Supabase, fieldId: string) {
  const { data, error } = await supabase
    .from("gestao_cadastros_service_fields")
    .select("id, service_id, field_key, field_type, options, sort_order")
    .eq("id", fieldId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load field: ${error.message}`);
  return data ? storedFieldSchema.parse(data) : null;
}

async function loadServiceFields(supabase: Supabase, serviceId: string) {
  const { data, error } = await supabase
    .from("gestao_cadastros_service_fields")
    .select("id, field_key, sort_order")
    .eq("service_id", serviceId)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(`Failed to load fields: ${error.message}`);
  return z
    .array(z.object({ id: z.uuid(), field_key: z.string(), sort_order: z.number().int() }))
    .parse(data)
    .map((row) => ({ id: row.id, fieldKey: row.field_key, sortOrder: row.sort_order }));
}

export async function createField(serviceId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = idSchema.safeParse(serviceId);
  if (!id.success) return fail(NOT_FOUND_MESSAGE);
  const parsed = fieldFormSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID_INPUT, parsed.error);
  const values = parsed.data;
  if (!isSupportedFieldType(values.fieldType)) {
    return fail("Este tipo de campo ainda não está disponível.");
  }

  const placement = placeNewField(await loadServiceFields(supabase, id.data));
  if (placement.shift) {
    const message = await applySortOrders(supabase, "gestao_cadastros_service_fields", [placement.shift]);
    if (message) return fail(message);
  }

  const { data, error } = await supabase
    .from("gestao_cadastros_service_fields")
    .insert({
      service_id: id.data,
      field_key: values.fieldKey,
      field_type: values.fieldType,
      sort_order: placement.sortOrder,
      ...toFieldColumns(values.fieldType, values),
    })
    .select("id")
    .single();
  if (error) return fail(databaseErrorMessage(error));

  return done({ id: data.id });
}

/** Key and type are immutable: the stored ones win over anything submitted. */
export async function updateField(fieldId: unknown, input: unknown): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = idSchema.safeParse(fieldId);
  if (!id.success) return fail(NOT_FOUND_MESSAGE);
  const stored = await loadField(supabase, id.data);
  if (!stored) return fail(NOT_FOUND_MESSAGE);

  const parsed = fieldFormSchema.safeParse({
    ...(typeof input === "object" && input !== null ? input : {}),
    fieldKey: stored.field_key,
    fieldType: stored.field_type,
  });
  if (!parsed.success) return fail(INVALID_INPUT, parsed.error);

  const message = await updateById(
    supabase,
    "gestao_cadastros_service_fields",
    id.data,
    toFieldColumns(stored.field_type, parsed.data, stored.options),
  );
  return message ? fail(message) : done(undefined);
}

export async function setFieldActive(fieldId: unknown, active: unknown): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = idSchema.safeParse(fieldId);
  const flag = z.boolean().safeParse(active);
  if (!id.success || !flag.success) return fail(NOT_FOUND_MESSAGE);

  if (flag.data) {
    const stored = await loadField(supabase, id.data);
    if (!stored) return fail(NOT_FOUND_MESSAGE);
    if (!isSupportedFieldType(stored.field_type)) {
      return fail("Este tipo de campo ainda não está disponível e não pode ser ativado.");
    }
  }

  const message = await updateById(supabase, "gestao_cadastros_service_fields", id.data, { active: flag.data });
  return message ? fail(message) : done(undefined);
}

export async function moveField(fieldId: unknown, direction: unknown): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = idSchema.safeParse(fieldId);
  const dir = z.enum(["up", "down"]).safeParse(direction);
  if (!id.success || !dir.success) return fail(NOT_FOUND_MESSAGE);

  const stored = await loadField(supabase, id.data);
  if (!stored) return fail(NOT_FOUND_MESSAGE);

  const fields = await loadServiceFields(supabase, stored.service_id);
  const message = await applySortOrders(supabase, "gestao_cadastros_service_fields", moveItem(fields, id.data, dir.data));
  return message ? fail(message) : done(undefined);
}

// --- Requester departments --------------------------------------------------

/**
 * Enables or disables a corporate department as a requester department.
 * Disabling removes requester access from its members; its services stay.
 */
export async function setRequesterDepartmentActive(dptoId: unknown, active: unknown): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return fail(FORBIDDEN_MESSAGE);

  const id = dptoIdSchema.safeParse(dptoId);
  const flag = z.boolean().safeParse(active);
  if (!id.success || !flag.success) return fail(NOT_FOUND_MESSAGE);

  const existing = await supabase
    .from("gestao_cadastros_requester_departments")
    .select("dpto_id, sort_order")
    .order("sort_order", { ascending: false });
  if (existing.error) return fail(databaseErrorMessage(existing.error));

  const rows = z.array(z.object({ dpto_id: z.number().int(), sort_order: z.number().int() })).parse(existing.data);

  if (rows.some((row) => row.dpto_id === id.data)) {
    const { data, error } = await supabase
      .from("gestao_cadastros_requester_departments")
      .update({ active: flag.data })
      .eq("dpto_id", id.data)
      .select("dpto_id");
    if (error) return fail(databaseErrorMessage(error));
    return data.length === 1 ? done(undefined) : fail(NOT_FOUND_MESSAGE);
  }

  if (!flag.data) return done(undefined);

  const { error } = await supabase
    .from("gestao_cadastros_requester_departments")
    .insert({ dpto_id: id.data, active: true, sort_order: (rows[0]?.sort_order ?? 0) + 10 });
  return error ? fail(databaseErrorMessage(error)) : done(undefined);
}
