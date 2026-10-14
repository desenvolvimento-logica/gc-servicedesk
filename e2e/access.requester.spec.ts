import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { REQUESTER_STATE } from "../playwright.config";

/**
 * Requester session (member of a requester department, no GC role). Read-only:
 * checks that staff areas stay closed. Data privacy (own requests only,
 * internal notes hidden) is verified in the database checks.
 */

test.skip(!existsSync(REQUESTER_STATE), "Sem sessão de solicitante: rode `pnpm e2e:login:requester` antes.");

test("staff and admin areas are denied", async ({ page }) => {
  for (const path of ["/queue", "/reports", "/admin/services", "/admin/users"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access-denied$/);
  }
});

test("the CSV export is refused", async ({ request }) => {
  const response = await request.get("/reports/export");
  expect(response.status()).toBe(403);
});

test("the sidebar only shows requester entries", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Minhas Solicitações" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fila de Atendimento" })).toHaveCount(0);
});

test("an unknown or someone else's request is not found", async ({ page }) => {
  // Streamed pages may already have sent a 200 status: check the content.
  await page.goto("/requests/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
