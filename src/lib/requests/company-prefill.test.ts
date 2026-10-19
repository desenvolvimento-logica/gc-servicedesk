import { describe, expect, it } from "vitest";

import { companyFieldValues } from "./company-prefill";

const fields = (...keys: string[]) => keys.map((fieldKey) => ({ fieldKey }));
const company = { id: 42, legalName: "Comércio Silva LTDA", taxRegime: "Lucro Real", accounting: "Bancária" as const };

describe("companyFieldValues", () => {
  it("fills the company fields the service has", () => {
    expect(companyFieldValues(fields("nome_empresa", "codigo_empresa", "tributacao", "contabilidade", "vigencia"), company)).toEqual({
      nome_empresa: "Comércio Silva LTDA",
      codigo_empresa: "42",
      tributacao: "Lucro Real",
      contabilidade: "Bancária",
    });
  });

  it("skips fields the service does not have", () => {
    expect(companyFieldValues(fields("nome_empresa", "codigo_empresa"), company)).toEqual({
      nome_empresa: "Comércio Silva LTDA",
      codigo_empresa: "42",
    });
  });

  it("clears values Acessórias does not have", () => {
    expect(companyFieldValues(fields("tributacao", "contabilidade"), { ...company, taxRegime: null, accounting: null })).toEqual({
      tributacao: "",
      contabilidade: "",
    });
  });
});
