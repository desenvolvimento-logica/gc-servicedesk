import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runCompanySync = vi.fn();
vi.mock("@/server/companies/run-sync", () => ({ runCompanySync: (...args: unknown[]) => runCompanySync(...args) }));

const { GET } = await import("./route");

const SECRET = "x".repeat(40);
const call = (authorization?: string) =>
  GET(new NextRequest("http://localhost/api/cron/companies-sync", { headers: authorization ? { authorization } : {} }));

describe("cron companies sync route", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    runCompanySync.mockResolvedValue({ status: "success", mode: "incremental", pages: 0, upserted: 0 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    runCompanySync.mockReset();
  });

  it("rejects calls without the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(runCompanySync).not.toHaveBeenCalled();
  });

  it("runs the sync with the right secret", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(runCompanySync).toHaveBeenCalledWith("cron", null);
  });

  it("refuses everything when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });
});
