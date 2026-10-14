import { describe, expect, it } from "vitest";

import {
  buildRequestSchema,
  defaultRequestValues,
  isValidIsoDate,
  REQUIRED_MESSAGE,
  TEXT_MAX_LENGTH,
  type RequestFormField,
} from "./form-schema";

const field = (overrides: Partial<RequestFormField> & Pick<RequestFormField, "fieldKey" | "fieldType">): RequestFormField => ({
  id: crypto.randomUUID(),
  label: overrides.fieldKey,
  required: false,
  options: [],
  placeholder: null,
  helpText: null,
  validation: {},
  ...overrides,
});

const options = [
  { value: "simples", label: "Simples Nacional" },
  { value: "presumido", label: "Lucro Presumido" },
];

function errorsOf(fields: RequestFormField[], input: Record<string, string | string[]>) {
  const result = buildRequestSchema(fields).safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("buildRequestSchema", () => {
  it("trims text and turns blank optional values into null", () => {
    const fields = [
      field({ fieldKey: "nome_empresa", fieldType: "text", required: true }),
      field({ fieldKey: "observacoes", fieldType: "textarea" }),
    ];
    expect(buildRequestSchema(fields).parse({ nome_empresa: "  Empresa  ", observacoes: "   " })).toEqual({
      nome_empresa: "Empresa",
      observacoes: null,
    });
  });

  it("requires required fields after trimming", () => {
    const fields = [field({ fieldKey: "nome_empresa", fieldType: "text", required: true })];
    expect(errorsOf(fields, { nome_empresa: "   " })).toEqual({ nome_empresa: REQUIRED_MESSAGE });
  });

  it("applies length rules, with a default maximum", () => {
    const fields = [
      field({ fieldKey: "curto", fieldType: "text", validation: { minLength: 3, maxLength: 5 } }),
      field({ fieldKey: "livre", fieldType: "text" }),
    ];
    expect(errorsOf(fields, { curto: "ab", livre: "x".repeat(TEXT_MAX_LENGTH + 1) })).toEqual({
      curto: "Use no mínimo 3 caracteres.",
      livre: `Use no máximo ${TEXT_MAX_LENGTH} caracteres.`,
    });
    expect(errorsOf(fields, { curto: "abcde", livre: "x".repeat(TEXT_MAX_LENGTH) })).toEqual({});
  });

  it("validates e-mails", () => {
    const fields = [field({ fieldKey: "email", fieldType: "email" })];
    expect(errorsOf(fields, { email: "nao-e-email" })).toEqual({ email: "Informe um e-mail válido." });
    expect(buildRequestSchema(fields).parse({ email: "a@b.com.br" })).toEqual({ email: "a@b.com.br" });
  });

  it("parses numbers within bounds", () => {
    const fields = [field({ fieldKey: "qtd", fieldType: "number", validation: { min: 1, max: 10 } })];
    expect(buildRequestSchema(fields).parse({ qtd: "2.5" })).toEqual({ qtd: 2.5 });
    expect(errorsOf(fields, { qtd: "abc" })).toEqual({ qtd: "Informe um número." });
    expect(errorsOf(fields, { qtd: "0" })).toEqual({ qtd: "Informe um valor maior ou igual a 1." });
    expect(errorsOf(fields, { qtd: "11" })).toEqual({ qtd: "Informe um valor menor ou igual a 10." });
  });

  it("accepts only real ISO dates", () => {
    const fields = [field({ fieldKey: "vigencia", fieldType: "date" })];
    expect(buildRequestSchema(fields).parse({ vigencia: "2026-02-28" })).toEqual({ vigencia: "2026-02-28" });
    expect(errorsOf(fields, { vigencia: "2026-02-30" })).toEqual({ vigencia: "Informe uma data válida." });
  });

  it("maps boolean answers and requires an answer when required", () => {
    const fields = [field({ fieldKey: "contabilidade", fieldType: "boolean", required: true })];
    expect(buildRequestSchema(fields).parse({ contabilidade: "false" })).toEqual({ contabilidade: false });
    expect(errorsOf(fields, { contabilidade: "" })).toEqual({ contabilidade: REQUIRED_MESSAGE });
  });

  it("only accepts configured options", () => {
    const fields = [
      field({ fieldKey: "tributacao", fieldType: "select", options }),
      field({ fieldKey: "impostos", fieldType: "multiselect", options }),
    ];
    expect(buildRequestSchema(fields).parse({ tributacao: "simples", impostos: ["presumido", "presumido"] })).toEqual({
      tributacao: "simples",
      impostos: ["presumido"],
    });
    expect(errorsOf(fields, { tributacao: "real", impostos: ["outro"] })).toEqual({
      tributacao: "Selecione uma opção válida.",
      impostos: "Selecione opções válidas.",
    });
    expect(buildRequestSchema(fields).parse({ tributacao: "", impostos: [] })).toEqual({ tributacao: null, impostos: null });
  });

  it("rejects attachment fields until attachments are approved", () => {
    const fields = [field({ fieldKey: "anexo", fieldType: "file" })];
    expect(errorsOf(fields, { anexo: "" })).toEqual({ anexo: "Anexos ainda não são aceitos." });
  });

  it("rejects values for fields that are not in the service", () => {
    const fields = [field({ fieldKey: "nome_empresa", fieldType: "text" })];
    expect(buildRequestSchema(fields).safeParse({ nome_empresa: "x", injetado: "y" }).success).toBe(false);
  });
});

describe("defaultRequestValues", () => {
  it("starts every control empty", () => {
    const fields = [field({ fieldKey: "a", fieldType: "text" }), field({ fieldKey: "b", fieldType: "multiselect", options })];
    expect(defaultRequestValues(fields)).toEqual({ a: "", b: [] });
  });
});

describe("isValidIsoDate", () => {
  it.each([
    ["2026-10-14", true],
    ["2024-02-29", true],
    ["2026-13-01", false],
    ["14/10/2026", false],
  ])("%s → %s", (value, expected) => {
    expect(isValidIsoDate(value)).toBe(expected);
  });
});
