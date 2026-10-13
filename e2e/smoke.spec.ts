import { expect, test } from "@playwright/test";

// Signed-in flows go through Microsoft SSO and are verified manually; these
// tests cover what an anonymous visitor can and cannot reach.

test("login page offers Microsoft sign-in", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Acesse com sua conta corporativa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com Microsoft" })).toBeEnabled();
});

test("anonymous visitors are sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("the requested path is preserved for after sign-in", async ({ page }) => {
  await page.goto("/requests/new");

  await expect(page).toHaveURL(/\/login\?next=%2Frequests%2Fnew$/);
  await expect(page.locator('input[name="next"]')).toHaveValue("/requests/new");
});

test("restricted areas are not reachable anonymously", async ({ page }) => {
  for (const path of ["/queue", "/admin", "/access-denied"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("login errors are shown in Portuguese", async ({ page }) => {
  await page.goto("/login?error=callback");
  await expect(page.getByRole("alert").filter({ hasText: "O login não foi concluído" })).toBeVisible();
});

test("an unsafe next parameter is discarded", async ({ page }) => {
  await page.goto("/login?next=https://evil.example");
  await expect(page.locator('input[name="next"]')).toHaveValue("/");
});
