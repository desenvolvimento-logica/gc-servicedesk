import type { RequestFormField, SubmittedValue } from "./form-schema";
import type { SubmittedField } from "./types";

/** Display formatting (pt-BR) of request values and dates. */

export const EMPTY_VALUE = "—";

const TIME_ZONE = "America/Sao_Paulo";

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 20 });

/** "2026-10-14T13:05:00Z" → "14/10/2026, 10:05" (São Paulo time). */
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** Calendar date without time zone shifts: "2026-10-14" → "14/10/2026". */
export function formatIsoDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export const formatBoolean = (value: boolean) => (value ? "Sim" : "Não");

/** A value stored with a request, using the labels snapshotted at submission. */
export function formatSubmittedField(field: SubmittedField): string {
  switch (field.fieldType) {
    case "number":
      return field.number === null ? EMPTY_VALUE : numberFormat.format(field.number);
    case "date":
      return field.date === null ? EMPTY_VALUE : formatIsoDate(field.date);
    case "boolean":
      return field.boolean === null ? EMPTY_VALUE : formatBoolean(field.boolean);
    case "select":
    case "multiselect":
      return field.options?.length ? field.options.map((option) => option.label).join(", ") : EMPTY_VALUE;
    default:
      return field.text ?? EMPTY_VALUE;
  }
}

/** A value about to be submitted (review step), using the current option labels. */
export function formatPendingValue(field: RequestFormField, value: SubmittedValue): string {
  if (value === null) return EMPTY_VALUE;

  const optionLabel = (optionValue: string) =>
    field.options.find((option) => option.value === optionValue)?.label ?? optionValue;

  if (Array.isArray(value)) return value.map(optionLabel).join(", ");
  if (typeof value === "boolean") return formatBoolean(value);
  if (typeof value === "number") return numberFormat.format(value);
  if (field.fieldType === "date") return formatIsoDate(value);
  if (field.fieldType === "select") return optionLabel(value);
  return value;
}
