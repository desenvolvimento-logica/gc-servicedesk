import { describe, expect, it } from "vitest";

import { companySearchTerm } from "./types";

describe("companySearchTerm", () => {
  it("searches documents by digits", () => {
    expect(companySearchTerm("12.345.678/0001-90")).toBe("12345678000190");
    expect(companySearchTerm(" 123 ")).toBe("123");
  });

  it("normalizes names and drops wildcard characters", () => {
    expect(companySearchTerm("Padaria São João %_*")).toBe("padaria sao joao");
    expect(companySearchTerm("Silva & Filhos, Ltda.")).toBe("silva filhos ltda");
  });
});
