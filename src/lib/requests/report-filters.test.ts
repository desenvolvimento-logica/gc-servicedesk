import { describe, expect, it } from "vitest";

import { addDays, parseReportFilters, reportFiltersToSearch } from "./report-filters";

const today = "2026-10-15";

describe("parseReportFilters", () => {
  it("defaults to the current month", () => {
    expect(parseReportFilters({}, today)).toEqual({
      period: "month",
      from: "2026-10-01",
      to: today,
      department: null,
      service: null,
      kind: null,
    });
  });

  it("resolves the last 30 days including today", () => {
    expect(parseReportFilters({ period: "30d" }, today)).toMatchObject({ from: "2026-09-16", to: today });
  });

  it("accepts a valid custom period", () => {
    expect(parseReportFilters({ period: "custom", from: "2026-01-01", to: "2026-03-31" }, today)).toMatchObject({
      period: "custom",
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  it("falls back to the current month for an invalid custom period", () => {
    expect(parseReportFilters({ period: "custom", from: "2026-05-01", to: "2026-04-01" }, today).period).toBe("month");
    expect(parseReportFilters({ period: "custom", from: "2020-01-01", to: "2026-01-01" }, today).period).toBe("month");
  });

  it("keeps optional filters", () => {
    expect(
      parseReportFilters({ department: "7", kind: "correction", service: "00000000-0000-4000-8000-000000000000" }, today),
    ).toMatchObject({ department: 7, kind: "correction", service: "00000000-0000-4000-8000-000000000000" });
  });
});

describe("reportFiltersToSearch", () => {
  it("only writes dates for custom periods", () => {
    expect(reportFiltersToSearch(parseReportFilters({ period: "30d" }, today))).toBe("?period=30d");
    expect(reportFiltersToSearch(parseReportFilters({ period: "custom", from: "2026-01-01", to: "2026-01-31" }, today))).toBe(
      "?period=custom&from=2026-01-01&to=2026-01-31",
    );
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
