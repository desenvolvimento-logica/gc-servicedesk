import { describe, expect, it } from "vitest";

import {
  parseQueueFilters,
  queueFiltersToSearch,
  sanitizeSearch,
  startOfNextDaySaoPaulo,
  todaySaoPaulo,
} from "./queue-filters";

describe("sanitizeSearch", () => {
  it("removes characters that would break a PostgREST filter or act as wildcards", () => {
    expect(sanitizeSearch(' GC-2026,(x)*"%  ')).toBe("GC-2026 x");
    expect(sanitizeSearch("Comércio Silva Ltda.")).toBe("Comércio Silva Ltda.");
    expect(sanitizeSearch("a".repeat(150))).toHaveLength(100);
  });
});

describe("parseQueueFilters", () => {
  it("defaults to the active requests, first page", () => {
    expect(parseQueueFilters({})).toEqual({
      q: "",
      status: "active",
      kind: null,
      department: null,
      service: null,
      assignee: null,
      from: null,
      to: null,
      page: 1,
    });
  });

  it("parses valid values and drops invalid ones", () => {
    const filters = parseQueueFilters({
      q: "Empresa",
      status: "closed",
      department: "7",
      service: "not-a-uuid",
      assignee: "unassigned",
      from: "2026-10-01",
      to: "2026-13-01",
      page: "-2",
    });
    expect(filters).toMatchObject({
      q: "Empresa",
      status: "closed",
      department: 7,
      service: null,
      assignee: "unassigned",
      from: "2026-10-01",
      to: null,
      page: 1,
    });
    expect(parseQueueFilters({ status: "reopened", assignee: "12", kind: "other" })).toMatchObject({
      status: "active",
      assignee: 12,
      kind: null,
    });
    expect(parseQueueFilters({ kind: "correction" }).kind).toBe("correction");
  });

  it("round-trips through the URL, omitting defaults", () => {
    const filters = parseQueueFilters({ q: "abc", assignee: "3", page: "2" });
    expect(queueFiltersToSearch(filters)).toBe("?q=abc&assignee=3&page=2");
    expect(queueFiltersToSearch(parseQueueFilters({}))).toBe("");
  });
});

describe("São Paulo dates", () => {
  it("computes the exclusive end of a day, across month ends", () => {
    expect(startOfNextDaySaoPaulo("2026-10-31")).toBe("2026-11-01T00:00:00-03:00");
  });

  it("uses the São Paulo calendar day", () => {
    expect(todaySaoPaulo(new Date("2026-10-15T02:00:00Z"))).toBe("2026-10-14");
  });
});
