// Gera docs/img/entrar-cloudflare.png: a tela de login com o botão do Google e o Turnstile da Cloudflare ativos.
// Uso: com a API rodando com GOOGLE_CLIENT_ID e as chaves de TESTE do Turnstile (veja .env.example) e o front
// em :4173 (npm run build -w web && npm run preview -w web -- --port 4173):
//   node e2e/captura-turnstile.mjs
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: "pt-BR", viewport: { width: 1280, height: 800 } })).newPage();
await page.goto("http://localhost:4173/signin");
// O widget de teste (chaves de teste da Cloudflare) se resolve sozinho; espera o token antes de fotografar.
await page.waitForFunction(() => document.querySelector('[name="cf-turnstile-response"]')?.value, null, { timeout: 30000 });
await page.getByLabel("Verificação de segurança").waitFor();
await page.waitForSelector('iframe[src*="accounts.google.com"], [id^="gsi"], div[role="button"][aria-labelledby], .nsm7Bb-HzV7m-LgbsSe', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

// As chaves de teste fazem a Cloudflare desenhar uma tarja "Somente para teste" no pé do widget, dentro do
// iframe dela (fora do nosso alcance). Com chaves reais ela não existe: para o print, uma faixa na cor do
// próprio widget cobre a tarja e o contorno é refeito.
const b = await page.getByLabel("Verificação de segurança").boundingBox();
const left = b.x + b.width / 2 - 150;
await page.evaluate(({ left, top }) => {
  const d = document.createElement("div");
  d.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:300px;height:22px;box-sizing:border-box;background:#fafafa;border:1px solid #e0e0e0;border-top:0;z-index:10`;
  document.body.appendChild(d);
}, { left, top: b.y + 43.5 });
await page.waitForTimeout(300);
console.log("widget", JSON.stringify(b));
await page.screenshot({ path: "docs/img/entrar-cloudflare.png" });
await browser.close();
