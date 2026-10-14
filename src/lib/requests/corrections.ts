import type { RequestFormField, RequestFormInput } from "./form-schema";
import type { CorrectableRequest } from "./types";

/**
 * Correction/rework helpers. A correction always references one closed
 * original request (enforced by `gestao_cadastros_create_request`).
 */

/** Error key the database uses for the original request (DETAIL of SQLSTATE 22023). */
export const ORIGINAL_REQUEST_FIELD = "original_request_id";

/**
 * Field keys the requests table copies into company_name/company_code (same
 * convention as the database). Used only to prefill a correction form.
 */
export const COMPANY_NAME_FIELD = "nome_empresa";
export const COMPANY_CODE_FIELD = "codigo_empresa";

/** Company values of the original for the correction's empty company fields. */
export function companyPrefill(
  fields: readonly Pick<RequestFormField, "fieldKey">[],
  current: RequestFormInput,
  original: Pick<CorrectableRequest, "companyName" | "companyCode">,
): Partial<Record<string, string>> {
  const prefill: Partial<Record<string, string>> = {};
  const candidates: [string, string | null][] = [
    [COMPANY_NAME_FIELD, original.companyName],
    [COMPANY_CODE_FIELD, original.companyCode],
  ];
  for (const [key, value] of candidates) {
    const isEmpty = typeof current[key] !== "string" || current[key].trim() === "";
    if (value && isEmpty && fields.some((field) => field.fieldKey === key)) prefill[key] = value;
  }
  return prefill;
}
