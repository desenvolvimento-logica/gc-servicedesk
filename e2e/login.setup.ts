import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test } from "@playwright/test";

import { REQUESTER_STATE, STAFF_STATE } from "../playwright.config";

/**
 * One-time interactive login: `pnpm e2e:login` (staff) or
 * `pnpm e2e:login:requester`. A browser opens on the login page; sign in
 * with Microsoft by hand. The session is saved to e2e/.auth/ (git-ignored)
 * and reused by the signed-in tests until it expires.
 */
test("save a signed-in session", async ({ page }, testInfo) => {
  const role = testInfo.project.metadata.role === "requester" ? "requester" : "staff";
  const statePath = role === "requester" ? REQUESTER_STATE : STAFF_STATE;

  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar com Microsoft" }).click();

  // Waits for you to finish the Microsoft login (up to 5 minutes).
  await page.waitForURL((url) => url.host === "localhost:3000" && url.pathname === "/", { timeout: 290_000 });
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

  mkdirSync(dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
});
