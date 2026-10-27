import { test, expect } from "@playwright/test";
import { newUser, register, addTransaction } from "./helpers.js";

test("jornada completa: cadastro, lançamentos, categoria, gráfico, edição, exclusão e mês", async ({ page }) => {
  const user = newUser("Maria");
  await register(page, user);

  await expect(page.getByRole("heading", { name: `Olá, ${user.name}` })).toBeVisible();
  await expect(page.getByTestId("balance")).toContainText("0,00");
  await expect(page.getByText(/Nenhum lançamento em/)).toBeVisible();

  await addTransaction(page, { type: "input", value: "3500", description: "Salário do mês", category: "salario" });
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await addTransaction(page, { type: "output", value: "120,50", description: "Feira da semana", category: "mercado" });

  await expect(page.getByTestId("balance")).toContainText("3.379,50");
  const month = page.getByRole("region", { name: "Mês" });
  await expect(month.getByText("Entradas do mês").locator("..")).toContainText("3.500,00");
  await expect(month.getByText("Saídas do mês").locator("..")).toContainText("120,50");

  // Gráfico: só saídas, 100% numa categoria.
  const chart = page.getByRole("region", { name: "Para onde foi o dinheiro" });
  await expect(chart).toContainText("Mercado");
  await expect(chart).toContainText("100%");
  await expect(chart).not.toContainText("Salário");

  // Editar a saída: valor e categoria mudam, o saldo acompanha.
  await page.getByRole("link", { name: "Editar Feira da semana" }).click();
  await expect(page.getByRole("heading", { name: "Editar saída" })).toBeVisible();
  await expect(page.getByLabel("Valor (R$)")).toHaveValue("120,50");
  await page.getByLabel("Valor (R$)").fill("100");
  await page.getByLabel("Categoria").selectOption("lazer");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançamento atualizado.")).toBeVisible();
  await expect(page.getByTestId("balance")).toContainText("3.400,00");
  await expect(chart).toContainText("Lazer");
  await expect(chart).not.toContainText("Mercado");

  // O aviso não volta ao recarregar a página.
  await page.reload();
  await expect(page.getByTestId("balance")).toContainText("3.400,00");
  await expect(page.getByText("Lançamento atualizado.")).toHaveCount(0);

  // Excluir pede confirmação; cancelar não apaga; confirmar apaga e o saldo acompanha.
  await page.getByRole("button", { name: "Excluir Salário do mês" }).click();
  const confirm = page.getByRole("group", { name: "Excluir Salário do mês" });
  await expect(confirm).toBeFocused();
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Salário do mês", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Excluir Salário do mês" }).click();
  await page.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByText("Lançamento excluído.")).toBeVisible();
  await expect(page.getByText("Salário do mês", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("balance")).toContainText("100,00");

  // Mês anterior está vazio, mas o saldo é o geral; o próximo mês não existe.
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByText(/Nenhum lançamento em/)).toBeVisible();
  await expect(page).toHaveURL(/\?mes=\d{4}-\d{2}$/);
  await expect(page.getByTestId("balance")).toContainText("100,00");
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
  await page.getByRole("button", { name: "Ir para o mês atual" }).click();
  await expect(page.getByText("Feira da semana", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
});

test("validações do formulário aparecem antes de enviar", async ({ page }) => {
  await register(page, newUser());
  await page.getByRole("link", { name: /Nova saída/ }).click();
  await page.getByLabel("Valor (R$)").fill("abc");
  await page.getByLabel("Descrição").fill("ab");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(/Valor inválido/)).toBeVisible();
  await expect(page.getByText(/no mínimo 3 caracteres/)).toBeVisible();
  await expect(page).toHaveURL(/\/transaction\/output$/);
});
