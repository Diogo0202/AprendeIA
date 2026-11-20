import { expect, test } from "@playwright/test";

test("login oferece cadastro e recuperação de senha", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await expect(page.getByRole("heading", { name: "Recuperar senha" })).toBeVisible();
});

test("cadastro separa a jornada de aluno e professor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Crie sua conta" }).click();
  await expect(page.getByRole("heading", { name: "Crie sua conta" })).toBeVisible();
  await page.getByText("Professor", { exact: true }).click();
  await expect(page.getByLabel("DISCIPLINA")).toBeVisible();
  await expect(page.getByRole("button", { name: "Solicitar acesso de professor" })).toBeVisible();
});
