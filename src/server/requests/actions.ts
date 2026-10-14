"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/catalog/types";
import { buildRequestSchema } from "@/lib/requests/form-schema";
import type { CreatedRequest } from "@/lib/requests/types";
import { getRequestOpener } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { createRequestErrorResult, INVALID_VALUES_MESSAGE, SERVICE_UNAVAILABLE_MESSAGE } from "./errors";
import { getRequestableService } from "./queries";

/**
 * Opens a request. The requester and department come from the session, the
 * field definitions from the database (never from the client); values are
 * validated here and again by `gestao_cadastros_create_request`.
 */

const createRequestInputSchema = z.object({
  serviceId: z.uuid(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

const createdRequestSchema = z.object({ id: z.uuid(), request_number: z.string() });

export async function createRequest(input: unknown): Promise<ActionResult<CreatedRequest>> {
  const viewer = await getRequestOpener();
  if (!viewer) return { ok: false, message: FORBIDDEN_MESSAGE };

  const parsedInput = createRequestInputSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: INVALID_VALUES_MESSAGE };

  const service = await getRequestableService(viewer, parsedInput.data.serviceId);
  if (!service) return { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };

  const parsedValues = buildRequestSchema(service.fields).safeParse(parsedInput.data.values);
  if (!parsedValues.success) {
    return { ok: false, message: INVALID_VALUES_MESSAGE, fieldErrors: z.flattenError(parsedValues.error).fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gestao_cadastros_create_request", {
    p_service_id: service.id,
    p_values: parsedValues.data,
  });
  if (error) return createRequestErrorResult(error);

  const created = createdRequestSchema.parse(data);
  return { ok: true, data: { id: created.id, requestNumber: created.request_number } };
}
