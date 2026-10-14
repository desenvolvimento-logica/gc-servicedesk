import { describe, expect, it } from "vitest";

import { filterUsers, type AdminUser } from "./users";

const user = (overrides: Partial<AdminUser>): AdminUser => ({
  userId: 1,
  name: "Ana Souza",
  email: "ana@exemplo.com",
  departmentName: "Fiscal",
  linked: true,
  canOpenRequests: false,
  isOperator: false,
  isAdministrator: false,
  ...overrides,
});

const users = [
  user({ userId: 1, name: "Ana Souza", isOperator: true }),
  user({ userId: 2, name: "Bruno Lima", email: "bruno@exemplo.com", isAdministrator: true, departmentName: "Desenvolvimento" }),
  user({ userId: 3, name: "Célia Reis", email: "celia@exemplo.com", canOpenRequests: true }),
];

describe("filterUsers", () => {
  it("filters by role or requester access", () => {
    expect(filterUsers(users, "with-role", "").map((item) => item.userId)).toEqual([1, 2]);
    expect(filterUsers(users, "operator", "").map((item) => item.userId)).toEqual([1]);
    expect(filterUsers(users, "administrator", "").map((item) => item.userId)).toEqual([2]);
    expect(filterUsers(users, "requester", "").map((item) => item.userId)).toEqual([3]);
  });

  it("searches name, e-mail and department ignoring accents and case", () => {
    expect(filterUsers(users, "all", "celia").map((item) => item.userId)).toEqual([3]);
    expect(filterUsers(users, "all", "DESENVOLV").map((item) => item.userId)).toEqual([2]);
    expect(filterUsers(users, "all", "bruno@").map((item) => item.userId)).toEqual([2]);
  });
});
