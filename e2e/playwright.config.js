import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const CI = Boolean(process.env.CI);
// Banco só dos testes de ponta a ponta. Os usuários criados aqui são únicos por execução.
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
        // Sem captcha nem Google: o login por senha é o que estes testes exercitam.
        TURNSTILE_SITE_KEY: "",
        TURNSTILE_SECRET_KEY: "",
        GOOGLE_CLIENT_ID: "",
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
