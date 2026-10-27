import { test, expect } from "@playwright/test";
import { newUser, register, signIn } from "./helpers.js";
import { confirmationLink } from "./mail.js";
import { totpCode } from "./totp.js";

const signOut = async (page) => {
  await page.getByRole("button", { name: /Sessão protegida/ }).click();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/signin$/);
};

const fillPassword = async (page, user) => {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
};

test("confirmação de email: sem confirmar não entra; o link confirma uma vez e libera o login", async ({ page }) => {
  const user = newUser();
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByLabel("Confirme a senha").fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Confirme seu email" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: user.email })).toBeVisible();
  const link = await confirmationLink(user.email);

  // Antes de confirmar, a senha certa não abre a conta e a tela oferece reenviar.
  await page.goto("/signin");
  await fillPassword(page, user);
  await expect(page.getByRole("alert")).toContainText("Confirme seu email");
  await expect(page.getByRole("button", { name: "Reenviar o email de confirmação" })).toBeVisible();
  await expect(page.getByTestId("balance")).toHaveCount(0);

  // O link confirma; o token sai da barra de endereço; usar o link de novo é recusado.
  await page.goto(link);
  await expect(page.getByText(/Email confirmado/)).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.goto(link);
  await expect(page.getByRole("alert")).toContainText("inválido ou vencido");

  await signIn(page, user);
});

test("link de confirmação adulterado é recusado", async ({ page }) => {
  const user = newUser();
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByLabel("Confirme a senha").fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Criar conta" }).click();
  const link = await confirmationLink(user.email);
  const tampered = link.slice(0, -4) + (link.endsWith("AAAA") ? "BBBB" : "AAAA");
  await page.goto(tampered);
  await expect(page.getByRole("alert")).toContainText("inválido ou vencido");
});

test("verificação em duas etapas: ativar pelo QR code, entrar com o código, recuperação e desativar", async ({ page }) => {
  const user = newUser();
  await register(page, user);
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Conta", exact: true }).click();
  const card = page.getByRole("region", { name: "Verificação em duas etapas" });
  await card.getByRole("button", { name: "Ativar" }).click();
  // Começar pede a senha: a sessão aberta sozinha não registra um aplicativo.
  await card.getByLabel("Senha", { exact: true }).fill(user.password);
  await card.getByRole("button", { name: "Continuar" }).click();

  // O QR code é uma imagem de verdade e a chave vem para digitar à mão.
  const qr = card.getByAltText("QR code para o aplicativo autenticador");
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  const secret = (await card.getByLabel("Chave de configuração").textContent()).replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  // Código errado não ativa; o certo ativa e mostra os 10 códigos de recuperação uma vez.
  await card.getByLabel("Código do aplicativo").fill("000000");
  await card.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(card.getByRole("alert")).toContainText("Código incorreto");
  await card.getByLabel("Código do aplicativo").fill(totpCode(secret));
  await card.getByRole("button", { name: "Confirmar e ativar" }).click();
  const list = card.getByRole("list", { name: "Códigos de recuperação" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  const recovery = await list.getByRole("listitem").allTextContents();
  for (const c of recovery) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  await expect(card.getByRole("button", { name: "Concluir" })).toBeDisabled();
  await card.getByRole("checkbox", { name: /Guardei os códigos/ }).check();
  await card.getByRole("button", { name: "Concluir" }).click();
  await expect(card.getByText(/Ativa\. Códigos de recuperação restantes: 10/)).toBeVisible();

  // Login: a senha sozinha leva à 2ª etapa e NÃO abre a conta.
  await signOut(page);
  await fillPassword(page, user);
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await expect(page.getByTestId("balance")).toHaveCount(0);
  await expect(page.getByLabel("Código do aplicativo")).toBeFocused();
  // Código errado: erro e continua na 2ª etapa. Depois, o código do próximo intervalo de 30 s entra.
  await page.getByLabel("Código do aplicativo").fill("000000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("alert")).toContainText("Código incorreto");
  await page.getByLabel("Código do aplicativo").fill(totpCode(secret, 1));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByTestId("balance")).toBeVisible();

  // Perdeu o aplicativo: entra com um código de recuperação (que vale uma vez).
  await signOut(page);
  await fillPassword(page, user);
  await page.getByRole("button", { name: "Perdi o acesso ao aplicativo" }).click();
  await page.getByLabel("Código de recuperação").fill(recovery[0]);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByTestId("balance")).toBeVisible();
  await signOut(page);
  await fillPassword(page, user);
  await page.getByRole("button", { name: "Perdi o acesso ao aplicativo" }).click();
  await page.getByLabel("Código de recuperação").fill(recovery[0]);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("alert")).toContainText("Código incorreto"); // já usado
  await page.getByRole("button", { name: "Voltar" }).click();

  // Desativar: pede senha e código; depois o login volta a ser só a senha.
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await expect(page.getByText(/Verificado: você é uma pessoa/)).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Perdi o acesso ao aplicativo" }).click();
  await page.getByLabel("Código de recuperação").fill(recovery[1]);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByTestId("balance")).toBeVisible();
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Conta", exact: true }).click();
  const again = page.getByRole("region", { name: "Verificação em duas etapas" });
  await expect(again.getByText(/Códigos de recuperação restantes: 8/)).toBeVisible();
  await again.getByRole("button", { name: "Desativar" }).click();
  await again.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await again.getByRole("button", { name: "Usar um código de recuperação" }).click();
  await again.getByLabel("Código de recuperação").fill(recovery[2]);
  await again.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(again.getByText("Senha incorreta")).toBeVisible();
  await again.getByLabel("Senha", { exact: true }).fill(user.password);
  await again.getByLabel("Código de recuperação").fill(recovery[2]);
  await again.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(again.getByText("Verificação em duas etapas desativada.")).toBeVisible();
  await expect(again.getByRole("button", { name: "Ativar" })).toBeVisible();

  await signOut(page);
  await signIn(page, user); // só a senha, de novo
});

test("a segunda etapa no celular cabe na tela, sem rolar para o lado", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "pt-BR", isMobile: true });
  const page = await context.newPage();
  const user = newUser();
  await register(page, user);
  await page.goto("/account");
  const card = page.getByRole("region", { name: "Verificação em duas etapas" });
  await card.getByRole("button", { name: "Ativar" }).click();
  // Começar pede a senha: a sessão aberta sozinha não registra um aplicativo.
  await card.getByLabel("Senha", { exact: true }).fill(user.password);
  await card.getByRole("button", { name: "Continuar" }).click();
  const secret = (await card.getByLabel("Chave de configuração").textContent()).replace(/\s/g, "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await card.getByLabel("Código do aplicativo").fill(totpCode(secret));
  await card.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(card.getByRole("list", { name: "Códigos de recuperação" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
