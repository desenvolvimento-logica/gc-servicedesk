import { describe, expect, it } from "vitest";

import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";

import { roleErrorMessage } from "./role-errors";

describe("roleErrorMessage", () => {
  it("explains the administrator guards", () => {
    expect(roleErrorMessage({ code: "55000", hint: "self" })).toContain("próprio papel");
    expect(roleErrorMessage({ code: "55000", hint: "last_admin" })).toContain("pelo menos um administrador");
  });

  it("maps permission and unknown errors", () => {
    expect(roleErrorMessage({ code: "42501" })).toBe(FORBIDDEN_MESSAGE);
    expect(roleErrorMessage({ code: "XX000" })).toBe("Não foi possível alterar o papel. Tente novamente.");
  });
});
