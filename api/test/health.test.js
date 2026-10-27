import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { testEnv } from "../support/helpers.js";

const app = createApp(testEnv);

test("GET /api/health responde 503 sem banco conectado", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { status: "degraded", db: "down" });
});

test("rota inexistente devolve 404 em JSON", async () => {
  const res = await request(app).get("/api/nao-existe");
  assert.equal(res.status, 404);
  assert.equal(res.body.message, "Rota não encontrada");
});

test("não expõe o cabeçalho X-Powered-By", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.headers["x-powered-by"], undefined);
});

test("recusa corpo JSON maior que 10 kb", async () => {
  const res = await request(app)
    .post("/api/auth/signin")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ x: "a".repeat(11 * 1024) }));
  assert.equal(res.status, 413);
});

test("JSON malformado devolve 400 sem vazar detalhes", async () => {
  const res = await request(app)
    .post("/api/auth/signin")
    .set("Content-Type", "application/json")
    .send("{ isto não é json");
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: "JSON inválido" });
});

test("rotas protegidas recusam quem não está logado", async () => {
  for (const [method, path] of [["get", "/api/auth/me"], ["get", "/api/transactions"], ["post", "/api/transactions"]]) {
    const res = await request(app)[method](path);
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test("respostas da API não podem ser guardadas em cache", async () => {
  for (const path of ["/api/health", "/api/auth/me", "/api/nao-existe"]) {
    const res = await request(app).get(path);
    assert.equal(res.headers["cache-control"], "no-store", path);
  }
});
