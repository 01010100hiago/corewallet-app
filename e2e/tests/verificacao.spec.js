import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { newUser, signUp, PASSWORD } from "./helpers.js";

test("a verificação automática aparece, resolve sozinha e não pede clique", async ({ page }) => {
  await page.goto("/signin");
  const widget = page.getByRole("status").filter({ hasText: /pessoa/ });
  await expect(widget).toBeVisible();
  await expect(widget).toContainText("Verificado: você é uma pessoa");
  await expect(widget.getByRole("button")).toHaveCount(0);
  // É pequena: cabe numa linha, bem menor que a caixa do formulário.
  const box = await widget.boundingBox();
  expect(box.height).toBeLessThan(60);
});

test("a API recusa cadastro e login sem a verificação, ou com ela forjada", async ({ page }) => {
  const user = newUser();
  const body = { name: user.name, email: user.email, password: user.password };
  expect((await page.request.post("/api/auth/signup", { data: body })).status()).toBe(400);
  expect((await page.request.post("/api/auth/signin", { data: { email: user.email, password: PASSWORD } })).status()).toBe(400);
  expect((await page.request.post("/api/auth/signup", { data: { ...body, captchaToken: "lixo" } })).status()).toBe(403);

  // Desafio verdadeiro, resolvido pelo teste, mas o token adulterado (número trocado) não passa.
  const c = await (await page.request.get("/api/auth/challenge")).json();
  let n = 0;
  while (createHash("sha256").update(c.salt + n).digest("hex") !== c.challenge) n++;
  const token = (number) => Buffer.from(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number, salt: c.salt, signature: c.signature })).toString("base64");
  expect((await page.request.post("/api/auth/signup", { data: { ...body, captchaToken: token(n + 1) } })).status()).toBe(403);
  expect((await page.request.post("/api/auth/signup", { data: { ...body, captchaToken: token(n) } })).status()).toBe(201);
  // Repetir o mesmo token (reuso) é recusado.
  expect((await page.request.post("/api/auth/signup", { data: { ...body, email: "outro-" + user.email, captchaToken: token(n) } })).status()).toBe(403);
});

test("cadastro e login pela tela passam pela verificação (e o cadastro duplicado é recusado)", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByLabel("Confirme a senha").fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("alert")).toContainText("já está cadastrado");
  // Depois da tentativa a verificação recomeça (cada uma vale uma vez) e conclui de novo.
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
});

test("a verificação roda no navegador na dificuldade real em tempo razoável", async ({ page }) => {
  // Desafio com a dificuldade de produção (100.000) e a resposta perto do fim do intervalo, que é o
  // pior caso: só mede o tempo que o navegador leva (o token deste desafio de mentira não serve ao servidor).
  const salt = `${randomBytes(16).toString("hex")}?e=${Date.now() + 300_000}`;
  const secretNumber = 99_000;
  const challenge = createHash("sha256").update(salt + secretNumber).digest("hex");
  await page.route("**/api/auth/challenge", (route) =>
    route.fulfill({ json: { algorithm: "SHA-256", salt, challenge, maxnumber: 100_000, signature: "0".repeat(64), ttl: 300 } })
  );
  const started = Date.now();
  await page.goto("/signin");
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible({ timeout: 30_000 });
  const seconds = (Date.now() - started) / 1000;
  console.log(`VERIFICACAO_PIOR_CASO_SEGUNDOS=${seconds.toFixed(1)}`);
  expect(seconds).toBeLessThan(15);
});
