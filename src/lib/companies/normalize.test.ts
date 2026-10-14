import { describe, expect, it } from "vitest";

import { acessoriasCompanySchema, formatDocument, isActiveStatus, laterCursor, normalizeSearch, toCompanyRow } from "./normalize";

describe("toCompanyRow", () => {
  it("maps an Acessórias company to a local row", () => {
    const company = acessoriasCompanySchema.parse({
      ID: "123",
      Identificador: "12.345.678/0001-90",
      Razao: " Comércio Silva LTDA ",
      Fantasia: "Silva",
      Status: "Ativa",
      UF: "sp",
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
      tax_regime: null,
      search_text: "comercio silva ltda silva 12345678000190 123",
      acessorias_updated_at: "2026-10-15 08:30:00",
      synced_at: "2026-10-15T12:00:00Z",
    });
  });

  it("tolerates missing optional fields", () => {
    const row = toCompanyRow(acessoriasCompanySchema.parse({ ID: 7, Identificador: null, Razao: "" }), "now");
    expect(row).toMatchObject({ legal_name: "Empresa 7", trade_name: null, active: false, document: "" });
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
