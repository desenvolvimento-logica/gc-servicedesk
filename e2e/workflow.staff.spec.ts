import { existsSync, readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { STAFF_STATE } from "../playwright.config";

/**
 * Critical path with a staff session (operator or administrator):
 * open → assign → start → internal note → close → correction → queue →
 * reports/CSV. Everything it creates is marked "TESTE E2E" so it can be
 * removed before launch (supabase/maintenance/prelaunch_cleanup.sql).
 *
 * Writes real data: run only when intended (`pnpm test:e2e`).
 */

const MARK = "TESTE E2E";
const DEPARTMENT = "Fiscal";
const SERVICE = "Senha gerente";
const CORRECTION_SERVICE = "Correção de Cadastro / Refazer";
const DETAIL_URL = /\/requests\/[0-9a-f-]{36}$/;

test.describe.configure({ mode: "serial" });
test.skip(!existsSync(STAFF_STATE), "Sem sessão salva: rode `pnpm e2e:login` antes.");

/** Radix select: the accessible name excludes the required "*" marker. */
async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Fills every still-empty required text control of the dynamic form. */
async function fillRequiredFields(page: Page) {
  const controls = page.locator('form input[aria-required="true"], form textarea[aria-required="true"]');
  for (const control of await controls.all()) {
    if ((await control.inputValue()) === "") await control.fill(MARK);
  }
}

async function submitAndGetNumber(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Revisar solicitação" }).click();
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(page.getByRole("heading", { name: "Solicitação enviada" })).toBeVisible();
  // Previous routes stay mounted (hidden) with cacheComponents: read the visible one.
  const number = (await page.getByText(/^GC-\d{4}-\d{6,}$/).filter({ visible: true }).textContent())?.trim();
  expect(number).toMatch(/^GC-\d{4}-\d{6,}$/);
  return number ?? "";
}

let requestNumber = "";
let requestUrl = "";
let correctionNumber = "";

test("validates required fields before review", async ({ page }) => {
  await page.goto("/requests/new");
  await pick(page, "Departamento", DEPARTMENT);
  await pick(page, "Tipo de serviço", SERVICE);
  await page.getByRole("button", { name: "Revisar solicitação" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Campo obrigatório." }).first()).toBeVisible();
});

test("opens a request from the dynamic form", async ({ page }) => {
  await page.goto("/requests/new");
  await pick(page, "Departamento", DEPARTMENT);
  await pick(page, "Tipo de serviço", SERVICE);
  await page.getByLabel("Nome da empresa").fill(MARK);
  await page.getByLabel("Código da empresa").fill("E2E");
  await fillRequiredFields(page);

  requestNumber = await submitAndGetNumber(page);
  await page.getByRole("link", { name: "Ver solicitação" }).click();
  await page.waitForURL(DETAIL_URL);
  await expect(page.getByText(requestNumber).first()).toBeVisible();
  requestUrl = page.url();
});

test("operator workflow: assign, start, note and close", async ({ page }) => {
  test.skip(!requestUrl, "Depende do teste anterior.");
  await page.goto(requestUrl);

  await pick(page, "Responsável", /^(?!Sem responsável).+/);
  await expect(page.getByText("Responsável atualizado.")).toBeVisible();

  await page.getByRole("button", { name: "Iniciar atendimento" }).click();
  await expect(page.getByText("Aberta → Em andamento")).toBeVisible();

  await page.getByLabel("Nova observação").fill(`${MARK}: observação interna`);
  await page.getByRole("button", { name: "Adicionar observação" }).click();
  await expect(page.getByText("Observação adicionada.")).toBeVisible();

  await page.getByRole("button", { name: "Concluir solicitação" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByText(/Concluída por/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar atendimento" })).toHaveCount(0);
  await expect(page.getByLabel("Nova observação")).toHaveCount(0);
});

test("opens a correction linked to the closed request", async ({ page }) => {
  test.skip(!requestUrl, "Depende do teste anterior.");
  await page.goto(requestUrl);
  await page.getByRole("link", { name: "Solicitar correção" }).click();

  await expect(page.getByRole("combobox", { name: "Tipo de serviço" })).toContainText(CORRECTION_SERVICE);
  await expect(page.getByText(requestNumber).first()).toBeVisible();
  await expect(page.getByLabel("Nome da empresa")).toHaveValue(MARK);
  await fillRequiredFields(page);

  correctionNumber = await submitAndGetNumber(page);
  await page.getByRole("link", { name: "Ver solicitação" }).click();
  await page.waitForURL(DETAIL_URL);
  await expect(page.getByRole("link", { name: new RegExp(requestNumber) })).toBeVisible();
});

test("finds both requests in the queue", async ({ page }) => {
  test.skip(!correctionNumber, "Depende dos testes anteriores.");
  await page.goto(`/queue?status=all&q=${encodeURIComponent(requestNumber)}`);
  await expect(page.getByRole("link", { name: requestNumber })).toBeVisible();

  await page.goto(`/queue?status=all&kind=correction&q=${encodeURIComponent(correctionNumber)}`);
  await expect(page.getByRole("link", { name: correctionNumber })).toBeVisible();
});

test("reports show indicators and export the requests as CSV", async ({ page }) => {
  test.skip(!correctionNumber, "Depende dos testes anteriores.");
  await page.goto("/reports");
  await expect(page.getByText("Tempo médio de resolução")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^solicitacoes_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);

  const csv = readFileSync(await download.path(), "utf-8");
  expect(csv.startsWith("﻿Protocolo;Tipo;Departamento")).toBe(true);
  expect(csv).toContain(requestNumber);
  expect(csv).toContain(correctionNumber);
});
