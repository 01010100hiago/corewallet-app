import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import RefreshSession from "../src/models/RefreshSession.js";
import RateLimitHit from "../src/models/RateLimitHit.js";
import TwoFactorChallenge from "../src/models/TwoFactorChallenge.js";
import PowUsed from "../src/models/PowUsed.js";
import { MongoRateLimitStore } from "../src/lib/mongoRateLimitStore.js";
import { createMongoClaimStore, createMemoryClaimStore } from "../src/lib/claimStores.js";
import { createPow } from "../src/services/powService.js";
import { createTwoFactor } from "../src/services/twoFactorService.js";
import { codeAt, STEP_SECONDS } from "../src/lib/totp.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";
import { solve } from "./pow.test.js";

const uri = testDbUri("sharedstate");
const PW = user(1).password;

// Duas "instâncias" da API no mesmo processo, cada uma com a sua memória e o MESMO banco: é o que acontece
// quando a API roda em várias cópias. Tudo o que precisa valer entre cópias tem que estar no banco.
describe("estado compartilhado entre instâncias da API", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const advance = (steps = 1) => {
    clock += steps * STEP_SECONDS * 1000;
  };

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User, RefreshSession, RateLimitHit, TwoFactorChallenge, PowUsed].map((m) => m.init()));
  });
  beforeEach(async () => {
    await Promise.all([User, RefreshSession, RateLimitHit, TwoFactorChallenge, PowUsed].map((m) => m.deleteMany({})));
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  describe("limite de tentativas", () => {
    test("40 batidas simultâneas na mesma chave contam 1..40, sem perder nenhuma", async () => {
      const store = new MongoRateLimitStore({ prefix: "t|" });
      store.init({ windowMs: 60_000 });
      const hits = await Promise.all(Array.from({ length: 40 }, () => store.increment("ip-1")));
      assert.deepEqual(hits.map((h) => h.totalHits).sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 1));
    });

    test("a janela vence e recomeça a contagem; decrement e resetKey funcionam; chaves e prefixos não se misturam", async () => {
      let t = 1_000_000;
      const store = new MongoRateLimitStore({ prefix: "a|", now: () => t });
      store.init({ windowMs: 1_000 });
      const other = new MongoRateLimitStore({ prefix: "b|", now: () => t });
      other.init({ windowMs: 1_000 });
      assert.equal((await store.increment("k")).totalHits, 1);
      assert.equal((await store.increment("k")).totalHits, 2);
      assert.equal((await other.increment("k")).totalHits, 1, "outro limite, outra contagem");
      assert.equal((await store.increment("x")).totalHits, 1, "outra chave");
      await store.decrement("k");
      assert.equal((await store.increment("k")).totalHits, 2, "decrement desfez uma batida");
      t += 1_001;
      assert.equal((await store.increment("k")).totalHits, 1, "janela nova");
      await store.resetKey("k");
      assert.equal((await store.increment("k")).totalHits, 1);
      await store.decrement("nunca-visto"); // não cria nem quebra
      assert.equal(await RateLimitHit.countDocuments({ _id: "a|nunca-visto" }), 0);
    });

    test("duas instâncias dividem o MESMO limite (não vira 2 vezes o limite)", async () => {
      const limits = { signin: { windowMs: 60_000, limit: 3 } };
      const a = createApp({ ...testEnv, rateLimits: limits });
      const b = createApp({ ...testEnv, rateLimits: limits });
      const creds = { email: "x@exemplo.com", password: "senha-errada-123" };
      const statuses = [];
      for (const app of [a, b, a, b, a, b]) statuses.push((await request(app).post("/api/auth/signin").send(creds)).status);
      assert.deepEqual(statuses, [401, 401, 401, 429, 429, 429], "o limite vale para o conjunto das instâncias");
    });

    test("com o banco fora do ar o limite deixa passar (falha aberta) e não pendura o pedido", async () => {
      const app = createApp({ ...testEnv, rateLimits: { general: { windowMs: 60_000, limit: 1 } } });
      await mongoose.disconnect();
      try {
        const started = Date.now();
        // /auth/config passa pelo limite geral e não precisa do banco: se a loja do limite falhasse fechada, daria 503.
        const res = await request(app).get("/api/auth/config");
        assert.equal(res.status, 200, "o limite deixou passar porque o banco não respondeu");
        assert.ok(Date.now() - started < 6_000, "não esperou o tempo longo de reconexão");
        assert.equal((await request(app).get("/api/health")).status, 503, "e a saúde continua dizendo que o banco caiu");
      } finally {
        await connectDb(uri);
      }
    });
  });

  describe("verificação automática (PoW)", () => {
    const SECRET = "segredo-do-teste-com-bastante-tamanho-0123456789";
    const mk = () => createPow({ secret: SECRET, maxNumber: 300, now, store: createMongoClaimStore() });

    test("o mesmo desafio, apresentado ao mesmo tempo a duas instâncias, só vale uma vez", async () => {
      const a = mk();
      const b = mk();
      const t = solve(a.issue()); // assinatura do mesmo segredo: qualquer instância confere
      const results = await Promise.all([a.verify(t), b.verify(t), a.verify(t), b.verify(t)]);
      assert.equal(results.filter((r) => r === "ok").length, 1, results.join());
      assert.equal(results.filter((r) => r === "invalid").length, 3);
      assert.equal(await PowUsed.countDocuments(), 1);
    });

    test("na API de verdade: o token usado no cadastro em uma instância é recusado na outra", async () => {
      const env = { ...testEnv, pow: { secret: SECRET, maxNumber: 300 } };
      const a = createApp(env);
      const b = createApp(env);
      const c = (await request(a).get("/api/auth/challenge").expect(200)).body;
      const captchaToken = solve(c);
      await request(a).post("/api/auth/signup").send({ ...user(1), captchaToken }).expect(201);
      const reused = await request(b).post("/api/auth/signup").send({ ...user(2), captchaToken });
      assert.equal(reused.status, 403, "o mesmo token não vale na outra instância");
    });

    test("desafio recusado não fica marcado como usado, e depois o de verdade passa", async () => {
      const a = mk();
      const c = a.issue();
      const good = JSON.parse(Buffer.from(solve(c), "base64").toString());
      const wrong = Buffer.from(JSON.stringify({ ...good, number: (good.number + 1) % 301 })).toString("base64");
      assert.equal(await a.verify(wrong), "invalid");
      assert.equal(await PowUsed.countDocuments(), 0);
      assert.equal(await a.verify(solve(c)), "ok");
    });

    test("loja do banco e loja da memória respondem igual ao mesmo roteiro", async () => {
      for (const store of [createMongoClaimStore(), createMemoryClaimStore({ now })]) {
        const id = `desafio-${Math.random()}`;
        assert.equal(await store.claim(id, now() + 60_000), "ok");
        assert.equal(await store.claim(id, now() + 60_000), "used");
        assert.equal(await store.claim(`${id}-outro`, now() + 60_000), "ok");
      }
    });

    test("banco fora do ar: falha fechada (unavailable), nunca aceita por dúvida", async () => {
      const a = mk();
      const t = solve(a.issue());
      await mongoose.disconnect();
      try {
        assert.equal(await a.verify(t), "unavailable");
      } finally {
        await connectDb(uri);
      }
      assert.equal(await a.verify(t), "ok", "voltando o banco, o mesmo desafio ainda não tinha sido usado");
    });
  });

  describe("segunda etapa do 2FA", () => {
    const mkApp = () => createApp(testEnv, { twoFactor: createTwoFactor({ jwtSecret: testEnv.jwtSecret, now }) });
    const credentials = { email: user(1).email, password: PW };

    async function enabledUser(app) {
      const agent = request.agent(app);
      await agent.post("/api/auth/signup").send(user(1)).expect(201);
      await agent.post("/api/auth/signin").send(credentials).expect(200);
      agent.set("X-CSRF-Token", csrfOf(agent));
      const { secret } = (await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200)).body;
      const { recoveryCodes } = (await agent.post("/api/auth/2fa/enable").send({ code: codeAt(secret, now()) }).expect(200)).body;
      advance();
      return { secret, recoveryCodes };
    }

    test("desafio usado em uma instância não serve em outra", async () => {
      const a = mkApp();
      const b = mkApp();
      const { secret } = await enabledUser(a);
      const { challenge } = (await request(a).post("/api/auth/signin").send(credentials).expect(200)).body;
      await request(b).post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(200);
      advance();
      const replay = await request(a).post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(401);
      assert.equal(replay.body.code, "challenge_invalid");
    });

    test("as 5 tentativas do desafio são somadas entre as instâncias", async () => {
      const a = mkApp();
      const b = mkApp();
      const { secret } = await enabledUser(a);
      const { challenge } = (await request(a).post("/api/auth/signin").send(credentials).expect(200)).body;
      const wrong = (app) => request(app).post("/api/auth/signin/2fa").send({ challenge, code: "000000" });
      for (const app of [a, b, a, b, a]) assert.equal((await wrong(app)).status, 401);
      const sixth = await wrong(b);
      assert.equal(sixth.status, 429);
      assert.equal(sixth.body.code, "challenge_locked");
      // Gastou: nem o código certo abre sessão com este desafio, em qualquer instância.
      await request(a).post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(401);
    });

    test("duas conferências ao mesmo tempo no mesmo desafio, em instâncias diferentes, abrem uma sessão só", async () => {
      const a = mkApp();
      const b = mkApp();
      const { secret, recoveryCodes } = await enabledUser(a);
      const { challenge } = (await request(a).post("/api/auth/signin").send(credentials).expect(200)).body;
      const results = await Promise.all([
        request(a).post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }),
        request(b).post("/api/auth/signin/2fa").send({ challenge, code: recoveryCodes[0] }),
        request(a).post("/api/auth/signin/2fa").send({ challenge, code: recoveryCodes[1] }),
        request(b).post("/api/auth/signin/2fa").send({ challenge, code: recoveryCodes[2] }),
      ]);
      assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.status).join());
    });
  });
});
