import { describe, expect, it } from "vitest";

import { databaseErrorMessage, FORBIDDEN_MESSAGE } from "./errors";

describe("databaseErrorMessage", () => {
  it("maps known unique constraints", () => {
    expect(
      databaseErrorMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "gestao_cadastros_services_one_active_correction_key"',
      }),
    ).toBe("Este departamento já tem um serviço de correção ativo.");
    expect(databaseErrorMessage({ code: "23505", message: "other" })).toBe("Registro duplicado.");
  });

  it("never echoes the raw database message", () => {
    expect(databaseErrorMessage({ code: "XX000", message: "internal detail" })).not.toContain("internal detail");
    expect(databaseErrorMessage({ code: "42501" })).toBe(FORBIDDEN_MESSAGE);
  });
});
