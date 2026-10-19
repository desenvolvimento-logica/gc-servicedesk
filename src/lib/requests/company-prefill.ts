import type { Company } from "@/lib/companies/types";

import { COMPANY_CODE_FIELD, COMPANY_NAME_FIELD } from "./corrections";
import type { RequestFormField } from "./form-schema";

/** Field keys filled from the company picked in the form (when the service has them). */
export const TAX_REGIME_FIELD = "tributacao";
export const ACCOUNTING_FIELD = "contabilidade";

/**
 * Form values for the picked company. Values Acessórias does not have are
 * cleared (empty) so a previous company's data is not left behind; the
 * requester can still edit every field.
 */
export function companyFieldValues(
  fields: readonly Pick<RequestFormField, "fieldKey">[],
  company: Pick<Company, "id" | "legalName" | "taxRegime" | "accounting">,
): Record<string, string> {
  const candidates: [string, string | null][] = [
    [COMPANY_NAME_FIELD, company.legalName],
    [COMPANY_CODE_FIELD, String(company.id)],
    [TAX_REGIME_FIELD, company.taxRegime],
    [ACCOUNTING_FIELD, company.accounting],
  ];
  const values: Record<string, string> = {};
  for (const [key, value] of candidates) {
    if (fields.some((field) => field.fieldKey === key)) values[key] = value ?? "";
  }
  return values;
}
