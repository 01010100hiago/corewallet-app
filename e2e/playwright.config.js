import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { OUTBOX } from "./tests/mail.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const CI = Boolean(process.env.CI);
// Banco só dos testes de ponta a ponta. Os usuários criados aqui são únicos por execução.
// Os emails da API (confirmação de cadastro) vão para um arquivo; começa vazio a cada execução.
rmSync(OUTBOX, { force: true });
const database = process.env.E2E_DATABASE_URI ?? "mongodb://127.0.0.1:27017/corewallet_e2e";

export default defineConfig({
  testDir: "./tests",
  // Um teste por vez: todos usam o mesmo banco e o mesmo IP.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "npm run start -w api",
      cwd: root,
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: {
        PORT: "4000",
        DATABASE_URI: database,
        JWT_SECRET: "segredo-so-dos-testes-e2e-com-mais-de-32-caracteres",
        WEB_ORIGIN: "http://localhost:4173",
        // Muitas contas do mesmo IP: o limite de tentativas (testado na API) fica desligado aqui.
        RATE_LIMITS: "off",
        NODE_ENV: "test",
        // Sem Turnstile nem Google. A verificação automática própria fica LIGADA (é a do lab), só com
        // dificuldade baixa para os testes não esperarem; a dificuldade real é medida à parte.
        POW_MAX_NUMBER: "2000",
        TURNSTILE_SITE_KEY: "",
        TURNSTILE_SECRET_KEY: "",
        GOOGLE_CLIENT_ID: "",
        // Com o arquivo de emails a confirmação do cadastro fica LIGADA, como no lab com SMTP.
        MAIL_OUTBOX_FILE: OUTBOX,
      },
    },
    {
      command: "npm run build -w web && npm run preview -w web -- --port 4173 --strictPort",
      cwd: root,
      url: "http://localhost:4173",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
