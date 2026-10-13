import { fieldTypeHasLength, fieldTypeHasOptions, type FieldType } from "./field-types";
import type { FieldFormValues, FieldOption } from "./schemas";

const MAX_KEY_LENGTH = 63;

/** Stable identifier from a Portuguese label: "Código da empresa" → "codigo_da_empresa". */
export function toIdentifier(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const prefixed = /^[a-z]/.test(slug) ? slug : `campo_${slug}`.replace(/_+$/, "");
  return prefixed.slice(0, MAX_KEY_LENGTH).replace(/_+$/, "");
}

function uniqueIdentifier(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const tail = `_${suffix}`;
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - tail.length)}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Merges submitted options with the stored ones. Stored values never change
 * or disappear (requests may reference them): an omitted stored option is
 * kept as inactive, and new options get a value derived from their label.
 */
export function mergeOptions(submitted: readonly FieldOption[], stored: readonly FieldOption[]): FieldOption[] {
  const storedValues = new Set(stored.map((option) => option.value));
  const taken = new Set(storedValues);
  const merged: FieldOption[] = [];
  const kept = new Set<string>();

  for (const option of submitted) {
    if (option.value !== "" && storedValues.has(option.value) && !kept.has(option.value)) {
      kept.add(option.value);
      merged.push(option);
      continue;
    }
    const value = uniqueIdentifier(toIdentifier(option.label) || "opcao", taken);
    taken.add(value);
    merged.push({ ...option, value });
  }

  for (const option of stored) {
    if (!kept.has(option.value)) merged.push({ ...option, active: false });
  }

  return merged;
}

export type FieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
};

/** Validation rules relevant to the field type; anything else is dropped. */
export function buildValidation(type: FieldType, values: Pick<FieldFormValues, "minLength" | "maxLength" | "min" | "max">): FieldValidation {
  const validation: FieldValidation = {};
  if (fieldTypeHasLength(type)) {
    if (values.minLength !== null) validation.minLength = values.minLength;
    if (values.maxLength !== null) validation.maxLength = values.maxLength;
  }
  if (type === "number") {
    if (values.min !== null) validation.min = values.min;
    if (values.max !== null) validation.max = values.max;
  }
  return validation;
}

/** Editable database columns of a field, normalized for its (immutable) type. */
export function toFieldColumns(type: FieldType, values: FieldFormValues, storedOptions: readonly FieldOption[] = []) {
  return {
    label: values.label,
    required: values.required,
    placeholder: values.placeholder,
    help_text: values.helpText,
    options: fieldTypeHasOptions(type) ? mergeOptions(values.options, storedOptions) : [],
    validation: buildValidation(type, values),
  };
}
