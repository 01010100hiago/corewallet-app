import { test, expect } from "@playwright/test";
import { newUser, register, addTransaction, nav, goTo, goToCategories } from "./helpers.js";

test("os mesmos quatro botões existem em todas as páginas e marcam onde a pessoa está", async ({ page }) => {
  await register(page, newUser());
  const links = [
    ["Início", /\/$/],
    ["Análise", /\/analysis$/],
    ["Histórico", /\/history$/],
    ["Conta", /\/account$/],
  ];
  for (const [name, url] of links) {
    await nav(page).getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(nav(page).getByRole("link")).toHaveCount(4);
    await expect(nav(page).locator("a[aria-current=page]")).toHaveCount(1);
    await expect(nav(page).getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // Nova despesa faz parte do início.
  await nav(page).getByRole("link", { name: "Início", exact: true }).click();
  await page.getByRole("link", { name: /Nova despesa/ }).click();
  await expect(nav(page).getByRole("link", { name: "Início", exact: true })).toHaveAttribute("aria-current", "page");
});

test("a navegação não muda de lugar nem de tamanho entre as páginas, e a faixa verde se ajusta ao cabeçalho", async ({ page }) => {
  await register(page, newUser());
  const where = () =>
    nav(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const band = document.querySelector("header").parentElement.getBoundingClientRect();
      return { navTop: Math.round(r.top), navH: Math.round(r.height), navW: Math.round(r.width), bandH: Math.round(band.height) };
    });
  // Todas as páginas de cabeçalho simples têm a faixa e a navegação idênticas, mesmo com subtítulos de tamanhos bem diferentes.
  const seen = [];
  for (const [name, heading] of [["Análise", "Análise financeira"], ["Histórico", "Histórico"], ["Conta", "Minha conta"]]) {
    await nav(page).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await page.waitForTimeout(450); // termina a animação da faixa
    seen.push(await where());
  }
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Categorias", level: 1 })).toBeVisible();
  await page.waitForTimeout(450);
  seen.push(await where());
  await page.goto("/transaction/output");
  await expect(page.getByRole("heading", { name: "Nova despesa", level: 1 })).toBeVisible();
  await page.waitForTimeout(450);
  seen.push(await where());
  for (const w of seen) expect(w).toEqual(seen[0]);
  // O subtítulo nunca quebra a linha: cabe em uma só, com reticências se for longo.
  const lines = await page.locator("header").evaluate((h) => {
    const p = h.parentElement.querySelector("p.truncate");
    return Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight));
  });
  expect(lines).toBe(1);

  // A faixa anima: ao voltar para o início cresce aos poucos (não aparece de uma vez) e ao sair encolhe.
  const bandH = () => page.evaluate(() => Math.round(document.querySelector("header").parentElement.getBoundingClientRect().height));
  const short = await bandH();
  await nav(page).getByRole("link", { name: "Início", exact: true }).click();
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await bandH());
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  const tall = await bandH();
  expect(tall).toBeGreaterThan(short + 40);
  expect(samples.some((h) => h > short + 2 && h < tall - 2)).toBe(true); // passou por alturas intermediárias
  const during = [];
  await nav(page).getByRole("link", { name: "Conta", exact: true }).click();
  for (let i = 0; i < 8; i++) {
    during.push(await bandH());
    await page.waitForTimeout(40);
  }
  expect(during.some((h) => h < tall - 2 && h > short + 2)).toBe(true);
});

test("no celular a navegação cabe na tela sem rolar para o lado", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "pt-BR", isMobile: true });
  const page = await context.newPage();
  await register(page, newUser());
  await goTo(page, "Análise");
  for (const name of ["Início", "Análise", "Histórico", "Conta"]) await expect(nav(page).getByRole("link", { name })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});

