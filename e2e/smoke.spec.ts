import { expect, test } from "@playwright/test";

test("login page offers Microsoft sign-in (disabled until Phase 2)", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Acesse com sua conta corporativa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com Microsoft" })).toBeDisabled();
});

test("app shell renders the requester navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Painel do Solicitante" })).toBeVisible();
  for (const label of ["Início", "Nova Solicitação", "Minhas Solicitações", "Ajuda"]) {
    await expect(page.getByRole("link", { name: label, exact: true }).first()).toBeVisible();
  }

  await page.getByRole("link", { name: "Nova Solicitação", exact: true }).first().click();
  await expect(page).toHaveURL(/\/requests\/new$/);
  await expect(page.getByRole("heading", { level: 1, name: "Nova Solicitação" })).toBeVisible();
});

test("unknown routes show the Portuguese not-found page", async ({ page }) => {
  const response = await page.goto("/rota-inexistente");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("sidebar collapses to icons and keeps accessible link names", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator('[data-slot="sidebar"][data-state]');
  await expect(sidebar).toHaveAttribute("data-state", "expanded");

  await page.getByRole("button", { name: "Recolher ou expandir o menu" }).click();

  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await expect(page.getByText("Pessoas, processos e informações")).toBeHidden();
  await expect(page.getByRole("link", { name: "Minhas Solicitações", exact: true })).toBeVisible();
});
