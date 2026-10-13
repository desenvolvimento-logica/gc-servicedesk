import { describe, expect, it } from "vitest";

import { isNavItemActive, requesterNavigation } from "./navigation";

const activeFor = (pathname: string) =>
  requesterNavigation.filter((item) => isNavItemActive(item.href, pathname, requesterNavigation)).map((item) => item.href);

describe("requesterNavigation", () => {
  it("has unique absolute hrefs", () => {
    const hrefs = requesterNavigation.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
  });
});

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