test("categorias: criar, usar, renomear e apagar movendo os lançamentos", async ({ page }) => {
  await register(page, newUser());
  await goToCategories(page);
  const expenses = page.getByRole("region", { name: "Categorias de despesas" });
  await expenses.getByLabel("Nova categoria de despesa").fill("Pets");
  await expenses.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Categoria “Pets” criada.")).toBeVisible();
  await expect(expenses.getByText("Pets")).toBeVisible();

  await nav(page).getByRole("link", { name: "Início" }).click();
  await addTransaction(page, { type: "output", value: "80", description: "Ração do Thor", category: "Pets" });
  await expect(page.getByRole("listitem").filter({ hasText: "Ração do Thor" })).toContainText("Pets");

  await goToCategories(page);
  await expect(expenses.getByText("Pets").locator("xpath=ancestor::li[1]")).toContainText("1 lançamento");
  await expenses.getByRole("button", { name: "Renomear Pets" }).click();
  await page.getByLabel("Novo nome de Pets").fill("Animais");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Categoria renomeada para “Animais”.")).toBeVisible();

  await expenses.getByRole("button", { name: "Apagar Animais" }).click();
  const box = page.getByRole("group", { name: "Apagar Animais" });
  await expect(box).toContainText("tem 1 lançamento");
  await box.getByLabel("Mover para").selectOption("Lazer");
  await box.getByRole("button", { name: "Mover e apagar" }).click();
  await expect(page.getByText(/1 lançamento foi movido para “Lazer”/)).toBeVisible();
  await expect(expenses.getByText("Animais")).toHaveCount(0);

  await nav(page).getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ração do Thor" })).toContainText("Lazer");
});

test("extrato: busca, filtros, totais do filtro e as alterações de um lançamento", async ({ page }) => {
  await register(page, newUser());
  await addTransaction(page, { type: "input", value: "2000", description: "Salário do mês", category: "salario" });
  await addTransaction(page, { type: "output", value: "150", description: "Mercado da semana", category: "mercado" });
  await addTransaction(page, { type: "output", value: "60", description: "Cinema", category: "lazer" });

  await goTo(page, "Histórico");
  await expect(page.getByRole("tab", { name: "Extrato" })).toHaveAttribute("aria-selected", "true");
  const statement = page.getByRole("region", { name: "Extrato" });
  await expect(statement.getByRole("listitem")).toHaveCount(3);
  const totals = page.getByLabel("Totais do filtro");
  await expect(totals).toContainText("3 lançamentos");
  await expect(totals).toContainText("2.000,00");
  await expect(totals).toContainText("210,00");

  await page.getByLabel("Buscar pela descrição").fill("mercado");
  await expect(statement.getByRole("listitem")).toHaveCount(1);
  await expect(totals).toContainText("1 lançamento");
  await expect(totals).toContainText("150,00");

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(statement.getByRole("listitem")).toHaveCount(3);
  await page.getByLabel("Tipo").selectOption("input");
  await expect(statement.getByRole("listitem")).toHaveCount(1);
  await expect(statement).toContainText("Salário do mês");
  await page.getByLabel("Tipo").selectOption("output");
  await page.getByLabel("Categoria").selectOption("Lazer");
  await expect(statement.getByRole("listitem")).toHaveCount(1);
  await expect(statement).toContainText("Cinema");

  // Um intervalo de datas no futuro não traz nada.
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("De", { exact: true }).fill("2099-01-01");
  await expect(page.getByText("Nenhum lançamento com esses filtros")).toBeVisible();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByRole("button", { name: "Alterações de Cinema" }).click();
  await expect(statement.getByText("Criado")).toBeVisible();
});

test("o olhinho esconde os valores no extrato e lembra a escolha", async ({ page }) => {
  await register(page, newUser());
  await addTransaction(page, { type: "output", value: "1234,56", description: "Compra secreta", category: "mercado" });
  await goTo(page, "Histórico");
  const statement = page.getByRole("region", { name: "Extrato" });
  await expect(statement).toContainText("1.234,56");
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(page.locator("body")).not.toContainText("1.234,56");
  await expect(statement).toContainText("R$ ••••");
  await page.reload();
  await expect(statement).toContainText("R$ ••••");
  await expect(page.locator("body")).not.toContainText("1.234,56");
});

