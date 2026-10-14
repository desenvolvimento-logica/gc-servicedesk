import { describe, expect, it } from "vitest";

import { companyPrefill } from "./corrections";

const fields = [{ fieldKey: "nome_empresa" }, { fieldKey: "codigo_empresa" }, { fieldKey: "motivo_correcao" }];

describe("companyPrefill", () => {
  it("fills empty company fields from the original", () => {
    expect(
      companyPrefill(fields, { nome_empresa: "", codigo_empresa: " ", motivo_correcao: "" }, { companyName: "Empresa", companyCode: "001" }),
    ).toEqual({ nome_empresa: "Empresa", codigo_empresa: "001" });
  });

  it("never overwrites what the user typed", () => {
    expect(
      companyPrefill(fields, { nome_empresa: "Digitada", codigo_empresa: "" }, { companyName: "Empresa", companyCode: null }),
    ).toEqual({});
  });

  it("ignores fields the service does not have", () => {
    expect(companyPrefill([{ fieldKey: "motivo_correcao" }], {}, { companyName: "Empresa", companyCode: "001" })).toEqual({});
  });
});
