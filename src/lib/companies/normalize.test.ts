import { describe, expect, it } from "vitest";

import {
  acessoriasCompanySchema,
  formatDocument,
  isActiveStatus,
  laterCursor,
  normalizeSearch,
  parseRegime,
  toCompanyRow,
} from "./normalize";

describe("toCompanyRow", () => {
  it("maps an Acessórias company to a local row", () => {
    const company = acessoriasCompanySchema.parse({
      ID: "123",
      Identificador: "12.345.678/0001-90",
      Razao: " Comércio Silva LTDA ",
      Fantasia: "Silva",
      Status: "Ativa",
      UF: "sp",
      Regime: "LUCRO REAL C INSCRIÇÃO - COM FUNCIONÁRIOS - C BANCÁRIA",
      DtLastDH: "2026-10-15 08:30:00",
      Extra: "ignored",
    });
    expect(toCompanyRow(company, "2026-10-15T12:00:00Z")).toEqual({
      acessorias_id: 123,
      document: "12345678000190",
      legal_name: "Comércio Silva LTDA",
      trade_name: "Silva",
      active: true,
      uf: "SP",
      tax_regime: "Lucro Real",
      acessorias_regime: "LUCRO REAL C INSCRIÇÃO - COM FUNCIONÁRIOS - C BANCÁRIA",
      accounting: "Bancária",
      search_text: "comercio silva ltda silva 12345678000190 123",
      acessorias_updated_at: "2026-10-15 08:30:00",
      synced_at: "2026-10-15T12:00:00Z",
    });
  });

  it("tolerates missing optional fields", () => {
    const row = toCompanyRow(acessoriasCompanySchema.parse({ ID: 7, Identificador: null, Razao: "" }), "now");
    expect(row).toMatchObject({
      legal_name: "Empresa 7",
      trade_name: null,
      active: false,
      document: "",
      tax_regime: null,
      acessorias_regime: null,
      accounting: null,
    });
  });
});

describe("parseRegime", () => {
  // Every Regime returned by Acessórias for active companies (2026-10-19).
  it.each([
    ["SIMPLES NACIONAL C INSCRIÇÃO - COM FUNCIONÁRIOS - CONT FISCAL", "Simples Nacional", "Fiscal"],
    ["SIMPLES NACIONAL S INSCRIÇÃO - SEM FUNCIONÁRIOS - C BANCARIA", "Simples Nacional", "Bancária"],
    ["SIMPLES NACIONAL C INSCRIÇÃO - COM FUNCIONÁRIOS - C BANCARIA", "Simples Nacional", "Bancária"],
    ["HOLDING LP - SEM FUNCIONÁRIOS - SEM INSCRIÇÃO - C BANCÁRIA", "Holding LP", "Bancária"],
    ["HOLDING LP - SEM FUNCIONÁRIOS - SEM INSCRIÇÃO - CONT FISCAL", "Holding LP", "Fiscal"],
    ["HOLDING LP - COM FUNCIONÁRIOS - COM INSCRIÇÃO - C FISCAL", "Holding LP", "Fiscal"],
    ["HOLDING LR - SEM FUNCIONÁRIOS - SEM INSCRIÇÃO - C BANCÁRIA", "Holding LR", "Bancária"],
    ["LUCRO PRESUMIDO C INSCRIÇÃO - COM FUNCIONÁRIOS - CONT FISCAL", "Lucro Presumido", "Fiscal"],
    ["LUCRO PRESUMIDO S INSCRIÇÃO - SEM FUNCIONÁRIOS - C BANCARIA", "Lucro Presumido", "Bancária"],
    ["LUCRO REAL C INSCRIÇÃO - COM FUNCIONÁRIOS - C BANCÁRIA", "Lucro Real", "Bancária"],
    ["LUCRO REAL  S INSCRIÇÃO - SEM FUNCIONÁRIOS - C BANCARIA", "Lucro Real", "Bancária"],
    ["SEM MOVIMENTO LUCRO PRESUMIDO - REAL", "Sem movimento - Lucro Presumido/Real", "Não"],
    ["SEM MOVIMENTO SIMPLES NACIONAL", "Sem movimento - Simples Nacional", "Não"],
    ["SIMPLES E RPA - COM FUNCIONÁRIOS - CONT FISCAL", "Simples Nacional e RPA", "Fiscal"],
    ["SIMPLES E RPA - COM FUNCIONÁRIOS - C BANCARIA", "Simples Nacional e RPA", "Bancária"],
    ["RET - REGIME ESPECIAL DE TRIBUTAÇÃO SEM FUNCIONÁRIOS", "RET", "Não"],
    ["SEM FINS LUCRATIVOS SFUNCIONARIOS", "Sem fins lucrativos", "Não"],
    ["SEM FINS LUCRATIVOS CFUNCIONÁRIOS", "Sem fins lucrativos", "Não"],
    ["DOMÉSTICA", "Doméstica", "Não"],
    ["COM FUNCIONÁRIOS SOMENTE DP", "COM FUNCIONÁRIOS SOMENTE DP", "Não"],
    ["CLIENTE BALCÃO ", "CLIENTE BALCÃO", "Não"],
    ["CONSULTORIA  (Fiscal)", "CONSULTORIA (Fiscal)", "Não"],
  ])("%s", (regime, taxRegime, accounting) => {
    expect(parseRegime(regime)).toEqual({ taxRegime, accounting });
  });

  it("returns nothing when Acessórias has no Regime", () => {
    expect(parseRegime(undefined)).toEqual({ taxRegime: null, accounting: null });
    expect(parseRegime("  ")).toEqual({ taxRegime: null, accounting: null });
  });
});

describe("helpers", () => {
  it("detects active status regardless of case and accents", () => {
    expect(isActiveStatus("ATIVA")).toBe(true);
    expect(isActiveStatus("Inativa")).toBe(false);
    expect(isActiveStatus(undefined)).toBe(false);
  });

  it("keeps the latest cursor", () => {
    expect(laterCursor(null, "2026-10-01 10:00:00")).toBe("2026-10-01 10:00:00");
    expect(laterCursor("2026-10-02 00:00:00", "2026-10-01 10:00:00")).toBe("2026-10-02 00:00:00");
    expect(laterCursor("2026-10-02 00:00:00", null)).toBe("2026-10-02 00:00:00");
  });

  it("normalizes search text and formats documents", () => {
    expect(normalizeSearch("  Padaria   São João ")).toBe("padaria sao joao");
    expect(formatDocument("12345678000190")).toBe("12.345.678/0001-90");
    expect(formatDocument("12345678901")).toBe("123.456.789-01");
  });
});
