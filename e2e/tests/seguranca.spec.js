import { test, expect } from "@playwright/test";
import { newUser, register, signUp, signIn, PASSWORD } from "./helpers.js";

const cookie = async (context, name) => (await context.cookies()).find((c) => c.name === name);

test("rota protegida manda para o login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/signin$/);
});

test("senha errada mostra a mesma mensagem genérica e não abre sessão", async ({ page, context }) => {
  const user = newUser();
  await signUp(page, user);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("outra-senha-qualquer-1");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Email ou senha incorretos");
  expect(await cookie(context, "cw_session")).toBeUndefined();
});

test("cookies da sessão: acesso e renovação são httpOnly; o CSRF é legível pelo site", async ({ page, context }) => {
  await register(page, newUser());
  const session = await cookie(context, "cw_session");
  const refresh = await cookie(context, "cw_refresh");
  const csrf = await cookie(context, "cw_csrf");
  expect(session.httpOnly).toBe(true);
  expect(refresh.httpOnly).toBe(true);
  expect(refresh.sameSite).toBe("Strict");
  expect(refresh.path).toBe("/api/auth");
  expect(csrf.httpOnly).toBe(false);
  // O JavaScript da página só enxerga o cookie do CSRF.
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).toContain("cw_csrf=");
  expect(visible).not.toContain("cw_session");
  expect(visible).not.toContain("cw_refresh");
});

test("renovação silenciosa: com o acesso vencido a pessoa continua logada", async ({ page, context }) => {
  const user = newUser();
  await register(page, user);
  const before = (await cookie(context, "cw_refresh")).value;

  // Simula os 15 minutos: o navegador descarta o cookie de acesso vencido.
  await context.clearCookies({ name: "cw_session" });
  expect(await cookie(context, "cw_session")).toBeUndefined();

  const refreshed = page.waitForResponse((r) => r.url().endsWith("/api/auth/refresh") && r.status() === 200);
  await page.reload();
  await refreshed;
  await expect(page.getByTestId("balance")).toBeVisible();
  await expect(page).not.toHaveURL(/signin/);
  expect(await cookie(context, "cw_session")).toBeDefined();
  // O token de renovação foi trocado (rotação).
  expect((await cookie(context, "cw_refresh")).value).not.toBe(before);
});

test("CSRF: sem o cabeçalho a API recusa, mesmo com os cookies da sessão", async ({ page, context }) => {
  await register(page, newUser());
  const body = { type: "input", value: "10", description: "Teste CSRF", category: "outros" };

  const without = await context.request.post("/api/transactions", { data: body });
  expect(without.status()).toBe(403);

  const csrf = (await cookie(context, "cw_csrf")).value;
  const withHeader = await context.request.post("/api/transactions", { data: body, headers: { "X-CSRF-Token": csrf } });
  expect(withHeader.status()).toBe(201);

  const foreign = await context.request.post("/api/transactions", {
    data: body,
    headers: { "X-CSRF-Token": csrf, Origin: "https://site-malicioso.example" },
  });
  expect(foreign.status()).toBe(403);
});

test("aparelhos: encerrar a sessão de outro aparelho o derruba na hora", async ({ page, browser }) => {
  const user = newUser("Ana");
  await register(page, user);

  const otherContext = await browser.newContext({ locale: "pt-BR", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
  const other = await otherContext.newPage();
  await other.goto("http://localhost:4173/signin");
  await other.getByLabel("Email").fill(user.email);
  await other.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await other.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(other.getByTestId("balance")).toBeVisible();

  await page.goto("/account");
  const devices = page.getByRole("region", { name: "Aparelhos conectados" });
  await expect(devices.getByRole("listitem")).toHaveCount(2);
  await expect(devices.getByText("Este aparelho")).toHaveCount(1);
  await expect(devices.getByText("Safari no iOS")).toBeVisible();
  await expect(devices.getByText(/IP \d+\.\d+\.•\.•|IP [0-9a-f:]+•/)).toHaveCount(2);

  await devices.getByRole("button", { name: "Encerrar sessão em Safari no iOS" }).click();
  await expect(devices.getByRole("listitem")).toHaveCount(1);

  // O outro aparelho perde o acesso na próxima requisição, e a renovação também falha.
  await other.reload();
  await expect(other).toHaveURL(/\/signin$/);
  await otherContext.close();

  // Este aparelho continua.
  await page.goto("/");
  await expect(page.getByTestId("balance")).toBeVisible();
});

test("sair de todos os aparelhos volta ao login e apaga a sessão no servidor", async ({ page, context }) => {
  const user = newUser();
  await register(page, user);
  const refresh = (await cookie(context, "cw_refresh")).value;

  await page.goto("/account");
  await page.getByRole("button", { name: "Sair de todos os aparelhos" }).click();
  await expect(page).toHaveURL(/\/signin$/);

  // O token de renovação antigo não vale mais.
  const res = await page.request.post("/api/auth/refresh", { headers: { Cookie: `cw_refresh=${refresh}` } });
  expect(res.status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);

  // Dá para entrar de novo.
  await signIn(page, user);
});

test("sair apaga a sessão e a próxima visita pede login", async ({ page }) => {
  await register(page, newUser());
  await page.getByRole("button", { name: /Sessão protegida/ }).click();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);
});
