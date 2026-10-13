import { describe, expect, it } from "vitest";

import { buildValidation, mergeOptions, toFieldColumns, toIdentifier } from "./field-row";
import { fieldFormSchema, type FieldFormInput } from "./schemas";

describe("toIdentifier", () => {
  it("strips accents and joins words with underscores", () => {
    expect(toIdentifier("Código da empresa")).toBe("codigo_da_empresa");
    expect(toIdentifier("  Nº da OS ")).toBe("n_da_os");
    expect(toIdentifier("SPED/EFD-Reinf")).toBe("sped_efd_reinf");
  });

  it("always starts with a letter", () => {
    expect(toIdentifier("123 conta")).toBe("campo_123_conta");
    expect(toIdentifier("")).toBe("campo");
  });

  it("is limited to 63 characters without a trailing underscore", () => {
    const key = toIdentifier("a".repeat(62) + " b");
    expect(key.length).toBeLessThanOrEqual(63);
    expect(key.endsWith("_")).toBe(false);
  });
});

describe("mergeOptions", () => {
  const stored = [
    { value: "simples", label: "Simples Nacional", active: true },
    { value: "presumido", label: "Lucro Presumido", active: true },
  ];

  it("keeps stored values and allows relabeling or deactivating them", () => {
    const merged = mergeOptions(
      [
        { value: "simples", label: "Simples", active: true },
        { value: "presumido", label: "Lucro Presumido", active: false },
      ],
      stored,
    );
    expect(merged).toEqual([
      { value: "simples", label: "Simples", active: true },
      { value: "presumido", label: "Lucro Presumido", active: false },
    ]);
  });

  it("never drops a stored option: omitted ones become inactive", () => {
    const merged = mergeOptions([{ value: "simples", label: "Simples Nacional", active: true }], stored);
    expect(merged).toContainEqual({ value: "presumido", label: "Lucro Presumido", active: false });
  });

  it("assigns unique values to new options, ignoring client-forged values", () => {
    const merged = mergeOptions(
      [
        { value: "", label: "Lucro Real", active: true },
        { value: "forged", label: "Simples", active: true },
        { value: "", label: "Simples!", active: true },
      ],
      stored,
    );
    expect(merged.slice(0, 3).map((option) => option.value)).toEqual(["lucro_real", "simples_2", "simples_3"]);
  });
});

describe("buildValidation", () => {
  const empty = { minLength: null, maxLength: null, min: null, max: null };

  it("keeps only rules that apply to the type", () => {
    const values = { minLength: 2, maxLength: 10, min: 1, max: 5 };
    expect(buildValidation("text", values)).toEqual({ minLength: 2, maxLength: 10 });
    expect(buildValidation("number", values)).toEqual({ min: 1, max: 5 });
    expect(buildValidation("email", values)).toEqual({});
    expect(buildValidation("text", empty)).toEqual({});
  });
});

describe("fieldFormSchema", () => {
  const base: FieldFormInput = {
    label: "Tributação",
    fieldKey: "tributacao",
    fieldType: "text",
    required: true,
    placeholder: "",
    helpText: "  ",
    options: [],
    minLength: Number.NaN,
    maxLength: "",
    min: null,
    max: undefined,
  };

  it("normalizes blanks to null", () => {
    const parsed = fieldFormSchema.parse(base);
    expect(parsed).toMatchObject({ placeholder: null, helpText: null, minLength: null, maxLength: null, min: null, max: null });
  });

  it("rejects invalid keys", () => {
    expect(fieldFormSchema.safeParse({ ...base, fieldKey: "Tributação" }).success).toBe(false);
    expect(fieldFormSchema.safeParse({ ...base, fieldKey: "1campo" }).success).toBe(false);
  });

  it("requires an active option for select fields and rejects duplicates", () => {
    const select = { ...base, fieldType: "select" as const };
    expect(fieldFormSchema.safeParse({ ...select, options: [] }).success).toBe(false);
    expect(fieldFormSchema.safeParse({ ...select, options: [{ value: "", label: "A", active: false }] }).success).toBe(false);
    expect(
      fieldFormSchema.safeParse({
        ...select,
        options: [
          { value: "", label: "Sim", active: true },
          { value: "", label: "sim", active: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects inverted ranges", () => {
    expect(fieldFormSchema.safeParse({ ...base, minLength: 10, maxLength: 2 }).success).toBe(false);
    expect(fieldFormSchema.safeParse({ ...base, fieldType: "number", min: 5, max: 1 }).success).toBe(false);
  });

  it("drops options from non-select types when building columns", () => {
    const parsed = fieldFormSchema.parse({ ...base, options: [{ value: "", label: "X", active: true }] });
    expect(toFieldColumns("text", parsed).options).toEqual([]);
  });
});
