import { z } from "zod";

import type { ActionResult } from "@/lib/catalog/types";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";

type RpcError = { code?: string; message?: string; details?: string | null };

export const INVALID_VALUES_MESSAGE = "Revise os campos destacados.";
export const SERVICE_UNAVAILABLE_MESSAGE = "Este serviço não está mais disponível. Atualize a página e escolha outro.";

const fieldMessagesSchema = z.record(z.string(), z.string());

/**
 * Result for a failed `gestao_cadastros_create_request` call. Validation
 * failures (SQLSTATE 22023) carry `{ field_key: message }` in DETAIL; those
 * messages are written for users. Other database text is never echoed.
 */
export function createRequestErrorResult(error: RpcError): Extract<ActionResult<never>, { ok: false }> {
  switch (error.code) {
    case "22023": {
      const parsed = parseDetail(error.details);
      return parsed
        ? {
            ok: false,
            message: INVALID_VALUES_MESSAGE,
            fieldErrors: Object.fromEntries(Object.entries(parsed).map(([key, message]) => [key, [message]])),
          }
        : { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };
    }
    case "P0002":
      return { ok: false, message: SERVICE_UNAVAILABLE_MESSAGE };
    case "42501":
      return { ok: false, message: FORBIDDEN_MESSAGE };
    default:
      return { ok: false, message: "Não foi possível enviar a solicitação. Tente novamente." };
  }
}

function parseDetail(details: string | null | undefined): Record<string, string> | null {
  if (!details) return null;
  try {
    const result = fieldMessagesSchema.safeParse(JSON.parse(details));
    return result.success && Object.keys(result.data).length > 0 ? result.data : null;
  } catch {
    return null;
  }
}
