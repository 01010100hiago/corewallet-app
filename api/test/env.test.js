import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";

const KEYS = ["DATABASE_URI", "JWT_SECRET", "WEB_ORIGIN", "PORT", "COOKIE_SECURE", "NODE_ENV", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_CLIENT_ID", "TRUST_PROXY", "RATE_LIMITS", "CAPTCHA_POW", "POW_MAX_NUMBER"];

describe("loadEnv", () => {
  let saved;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, {
      DATABASE_URI: "mongodb://x/y",
      JWT_SECRET: "x".repeat(32),
      WEB_ORIGIN: "http://localhost",
    });
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("falta variável: erro dizendo qual", () => {
    delete process.env.DATABASE_URI;
    assert.throws(() => loadEnv(), /DATABASE_URI/);
  });

  test("JWT_SECRET curto é recusado", () => {
    process.env.JWT_SECRET = "curto";
    assert.throws(() => loadEnv(), /32 caracteres/);
  });

  test("cookie Secure: ligado em produção, desligado fora dela", () => {
    assert.equal(loadEnv().cookieSecure, false);
    process.env.NODE_ENV = "production";
    assert.equal(loadEnv().cookieSecure, true);
  });

  test("COOKIE_SECURE aceita só true ou false", () => {
    process.env.NODE_ENV = "production";
    for (const bad of ["1", "True", "yes", "TRUE"]) {
      process.env.COOKIE_SECURE = bad;
      assert.throws(() => loadEnv(), /COOKIE_SECURE/, bad);
    }
    process.env.COOKIE_SECURE = "false";
    assert.equal(loadEnv().cookieSecure, false);
    process.env.COOKIE_SECURE = "true";
    assert.equal(loadEnv().cookieSecure, true);
  });

  test("captcha: as duas chaves juntas ou nenhuma", () => {
    assert.equal(loadEnv().turnstile, null);
    process.env.TURNSTILE_SITE_KEY = "site";
    assert.throws(() => loadEnv(), /juntas/);
    delete process.env.TURNSTILE_SITE_KEY;
    process.env.TURNSTILE_SECRET_KEY = "segredo";
    assert.throws(() => loadEnv(), /juntas/);
    process.env.TURNSTILE_SITE_KEY = "site";
    assert.deepEqual(loadEnv().turnstile, { secret: "segredo", siteKey: "site" });
  });

  test("verificação automática: ligada sem Turnstile, desligada com Turnstile ou com CAPTCHA_POW=off", () => {
    const on = loadEnv().pow;
    assert.match(on.secret, /^[0-9a-f]{64}$/);
    assert.equal(on.maxNumber, 100_000);
    // O segredo é derivado do JWT_SECRET: muda junto com ele e não é o próprio JWT_SECRET.
    assert.notEqual(on.secret, process.env.JWT_SECRET);
    process.env.JWT_SECRET = "y".repeat(40);
    assert.notEqual(loadEnv().pow.secret, on.secret);

    process.env.CAPTCHA_POW = "off";
    assert.equal(loadEnv().pow, null);
    delete process.env.CAPTCHA_POW;
    process.env.TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "segredo";
    assert.equal(loadEnv().pow, null, "com Turnstile, vale o Turnstile");
    assert.equal(loadEnv().turnstile.siteKey, "site");
  });

  test("POW_MAX_NUMBER: inteiro entre 100 e 5.000.000", () => {
    process.env.POW_MAX_NUMBER = "2000";
    assert.equal(loadEnv().pow.maxNumber, 2000);
    for (const bad of ["99", "5000001", "abc", "1.5", "-5", "0"]) {
      process.env.POW_MAX_NUMBER = bad;
      assert.throws(() => loadEnv(), /POW_MAX_NUMBER/, bad);
    }
  });

  test("chaves de teste da Cloudflare: aceitas fora de produção, recusadas em produção", () => {
    for (const secret of ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]) {
      process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
      process.env.TURNSTILE_SECRET_KEY = secret;
      assert.equal(loadEnv().turnstile.secret, secret);
      process.env.NODE_ENV = "production";
      assert.throws(() => loadEnv(), /chave de teste/);
      delete process.env.NODE_ENV;
    }
  });

  test("RATE_LIMITS=off só fora de produção; sem ele o limite fica ligado", () => {
    assert.equal(loadEnv().rateLimits, undefined);
    process.env.RATE_LIMITS = "ligado";
    assert.equal(loadEnv().rateLimits, undefined, "qualquer valor diferente de off não desliga");
    process.env.RATE_LIMITS = "off";
    assert.equal(loadEnv().rateLimits, false);
    process.env.NODE_ENV = "production";
    assert.throws(() => loadEnv(), /RATE_LIMITS=off não pode ser usado em produção/);
  });

  test("Google: o ID do cliente é opcional; confiança no proxy é número", () => {
    assert.equal(loadEnv().googleClientId, "");
    process.env.GOOGLE_CLIENT_ID = "abc.apps.googleusercontent.com";
    assert.equal(loadEnv().googleClientId, "abc.apps.googleusercontent.com");
    assert.equal(loadEnv().trustProxy, 0);
    process.env.TRUST_PROXY = "1";
    assert.equal(loadEnv().trustProxy, 1);
    process.env.TRUST_PROXY = "lixo";
    assert.equal(loadEnv().trustProxy, 0);
  });
});
