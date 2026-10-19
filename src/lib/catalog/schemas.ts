import { z } from "zod";

import { FIELD_TYPES, fieldTypeHasLength, fieldTypeHasOptions, SERVICE_KINDS } from "./field-types";

/**
 * Catalog administration inputs. Shared by the client forms (UX validation)
 * and the server actions (authoritative validation). Limits mirror the
 * database CHECK constraints.
 */

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

const requiredText = (max: number) =>
  z.string().trim().min(1, "Campo obrigatório.").max(max, `Use no máximo ${max} caracteres.`);

/** Blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((value) => (value === "" ? null : value));

/** Empty number inputs arrive as NaN (valueAsNumber) or "": both mean "not set". */
const emptyToNull = (value: unknown) =>
  value === "" || value === undefined || value === null || (typeof value === "number" && Number.isNaN(value)) ? null : value;

const optionalInteger = (min: number, max: number) =>
  z.preprocess(
    emptyToNull,
    z.number({ error: "Informe um número inteiro." }).int("Informe um número inteiro.").min(min).max(max).nullable(),
  );

const optionalNumber = z.preprocess(emptyToNull, z.number({ error: "Informe um número." }).nullable());

const sortOrder = z
  .number({ error: "Informe um número inteiro." })
  .int("Informe um número inteiro.")
  .min(0, "Use um valor entre 0 e 9999.")
  .max(9999, "Use um valor entre 0 e 9999.");

export const idSchema = z.uuid();
/** Corporate departments are positive; the GC catch-all ("Demais Departamentos") is negative. */
export const dptoIdSchema = z.number().int().refine((id) => id !== 0);

export const serviceFormSchema = z.object({
  name: requiredText(120),
  description: optionalText(1000),
  sortOrder,
});

export const createServiceSchema = serviceFormSchema.extend({
  dptoId: dptoIdSchema,
  kind: z.enum(SERVICE_KINDS),
});

export type ServiceFormInput = z.input<typeof serviceFormSchema>;
export type ServiceFormValues = z.output<typeof serviceFormSchema>;
export type CreateServiceInput = z.input<typeof createServiceSchema>;
export type CreateServiceValues = z.output<typeof createServiceSchema>;

export const fieldOptionSchema = z.object({
  /** Stable stored value; blank for options not saved yet (assigned by the server). */
  value: z.string().trim().max(63),
  label: requiredText(120),
  active: z.boolean(),
});

export type FieldOption = z.output<typeof fieldOptionSchema>;

export const fieldFormSchema = z
  .object({
    label: requiredText(120),
    fieldKey: z
      .string()
      .trim()
      .regex(FIELD_KEY_PATTERN, "Use letras minúsculas sem acento, números e _, começando por uma letra (até 63)."),
    fieldType: z.enum(FIELD_TYPES),
    required: z.boolean(),
    placeholder: optionalText(200),
    helpText: optionalText(500),
    options: z.array(fieldOptionSchema).max(200, "Use no máximo 200 opções."),
    minLength: optionalInteger(0, 100000),
    maxLength: optionalInteger(1, 100000),
    min: optionalNumber,
    max: optionalNumber,
  })
  .superRefine((field, ctx) => {
    if (fieldTypeHasOptions(field.fieldType)) {
      if (!field.options.some((option) => option.active)) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Informe ao menos uma opção ativa." });
      }
      const seen = new Set<string>();
      field.options.forEach((option, index) => {
        const key = option.label.toLocaleLowerCase("pt-BR");
        if (seen.has(key)) {
          ctx.addIssue({ code: "custom", path: ["options", index, "label"], message: "Opção repetida." });
        }
        seen.add(key);
      });
    }
    if (fieldTypeHasLength(field.fieldType) && field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength) {
      ctx.addIssue({ code: "custom", path: ["maxLength"], message: "O máximo deve ser maior ou igual ao mínimo." });
    }
    if (field.fieldType === "number" && field.min !== null && field.max !== null && field.min > field.max) {
      ctx.addIssue({ code: "custom", path: ["max"], message: "O máximo deve ser maior ou igual ao mínimo." });
    }
  });

export type FieldFormInput = z.input<typeof fieldFormSchema>;
export type FieldFormValues = z.output<typeof fieldFormSchema>;
