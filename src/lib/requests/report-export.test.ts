import { describe, expect, it } from "vitest";

import { buildExportTable, resolutionHours, type ExportRow } from "./report-export";

const row = (overrides: Partial<ExportRow>): ExportRow => ({
  requestNumber: "GC-2026-000001",
  serviceKind: "standard",
  departmentName: "Fiscal",
  serviceName: "Senha gerente",
  companyName: "Empresa",
  companyCode: "001",
  status: "closed",
  requesterName: "Ana",
  requesterEmail: "ana@exemplo.com",
  assignedToName: "Bia",
  openedAt: "2026-10-14T13:00:00Z",
  completedAt: "2026-10-14T15:30:00Z",
  closedByName: "Bia",
  originalRequestNumber: null,
  originalOperatorName: null,
  fieldValues: null,
  ...overrides,
});

const value = (fieldKey: string, label: string, sortOrder: number, text: string | null) => ({
  fieldKey,
  label,
  fieldType: "text" as const,
  sortOrder,
  text,
  number: null,
  date: null,
  boolean: null,
  options: null,
});

describe("buildExportTable", () => {
  it("writes the fixed columns", () => {
    const [header, first] = buildExportTable([row({})]);
    expect(header?.slice(0, 3)).toEqual(["Protocolo", "Tipo", "Departamento"]);
    expect(first).toContain("GC-2026-000001");
    expect(first).toContain("Concluída");
    expect(first).toContain("14/10/2026, 10:00");
    expect(first).toContain("2,5");
  });

  it("adds one column per submitted field, using the latest label and order", () => {
    const table = buildExportTable([
      row({ fieldValues: [value("numero_os", "Nº OS", 2, "10"), value("acumulador", "Acumulador", 1, "A1")] }),
      row({ requestNumber: "GC-2026-000002", fieldValues: [value("numero_os", "Número da OS", 0, null)] }),
    ]);
    const header = table[0] ?? [];
    expect(header.slice(-2)).toEqual(["Número da OS", "Acumulador"]);
    expect(table[1]?.slice(-2)).toEqual(["10", "A1"]);
    expect(table[2]?.slice(-2)).toEqual(["", ""]);
  });
});

describe("resolutionHours", () => {
  it("is empty for open requests", () => {
    expect(resolutionHours("2026-10-14T13:00:00Z", null)).toBe("");
  });
});