test("início: olhinho ao lado do saldo, receitas e despesas empilhadas e atalhos grandes", async ({ page }) => {
  await register(page, newUser());
  await addTransaction(page, { type: "input", value: "2000", description: "Salário do mês", category: "salario" });
  await addTransaction(page, { type: "output", value: "150", description: "Mercado", category: "mercado" });
  const box = (l) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

  // O olhinho fica logo à direita do saldo e acompanha o tamanho do valor.
  const balance = page.getByTestId("balance");
  const eye = page.getByRole("button", { name: "Ocultar valores" });
  const b = await box(balance), e = await box(eye);
  expect(e.x).toBeGreaterThanOrEqual(b.x + b.w);
  expect(e.x - (b.x + b.w)).toBeLessThan(40);
  expect(Math.abs(e.y + e.h / 2 - (b.y + b.h / 2))).toBeLessThan(b.h);
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(balance).toContainText("••••");
  const b2 = await box(balance), e2 = await box(eye);
  expect(e2.x - (b2.x + b2.w)).toBeLessThan(40); // continua colado ao valor, que agora é mais curto
  await page.getByRole("button", { name: "Ocultar valores" }).click();

  // Receitas em cima, despesas embaixo, ao lado do saldo, e o saldo é o maior.
  const income = page.getByText("Receitas de hoje").locator("..");
  const expense = page.getByText("Despesas de hoje").locator("..");
  const i = await box(income), x = await box(expense), bal = await box(balance);
  expect(Math.abs(i.x - x.x)).toBeLessThan(2);
  expect(x.y).toBeGreaterThan(i.y + i.h - 2);
  expect(i.x).toBeGreaterThan(bal.x + bal.w - 1);
  const size = (l) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size(balance)).toBeGreaterThan((await size(income.locator("dd"))) * 1.8);
  await expect(income).toContainText("2.000,00");
  await expect(expense).toContainText("150,00");

  // Os botões de navegação ficam logo abaixo da faixa verde, antes de Nova receita / Nova despesa, com efeito ao passar o mouse.
  const shortcuts = nav(page);
  await expect(shortcuts.getByRole("link")).toHaveCount(4);
  const actions = await box(page.getByRole("region", { name: "Novo lançamento" }));
  const first = await box(shortcuts.getByRole("link").first());
  expect(first.y + first.h).toBeLessThan(actions.y + 1);
  expect(first.h).toBeGreaterThan(70);
  const tile = shortcuts.getByRole("link", { name: "Análise", exact: true });
  const icon = tile.locator("span.grid");
  const before = await icon.evaluate((el) => getComputedStyle(el).backgroundColor);
  await tile.hover();
  await expect.poll(() => icon.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
  await expect.poll(() => icon.evaluate((el) => getComputedStyle(el).scale)).not.toBe("none");
  await tile.click();
  await expect(page).toHaveURL(/\/analysis$/);
  // Fora do início o olhinho fica no cabeçalho da página.
  await expect(page.getByRole("button", { name: "Ocultar valores" })).toHaveCount(1);
});

test("categorias fica dentro da Conta e também a um clique do gráfico de despesas", async ({ page }) => {
  await register(page, newUser());
  await addTransaction(page, { type: "output", value: "50", description: "Padaria", category: "mercado" });
  // Pelo gráfico de despesas da página inicial.
  await page.getByRole("link", { name: "Gerenciar categorias" }).click();
  await expect(page).toHaveURL(/\/categories$/);
  // A página é parte da Conta: o botão Conta fica marcado e não existe um botão só para Categorias.
  await expect(nav(page).getByRole("link", { name: "Conta", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByRole("link", { name: /Categorias/ })).toHaveCount(0);
  // Pela própria Conta.
  await page.goto("/account");
  await page.getByRole("link", { name: /^Categorias/ }).click();
  await expect(page.getByRole("heading", { name: "Categorias", level: 1 })).toBeVisible();
});
