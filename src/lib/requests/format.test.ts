import { describe, expect, it } from "vitest";

import { describeEvent, EMPTY_VALUE, formatDateTime, formatIsoDate, formatPendingValue, formatSubmittedField } from "./format";
import type { RequestFormField } from "./form-schema";
import type { SubmittedField } from "./types";

const submitted = (overrides: Partial<SubmittedField> & Pick<SubmittedField, "fieldType">): SubmittedField => ({
  fieldKey: "campo",
  label: "Campo",
  text: null,
  number: null,
  date: null,
  boolean: null,
  options: null,
  ...overrides,
});

describe("formatSubmittedField", () => {
  it("formats each stored type", () => {
    expect(formatSubmittedField(submitted({ fieldType: "text", text: "Empresa" }))).toBe("Empresa");
    expect(formatSubmittedField(submitted({ fieldType: "number", number: 1234.5 }))).toBe("1.234,5");
    expect(formatSubmittedField(submitted({ fieldType: "date", date: "2026-10-14" }))).toBe("14/10/2026");
    expect(formatSubmittedField(submitted({ fieldType: "boolean", boolean: false }))).toBe("Não");
    expect(
      formatSubmittedField(
        submitted({
          fieldType: "multiselect",
          options: [
            { value: "icms", label: "ICMS" },
            { value: "pis", label: "PIS" },
          ],
        }),
      ),
    ).toBe("ICMS, PIS");
  });

  it("shows a dash for empty values", () => {
    expect(formatSubmittedField(submitted({ fieldType: "textarea" }))).toBe(EMPTY_VALUE);
    expect(formatSubmittedField(submitted({ fieldType: "select", options: [] }))).toBe(EMPTY_VALUE);
  });
});

describe("formatPendingValue", () => {
  const select: RequestFormField = {
    id: "1",
    fieldKey: "tributacao",
    label: "Tributação",
    fieldType: "select",
    required: true,
    options: [{ value: "simples", label: "Simples Nacional" }],
    placeholder: null,
    helpText: null,
    validation: {},
  };

  it("uses the option labels", () => {
    expect(formatPendingValue(select, "simples")).toBe("Simples Nacional");
    expect(formatPendingValue({ ...select, fieldType: "multiselect" }, ["simples"])).toBe("Simples Nacional");
  });

  it("formats dates, booleans and empty values", () => {
    expect(formatPendingValue({ ...select, fieldType: "date" }, "2026-01-31")).toBe("31/01/2026");
    expect(formatPendingValue({ ...select, fieldType: "boolean" }, true)).toBe("Sim");
    expect(formatPendingValue(select, null)).toBe(EMPTY_VALUE);
  });
});

describe("dates", () => {
  it("formats ISO calendar dates without time zone shifts", () => {
    expect(formatIsoDate("2026-01-01")).toBe("01/01/2026");
  });

  it("formats timestamps in São Paulo time", () => {
    expect(formatDateTime("2026-10-14T13:05:00Z")).toBe("14/10/2026, 10:05");
  });
});

describe("describeEvent", () => {
  it("describes workflow events", () => {
    expect(describeEvent({ eventType: "status_changed", details: { fromStatus: "open", toStatus: "in_progress" } })).toBe(
      "Aberta → Em andamento",
    );
    expect(describeEvent({ eventType: "assigned", details: { assigneeName: "Ana" } })).toBe("Atribuída a Ana.");
    expect(describeEvent({ eventType: "assigned", details: { previousAssigneeName: "Ana", assigneeName: "Bia" } })).toBe(
      "De Ana para Bia.",
    );
    expect(describeEvent({ eventType: "unassigned", details: { previousAssigneeName: "Ana" } })).toBe(
      "Ana deixou de ser o responsável.",
    );
    expect(describeEvent({ eventType: "internal_note_added", details: { text: "Nota" } })).toBe("Nota");
    expect(describeEvent({ eventType: "comment_added", details: { text: "Pode enviar o arquivo?" } })).toBe("Pode enviar o arquivo?");
  });
});
