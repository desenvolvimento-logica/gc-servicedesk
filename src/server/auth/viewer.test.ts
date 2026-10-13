import { describe, expect, it } from "vitest";

import { canOpenRequests, profileDtoSchema, resolveViewer, type ProfileDto } from "./viewer";

const fiscal = { id: 7, name: "Fiscal" };
const contabil = { id: 2, name: "Contábil" };
const dp = { id: 3, name: "Departamento Pessoal" };

const profile = (overrides: Partial<ProfileDto> = {}): ProfileDto => ({
  user_id: 10,
  name: "Maria Silva",
  email: "maria@escritoriologica.com.br",
  department: fiscal,
  roles: [],
  is_requester: true,
  request_departments: [fiscal],
  ...overrides,
});

describe("resolveViewer", () => {
  it("rejects logins not linked to a corporate user", () => {
    expect(resolveViewer(null)).toEqual({ status: "unlinked" });
  });

  it("authorizes a common requester for their own department only", () => {
    const result = resolveViewer(profile());

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.viewer).toMatchObject({ isRequester: true, isStaff: false, isOperator: false, isAdministrator: false });
    expect(result.viewer.requestDepartments).toEqual([fiscal]);
    expect(canOpenRequests(result.viewer)).toBe(true);
  });

  it("authorizes operators outside requester departments, for every department", () => {
    const result = resolveViewer(
      profile({
        department: { id: 15, name: "Tributário" },
        roles: ["operator"],
        is_requester: false,
        request_departments: [fiscal, contabil, dp],
      }),
    );

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.viewer).toMatchObject({ isOperator: true, isAdministrator: false, isStaff: true, isRequester: false });
    expect(result.viewer.requestDepartments).toHaveLength(3);
  });

  it("treats administrators as staff", () => {
    const result = resolveViewer(profile({ roles: ["administrator"], is_requester: false }));
    expect(result.status === "authorized" && result.viewer.isStaff).toBe(true);
  });

  it("denies linked users outside requester departments without a role", () => {
    const result = resolveViewer(
      profile({ department: { id: 1, name: "Comercial" }, is_requester: false, request_departments: [] }),
    );

    expect(result.status).toBe("no-access");
  });

  it("names departments without a name by id", () => {
    const result = resolveViewer(profile({ department: { id: 99, name: null } }));
    expect(result.status === "authorized" && result.viewer.department).toEqual({ id: 99, name: "Departamento 99" });
  });
});

describe("profileDtoSchema", () => {
  it("rejects unknown roles", () => {
    expect(() => profileDtoSchema.parse({ ...profile(), roles: ["superuser"] })).toThrow();
  });
});
