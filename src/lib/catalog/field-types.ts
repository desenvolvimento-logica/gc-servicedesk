/** Mirrors the database enum `public.gestao_cadastros_field_type`. */
export const FIELD_TYPES = ["text", "textarea", "number", "date", "email", "select", "multiselect", "boolean", "file"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldTypeLabels: Record<FieldType, string> = {
  text: "Texto",
  textarea: "Texto longo",
  number: "Número",
  date: "Data",
  email: "E-mail",
  select: "Seleção",
  multiselect: "Seleção múltipla",
  boolean: "Sim/Não",
  file: "Anexo",
};

/**
 * Types an administrator may create or activate. `file` stays out until the
 * attachment rules are approved (specs/06-dynamic-form-engine.md).
 */
export const SUPPORTED_FIELD_TYPES: readonly FieldType[] = FIELD_TYPES.filter((type) => type !== "file");

export const isSupportedFieldType = (type: FieldType) => SUPPORTED_FIELD_TYPES.includes(type);

export const fieldTypeHasOptions = (type: FieldType) => type === "select" || type === "multiselect";

export const fieldTypeHasLength = (type: FieldType) => type === "text" || type === "textarea";

/** Mirrors the database enum `public.gestao_cadastros_service_kind`. */
export const SERVICE_KINDS = ["standard", "correction"] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const serviceKindLabels: Record<ServiceKind, string> = {
  standard: "Padrão",
  correction: "Correção / Refazer",
};
