import { expect } from "@playwright/test";

export const PASSWORD = "cavalo-azul-77";

let counter = 0;
export function newUser(label = "Pessoa") {
  counter += 1;
  const id = `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
  return { name: `${label} Teste`, email: `e2e-${id}@exemplo.com`, password: PASSWORD };
}

export async function signUp(page, user) {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByLabel("Confirme a senha").fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/signin$/);
}

export async function signIn(page, user) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("balance")).toBeVisible();
}

export async function register(page, user) {
  await signUp(page, user);
  await signIn(page, user);
}

// Cria um lançamento pela tela.
export async function addTransaction(page, { type, value, description, category }) {
  await page.getByRole("link", { name: type === "input" ? /Nova receita/ : /Nova despesa/ }).click();
  await page.getByLabel("Valor (R$)").fill(value);
  await page.getByLabel("Descrição").fill(description);
  if (category) await page.getByLabel("Categoria").selectOption(category);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
}

// Navegação principal, sempre na faixa verde do topo.
export const nav = (page) => page.getByRole("navigation", { name: "Principal" });

// Vai para uma página pelos botões de navegação, que existem em todas as telas.
export const goTo = (page, name) => nav(page).getByRole("link", { name, exact: true }).click();

// Categorias fica dentro da Conta (configuração, não uso diário).
export async function goToCategories(page) {
  await goTo(page, "Conta");
  await page.getByRole("link", { name: /^Categorias/ }).click();
  await expect(page.getByRole("heading", { name: "Categorias", level: 1 })).toBeVisible();
}
