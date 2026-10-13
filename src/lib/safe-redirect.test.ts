import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeRedirectPath("/requests/new")).toBe("/requests/new");
    expect(safeRedirectPath("/requests?page=2#top")).toBe("/requests?page=2#top");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["absolute URL", "https://evil.example/phish"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["relative path", "requests"],
    ["javascript scheme", "javascript:alert(1)"],
  ])("falls back for %s", (_label, target) => {
    expect(safeRedirectPath(target)).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/login")).toBe("/login");
  });
});
