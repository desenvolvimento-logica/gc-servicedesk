"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/catalog/types";
import { buildRequestSchema } from "@/lib/requests/form-schema";
import { ORIGINAL_REQUEST_FIELD } from "@/lib/requests/corrections";
import { sanitizeSearch } from "@/lib/requests/queue-filters";
import type { CorrectableRequest, CreatedRequest } from "@/lib/requests/types";
import { getRequestOpener } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { createRequestErrorResult, INVALID_VALUES_MESSAGE, SERVICE_UNAVAILABLE_MESSAGE } from "./errors";
import { getRequestableService } from "./queries";

/**
 * Opens a request. The requester and department come from the session, the
 * field definitions from the database (never from the client); values are
 * validated here and again by `gestao_cadastros_create_request`, which also
 * enforces the correction rules (closed original of the same department).
 */

const createRequestInputSchema = z.object({
  serviceId: z.uuid(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  originalRequestId: z.uuid().nullable().optional(),
});

const createdRequestSchema = z.object({ id: z.uuid(), request_number: z.string() });

export async function createRequest(input: unknown): Promise<ActionResult<CreatedRequest>> {
  const viewer = await getRequestOpener();
  if (!viewer) return { ok: false, message: FORBIDDEN_MESSAGE };

  const parsedInput = createRequestInputSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: INVALID_VALUES_MESSAGE };

  const service = await getRequestableService(viewer, parsedInput.data.serviceId);
  if (!service) return { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };

  const isCorrection = service.kind === "correction";
  const originalRequestId = isCorrection ? (parsedInput.data.originalRequestId ?? null) : null;

  const parsedValues = buildRequestSchema(service.fields).safeParse(parsedInput.data.values);
  const fieldErrors: Record<string, string[] | undefined> = parsedValues.success
    ? {}
    : z.flattenError(parsedValues.error).fieldErrors;
  if (isCorrection && !originalRequestId) fieldErrors[ORIGINAL_REQUEST_FIELD] = ["Selecione a solicitação original."];
  if (!parsedValues.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: INVALID_VALUES_MESSAGE, fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gestao_cadastros_create_request", {
    p_service_id: service.id,
    p_values: parsedValues.data,
    p_original_request_id: originalRequestId,
  });
  if (error) return createRequestErrorResult(error);

  const created = createdRequestSchema.parse(data);
  return { ok: true, data: { id: created.id, requestNumber: created.request_number } };
}

const correctableRowSchema = z.object({
  id: z.uuid(),
  request_number: z.string(),
  service_name: z.string(),
  company_name: z.string().nullable(),
  company_code: z.string().nullable(),
  completed_at: z.string(),
});

const CORRECTABLE_LIMIT = 20;

/**
 * Closed requests that may be the original of a correction for this service:
 * same department; the requester's own (staff: any). Most recent first,
 * optionally filtered by protocol, company, code or service.
 */
export async function searchCorrectableRequests(
  serviceId: unknown,
  term: unknown,
): Promise<ActionResult<CorrectableRequest[]>> {
  const viewer = await getRequestOpener();
  if (!viewer) return { ok: false, message: FORBIDDEN_MESSAGE };

  const id = z.uuid().safeParse(serviceId);
  if (!id.success) return { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };
  const service = await getRequestableService(viewer, id.data);
  if (!service || service.kind !== "correction") return { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("gestao_cadastros_requests")
    .select("id, request_number, service_name, company_name, company_code, completed_at")
    .eq("status", "closed")
    .eq("dpto_id", service.dptoId);
  if (!viewer.isStaff) query = query.eq("requester_id", viewer.userId);

  const search = sanitizeSearch(typeof term === "string" ? term : "");
  if (search) {
    const pattern = `"*${search}*"`;
    query = query.or(
      ["request_number", "company_name", "company_code", "service_name"].map((column) => `${column}.ilike.${pattern}`).join(","),
    );
  }

  const { data, error } = await query.order("completed_at", { ascending: false }).limit(CORRECTABLE_LIMIT);
  if (error) return { ok: false, message: "Não foi possível carregar as solicitações. Tente novamente." };

  return {
    ok: true,
    data: z
      .array(correctableRowSchema)
      .parse(data)
      .map((row) => ({
        id: row.id,
        requestNumber: row.request_number,
        serviceName: row.service_name,
        companyName: row.company_name,
        companyCode: row.company_code,
        completedAt: row.completed_at,
      })),
  };
}
