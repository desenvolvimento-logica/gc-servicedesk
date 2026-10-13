import { describe, expect, it } from "vitest";

import type { Viewer } from "@/server/auth/viewer";

import { buildNavigation } from "./build-navigation";
import { isNavItemActive, type NavItem } from "./navigation";

const baseViewer: Viewer = {
  userId: 1,
  name: "Maria Silva",
  email: "maria@escritoriologica.com.br",
  department: { id: 7, name: "Fiscal" },
  isRequester: true,
  isOperator: false,
  isAdministrator: false,
  isStaff: false,
  requestDepartments: [{ id: 7, name: "Fiscal" }],
};

const hrefs = (viewer: Viewer) => buildNavigation(viewer).flatMap((section) => section.items.map((item) => item.href));

describe("buildNavigation", () => {
  it("gives requesters only the requester screens", () => {
    expect(hrefs(baseViewer)).toEqual(["/", "/requests/new", "/requests", "/help"]);
  });

  it("adds the service desk section for operators", () => {
    const operator = { ...baseViewer, isRequester: false, isOperator: true, isStaff: true };
    expect(hrefs(operator)).toEqual(["/", "/requests/new", "/requests", "/help", "/queue", "/reports"]);
  });

  it("adds administration for administrators", () => {
    const admin = { ...baseViewer, isAdministrator: true, isStaff: true };
    expect(hrefs(admin)).toEqual(expect.arrayContaining(["/admin/services", "/admin/departments"]));
  });

  it("hides 'Nova Solicitação' when no department is available", () => {
    expect(hrefs({ ...baseViewer, requestDepartments: [] })).not.toContain("/requests/new");
  });

  it("never repeats an href", () => {
    const admin = { ...baseViewer, isOperator: true, isAdministrator: true, isStaff: true };
    const all = hrefs(admin);
    expect(new Set(all).size).toBe(all.length);
  });
});

const items: NavItem[] = buildNavigation({ ...baseViewer, isAdministrator: true, isStaff: true }).flatMap(
  (section) => section.items,
);
const activeFor = (pathname: string) =>
  items.filter((item) => isNavItemActive(item.href, pathname, items)).map((item) => item.href);

describe("isNavItemActive", () => {
  it("matches the home entry only on the root path", () => {
    expect(activeFor("/")).toEqual(["/"]);
    expect(activeFor("/help")).toEqual(["/help"]);
  });

  it("prefers the most specific entry", () => {
    expect(activeFor("/requests/new")).toEqual(["/requests/new"]);
    expect(activeFor("/requests")).toEqual(["/requests"]);
  });

  it("keeps the parent entry active on nested detail routes", () => {
    expect(activeFor("/requests/123")).toEqual(["/requests"]);
  });

  it("does not match routes that only share a prefix", () => {
    expect(activeFor("/requests-archive")).toEqual([]);
  });
});
