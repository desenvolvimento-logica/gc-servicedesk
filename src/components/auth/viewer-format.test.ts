import { describe, expect, it } from "vitest";

import { initials, roleLabel } from "./viewer-format";

describe("initials", () => {
  it.each([
    ["Ana Paula Bovi", "AB"],
    ["desenvolvimento", "D"],
    ["  maria   silva ", "MS"],
    ["", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("roleLabel", () => {
  it("prefers the highest role", () => {
    expect(roleLabel({ isAdministrator: true, isOperator: true })).toBe("Administrador");
    expect(roleLabel({ isAdministrator: false, isOperator: true })).toBe("Operador");
    expect(roleLabel({ isAdministrator: false, isOperator: false })).toBe("Solicitante");
  });
});
