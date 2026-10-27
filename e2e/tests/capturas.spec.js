import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { monthKeyOf, monthRange, shiftMonth } from "@corewallet/shared";
import { newUser, register } from "./helpers.js";

// Gera as imagens do README. Só roda com E2E_SCREENSHOTS=1:
//   E2E_SCREENSHOTS=1 npm run test:e2e -- tests/capturas.spec.js
test.skip(!process.env.E2E_SCREENSHOTS, "defina E2E_SCREENSHOTS=1 para gerar as capturas");

const OUT = new URL("../../docs/img/", import.meta.url).pathname;
const DATABASE = process.env.E2E_DATABASE_URI ?? "mongodb://127.0.0.1:27017/corewallet_e2e";

// Página inteira, mas com no máximo MAX_HEIGHT px de altura (CSS): telas longas ficam do tamanho
// de uma tela de verdade ao abrir a imagem grande, em vez de uma tira de milhares de pixels.
const MAX_HEIGHT = 1500;
async function shot(page, name) {
  const { width, height } = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight }));
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(height, MAX_HEIGHT) } });
}

const SEED = [
  ["input", "4200", "Salário", "salario"],
  ["input", "350", "Freelance de logo", "freelance"],
  ["output", "1450", "Aluguel", "moradia"],
  ["output", "612,40", "Mercado do mês", "mercado"],
  ["output", "180", "Cinema e jantar", "lazer"],
  ["output", "139,90", "Internet", "contas"],
  ["output", "96", "Transporte", "transporte"],
];

// Meses anteriores só dá para criar direto no banco (a API sempre usa a data de hoje).
async function seedHistory(context) {
  const { id } = await (await context.request.get("/api/auth/me")).json();
  const conn = await mongoose.createConnection(DATABASE).asPromise();
  try {
    const current = monthKeyOf(new Date());
    const day = (key, d) => new Date(monthRange(key).start.getTime() + (d - 1) * 86_400_000 + 12 * 3_600_000);
    const plan = [
      // Os 6 meses anteriores ao período, para as variações aparecerem.
      [11, [["input", 3800, "Salário", "salario"], ["output", 1250, "Aluguel", "moradia"], ["output", 480, "Supermercado", "mercado"]]],
      [10, [["input", 3800, "Salário", "salario"], ["output", 1250, "Aluguel", "moradia"], ["output", 450, "Supermercado", "mercado"], ["output", 90, "Lazer", "lazer"]]],
      [9, [["input", 3800, "Salário", "salario"], ["output", 1250, "Aluguel", "moradia"], ["output", 500, "Supermercado", "mercado"]]],
      [8, [["input", 3900, "Salário", "salario"], ["output", 1250, "Aluguel", "moradia"], ["output", 520, "Supermercado", "mercado"], ["output", 200, "Contas", "contas"]]],
      [7, [["input", 3900, "Salário", "salario"], ["output", 1250, "Aluguel", "moradia"], ["output", 470, "Supermercado", "mercado"], ["output", 120, "Transporte", "transporte"]]],
      [6, [["input", 3900, "Salário", "salario"], ["output", 1350, "Aluguel", "moradia"], ["output", 510, "Supermercado", "mercado"]]],
      [5, [["input", 4000, "Salário", "salario"], ["output", 1350, "Aluguel", "moradia"], ["output", 520, "Supermercado", "mercado"], ["output", 140, "Lazer", "lazer"], ["output", 2100, "Viagem de fim de ano", "lazer"]]],
      [4, [["input", 4000, "Salário", "salario"], ["output", 1350, "Aluguel", "moradia"], ["output", 610, "Supermercado", "mercado"], ["output", 260, "Contas", "contas"]]],
      [3, [["input", 4200, "Salário", "salario"], ["input", 600, "Projeto", "freelance"], ["output", 1350, "Aluguel", "moradia"], ["output", 580, "Supermercado", "mercado"], ["output", 480, "Saúde", "saude"]]],
      [2, [["input", 4200, "Salário", "salario"], ["output", 1350, "Aluguel", "moradia"], ["output", 700, "Supermercado", "mercado"], ["output", 320, "Lazer", "lazer"], ["output", 90, "Transporte", "transporte"], ["output", 3200, "Notebook novo", "educacao"]]],
      [1, [["input", 4200, "Salário", "salario"], ["input", 350, "Projeto", "freelance"], ["output", 1450, "Aluguel", "moradia"], ["output", 640, "Supermercado", "mercado"], ["output", 410, "Educação", "educacao"]]],
    ];
    const docs = plan.flatMap(([back, rows]) =>
      rows.map(([type, value, description, category], i) => ({
        userId: new mongoose.Types.ObjectId(id),
        type,
        valueCents: value * 100,
        description,
        category,
        createdAt: day(shiftMonth(current, -back), 3 + i * 5),
        deletedAt: null,
        archivedAt: null,
      }))
    );
    await conn.collection("transactions").insertMany(docs);
  } finally {
    await conn.close();
  }
}

async function seed(page, context) {
  const csrf = (await context.cookies()).find((c) => c.name === "cw_csrf").value;
  for (const [type, value, description, category] of SEED) {
    const res = await context.request.post("/api/transactions", { data: { type, value, description, category }, headers: { "X-CSRF-Token": csrf } });
    expect(res.status()).toBe(201);
  }
  await page.goto("/");
  await expect(page.getByText("Mercado do mês")).toBeVisible();
}

test("capturas de tela", async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", deviceScaleFactor: 2 });
  const page = await desktop.newPage();

  await page.goto("/signin");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await page.screenshot({ path: `${OUT}entrar.png` });

  const user = newUser("Marina");
  await register(page, { ...user, name: "Marina Duarte" });
  await seed(page, desktop);
  await shot(page, "inicio");

  await page.getByRole("link", { name: /Nova despesa/ }).click();
  await expect(page.getByRole("heading", { name: "Nova despesa" })).toBeVisible();
  await page.getByLabel("Valor (R$)").fill("89,90");
  await page.getByLabel("Descrição").fill("Farmácia");
  await page.getByLabel("Categoria", { exact: true }).selectOption("saude");
  await page.screenshot({ path: `${OUT}nova-saida.png` });

  await seedHistory(desktop);
  await page.goto("/analysis");
  await expect(page.getByRole("region", { name: "Indicadores do período" })).toBeVisible();
  await shot(page, "analise");

  await page.goto("/history");
  await expect(page.getByRole("region", { name: "Extrato" }).getByRole("listitem").first()).toBeVisible();
  await shot(page, "historico");

  await page.goto("/history?aba=alteracoes");
  await expect(page.getByRole("region", { name: "Alterações" })).toBeVisible();
  await shot(page, "alteracoes");

  await page.goto("/categories");
  await expect(page.getByRole("region", { name: "Categorias de despesas" })).toBeVisible();
  await shot(page, "categorias");

  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Dispositivos conectados" }).getByRole("listitem")).toHaveCount(1);
  await shot(page, "conta");
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", deviceScaleFactor: 2, isMobile: true });
  const mobile = await phone.newPage();
  await register(mobile, newUser("Caio"));
  await seed(mobile, phone);
  // Celular: só a tela do aparelho (390x844), como a pessoa vê ao abrir, sem rolar.
  await mobile.screenshot({ path: `${OUT}inicio-celular.png` });
  await phone.close();
});
