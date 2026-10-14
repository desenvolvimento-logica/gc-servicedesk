import { describe, expect, it } from "vitest";

import { canTransition, isLocked, nextStatuses } from "./workflow";

describe("status transitions", () => {
  it("only moves forward", () => {
    expect(nextStatuses("open")).toEqual(["in_progress", "closed"]);
    expect(nextStatuses("in_progress")).toEqual(["closed"]);
    expect(canTransition("in_progress", "open")).toBe(false);
    expect(canTransition("closed", "open")).toBe(false);
  });

  it("locks closed requests", () => {
    expect(nextStatuses("closed")).toEqual([]);
    expect(isLocked("closed")).toBe(true);
    expect(isLocked("in_progress")).toBe(false);
  });
});
