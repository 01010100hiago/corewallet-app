import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";

const KEYS = ["DATABASE_URI", "JWT_SECRET", "WEB_ORIGIN", "PORT", "COOKIE_SECURE", "NODE_ENV"];

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
});
