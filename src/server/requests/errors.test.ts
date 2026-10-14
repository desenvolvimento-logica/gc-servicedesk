import { describe, expect, it } from "vitest";

import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";

import { createRequestErrorResult, INVALID_VALUES_MESSAGE, SERVICE_UNAVAILABLE_MESSAGE } from "./errors";

describe("createRequestErrorResult", () => {
  it("maps database validation details to field errors", () => {
    const result = createRequestErrorResult({
      code: "22023",
      message: "Invalid field values.",
      details: JSON.stringify({ nome_empresa: "Campo obrigatório." }),
    });
    expect(result).toEqual({
      ok: false,
      message: INVALID_VALUES_MESSAGE,
      fieldErrors: { nome_empresa: ["Campo obrigatório."] },
    });
  });

  it("treats payload errors without field details as an outdated form", () => {
    expect(createRequestErrorResult({ code: "22023", message: "Unknown field: x", details: null })).toEqual({
      ok: false,
      message: SERVICE_UNAVAILABLE_MESSAGE,
    });
  });

  it("maps missing services and permission errors", () => {
    expect(createRequestErrorResult({ code: "P0002" }).message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(createRequestErrorResult({ code: "42501" }).message).toBe(FORBIDDEN_MESSAGE);
  });

  it("never echoes unknown database messages", () => {
    const result = createRequestErrorResult({ code: "XX000", message: "internal detail" });
    expect(result.message).not.toContain("internal detail");
  });
});
