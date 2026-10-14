import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Port 3000: the only local callback allow-listed in Supabase Auth, so the
 * one-time Microsoft login (`pnpm e2e:login`) and the tests share a URL.
 *
 * Signed-in projects reuse a session saved by `pnpm e2e:login` in
 * e2e/.auth/ (git-ignored). Microsoft SSO itself is never automated; when a
 * session file is missing, that project's tests are skipped.
 */
const PORT = 3000;

export const STAFF_STATE = "e2e/.auth/staff.json";
export const REQUESTER_STATE = "e2e/.auth/requester.json";

const signedIn = (name: string, storageState: string, testMatch: RegExp) => ({
  name,
  testMatch,
  use: { ...devices["Desktop Chrome"], ...(existsSync(storageState) ? { storageState } : {}) },
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "on-first-retry",
  },
  projects: [
    { name: "anonymous", testMatch: /(smoke|headers)\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    signedIn("staff", STAFF_STATE, /\.staff\.spec\.ts/),
    signedIn("requester", REQUESTER_STATE, /\.requester\.spec\.ts/),
    // Interactive, run only through `pnpm e2e:login[:requester]` (headed, waits for you).
    ...(["staff", "requester"] as const).map((role) => ({
      name: role === "staff" ? "login" : "login-requester",
      testMatch: /login\.setup\.ts/,
      metadata: { role },
      use: { ...devices["Desktop Chrome"] },
      timeout: 300_000,
    })),
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
