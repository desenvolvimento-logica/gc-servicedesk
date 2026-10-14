import { z } from "zod";

import type { FieldValidation } from "@/lib/catalog/field-row";
import type { FieldType } from "@/lib/catalog/field-types";

/**
 * Validation of a dynamic request form, built from the service's field
 * metadata. The same schema validates on the client (UX) and in the server
 * action (before calling the database, which validates again). Rules and
 * messages mirror `public.gestao_cadastros_create_request`.
 */

/** Active field of a requestable service, as rendered in the request form. */
export type RequestFormField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  /** Active options only (select/multiselect). */
  options: { value: string; label: string }[];
  placeholder: string | null;
  helpText: string | null;
  validation: FieldValidation;
};

/** Raw form state: every control holds a string, multiselect a string list. */
export type RequestFormInput = Record<string, string | string[]>;

/** Normalized value sent to the database; null means "not filled in". */
export type SubmittedValue = string | number | boolean | string[] | null;

export type RequestPayload = Record<string, SubmittedValue>;

/** Default limits when a field defines no maxLength (same as the database). */
export const TEXT_MAX_LENGTH = 500;
export const TEXTAREA_MAX_LENGTH = 5000;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const REQUIRED_MESSAGE = "Campo obrigatório.";

type Ctx = z.RefinementCtx;

function reject(ctx: Ctx, message: string): never {
  ctx.addIssue({ code: "custom", message });
  return z.NEVER;
}

/** Postgres char_length counts code points, not UTF-16 units. */
const charLength = (value: string) => [...value].length;

export function maxLengthOf(field: Pick<RequestFormField, "fieldType" | "validation">): number {
  return field.validation.maxLength ?? (field.fieldType === "textarea" ? TEXTAREA_MAX_LENGTH : TEXT_MAX_LENGTH);
}

export function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function textValue(field: RequestFormField) {
  return z.string().transform((raw, ctx): string | null => {
    const value = raw.trim();
    if (value === "") return field.required ? reject(ctx, REQUIRED_MESSAGE) : null;

    const { minLength } = field.validation;
    const maxLength = maxLengthOf(field);
    if (minLength !== undefined && charLength(value) < minLength) return reject(ctx, `Use no mínimo ${minLength} caracteres.`);
    if (charLength(value) > maxLength) return reject(ctx, `Use no máximo ${maxLength} caracteres.`);
    if (field.fieldType === "email" && (value.length > 254 || !EMAIL_PATTERN.test(value))) {
      return reject(ctx, "Informe um e-mail válido.");
    }
    return value;
  });
}

function numberValue(field: RequestFormField) {
  return z.string().transform((raw, ctx): number | null => {
    const value = raw.trim();
    if (value === "") return field.required ? reject(ctx, REQUIRED_MESSAGE) : null;
    if (!NUMBER_PATTERN.test(value)) return reject(ctx, "Informe um número.");

    const number = Number(value);
    const { min, max } = field.validation;
    if (!Number.isFinite(number)) return reject(ctx, "Informe um número.");
    if (min !== undefined && number < min) return reject(ctx, `Informe um valor maior ou igual a ${min}.`);
    if (max !== undefined && number > max) return reject(ctx, `Informe um valor menor ou igual a ${max}.`);
    return number;
  });
}

function dateValue(field: RequestFormField) {
  return z.string().transform((raw, ctx): string | null => {
    const value = raw.trim();
    if (value === "") return field.required ? reject(ctx, REQUIRED_MESSAGE) : null;
    return isValidIsoDate(value) ? value : reject(ctx, "Informe uma data válida.");
  });
}

function booleanValue(field: RequestFormField) {
  return z.string().transform((raw, ctx): boolean | null => {
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "") return field.required ? reject(ctx, REQUIRED_MESSAGE) : null;
    return reject(ctx, "Valor inválido.");
  });
}

function selectValue(field: RequestFormField) {
  const allowed = new Set(field.options.map((option) => option.value));
  return z.string().transform((raw, ctx): string | null => {
    if (raw === "") return field.required ? reject(ctx, REQUIRED_MESSAGE) : null;
    return allowed.has(raw) ? raw : reject(ctx, "Selecione uma opção válida.");
  });
}

function multiselectValue(field: RequestFormField) {
  const allowed = new Set(field.options.map((option) => option.value));
  return z.array(z.string()).transform((raw, ctx): string[] | null => {
    const values = [...new Set(raw)];
    if (values.length === 0) return field.required ? reject(ctx, REQUIRED_MESSAGE) : null;
    return values.every((value) => allowed.has(value)) ? values : reject(ctx, "Selecione opções válidas.");
  });
}

function fileValue() {
  return z.union([z.string(), z.array(z.string())]).transform((_raw, ctx) => reject(ctx, "Anexos ainda não são aceitos."));
}

function valueSchema(field: RequestFormField): z.ZodType<SubmittedValue, string | string[]> {
  switch (field.fieldType) {
    case "text":
    case "textarea":
    case "email":
      return textValue(field);
    case "number":
      return numberValue(field);
    case "date":
      return dateValue(field);
    case "boolean":
      return booleanValue(field);
    case "select":
      return selectValue(field);
    case "multiselect":
      return multiselectValue(field);
    case "file":
      return fileValue();
  }
}

/** Strict: values for fields that are not active in the service are rejected. */
export function buildRequestSchema(fields: readonly RequestFormField[]): z.ZodType<RequestPayload, RequestFormInput> {
  return z.strictObject(Object.fromEntries(fields.map((field) => [field.fieldKey, valueSchema(field)])));
}

export function defaultRequestValues(fields: readonly RequestFormField[]): RequestFormInput {
  return Object.fromEntries(fields.map((field) => [field.fieldKey, field.fieldType === "multiselect" ? [] : ""]));
}
