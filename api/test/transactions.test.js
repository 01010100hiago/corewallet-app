import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import Transaction from "../src/models/Transaction.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { monthKeyOf } from "@corewallet/shared";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("tx");

describe("lançamentos: categorias, edição, exclusão e filtro por mês", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User.init(), Transaction.init(), RefreshSession.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), RefreshSession.deleteMany({})]);
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  async function loggedAgent(n = 1) {
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send(user(n)).expect(201);
    await agent.post("/api/auth/signin").send({ email: user(n).email, password: user(n).password }).expect(200);
    agent.set("X-CSRF-Token", csrfOf(agent));
    const { id } = (await agent.get("/api/auth/me")).body;
    return { agent, userId: id };
  }
  const add = (agent, body) => agent.post("/api/transactions").send(body);
  // Insere direto no banco para controlar a data (a API sempre usa a hora do servidor).
  const insertAt = (userId, createdAt, fields = {}) =>
    Transaction.collection.insertOne({
      userId: new mongoose.Types.ObjectId(userId),
      type: "output",
      valueCents: 1000,
      description: "antigo",
      createdAt: new Date(createdAt),
      ...fields,
    });

  describe("categorias", () => {
    test("cria com categoria e devolve ela; sem categoria vira outros", async () => {
      const { agent } = await loggedAgent();
      const a = await add(agent, { type: "output", value: "50", description: "Feira", category: "mercado" }).expect(201);
      assert.equal(a.body.category, "mercado");
      const b = await add(agent, { type: "output", value: "5", description: "Sem categoria" }).expect(201);
      assert.equal(b.body.category, "outros");
    });

    test("categoria precisa ser do tipo: salário numa saída e mercado numa entrada são recusados", async () => {
      const { agent } = await loggedAgent();
      const r1 = await add(agent, { type: "output", value: "5", description: "Errado", category: "salario" });
      assert.equal(r1.status, 422);
      assert.ok(r1.body.errors.category);
      assert.equal((await add(agent, { type: "input", value: "5", description: "Errado", category: "mercado" })).status, 422);
      assert.equal((await add(agent, { type: "input", value: "5", description: "Certo ok", category: "outros" })).status, 201);
      assert.equal(await Transaction.countDocuments(), 1);
    });

    test("categoria desconhecida ou que não é texto é recusada", async () => {
      const { agent } = await loggedAgent();
      for (const category of ["inexistente", "", 7, { $ne: 1 }, ["mercado"]]) {
        const res = await add(agent, { type: "output", value: "5", description: "Teste ok", category });
        assert.equal(res.status, 422, JSON.stringify(category));
      }
    });

    test("lançamentos antigos, sem o campo, aparecem como outros e entram no resumo", async () => {
      const { agent, userId } = await loggedAgent();
      const now = new Date();
      await insertAt(userId, now, { description: "legado" });
      const list = (await agent.get("/api/transactions").expect(200)).body;
      assert.equal(list.transactions[0].category, "outros");
      const month = monthKeyOf(now);
      const res = (await agent.get(`/api/transactions?month=${month}`).expect(200)).body;
      assert.deepEqual(res.month.categories, [{ type: "output", category: "outros", total: 1000 }]);
    });
  });

  describe("editar", () => {
    test("muda valor, descrição e categoria, e o saldo acompanha", async () => {
      const { agent } = await loggedAgent();
      await add(agent, { type: "input", value: "100", description: "Salário", category: "salario" }).expect(201);
      const { body: t } = await add(agent, { type: "output", value: "30", description: "Mercado", category: "mercado" }).expect(201);

      const res = await agent.put(`/api/transactions/${t.id}`).send({ value: "45,90", description: "  Feira grande ", category: "lazer" });
      assert.equal(res.status, 200);
      assert.equal(res.body.value, 4590);
      assert.equal(res.body.description, "Feira grande");
      assert.equal(res.body.category, "lazer");
      assert.equal(res.body.type, "output");
      assert.equal(res.body.createdAt, t.createdAt);

      const list = (await agent.get("/api/transactions")).body;
      assert.equal(list.balance, 10000 - 4590);
      assert.equal(list.transactions.length, 2);
    });

    test("tipo, dono e data não mudam, mesmo se o cliente mandar", async () => {
      const { agent } = await loggedAgent(1);
      const { userId: bia } = await loggedAgent(2);
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Original" }).expect(201);
      await agent
        .put(`/api/transactions/${t.id}`)
        .send({ value: "11", description: "Editado ok", category: "outros", type: "input", userId: bia, createdAt: "2000-01-01" })
        .expect(200);
      const saved = await Transaction.findById(t.id);
      assert.equal(saved.type, "output");
      assert.equal(String(saved.userId), (await agent.get("/api/auth/me")).body.id);
      assert.equal(saved.createdAt.toISOString(), t.createdAt);
    });

    test("editar sem mandar a categoria é erro e a categoria que existia continua", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Mercado", category: "mercado" }).expect(201);
      const res = await agent.put(`/api/transactions/${t.id}`).send({ value: "20", description: "Mercado novo" });
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.category);
      const saved = await Transaction.findById(t.id);
      assert.equal(saved.category, "mercado");
      assert.equal(saved.valueCents, 1000);
    });

    test("categoria de outro tipo é recusada na edição também", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Mercado" }).expect(201);
      const res = await agent.put(`/api/transactions/${t.id}`).send({ value: "10", description: "Mercado", category: "salario" });
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.category);
      assert.equal((await Transaction.findById(t.id)).category, "outros");
    });

    test("valida os campos como na criação", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Mercado" }).expect(201);
      for (const body of [
        { value: "0", description: "Mercado", category: "outros" },
        { value: "abc", description: "Mercado", category: "outros" },
        { value: "10", description: "ab", category: "outros" },
        { value: { $gt: 0 }, description: "Mercado", category: "outros" },
      ]) {
        assert.equal((await agent.put(`/api/transactions/${t.id}`).send(body)).status, 422, JSON.stringify(body));
      }
      assert.equal((await Transaction.findById(t.id)).valueCents, 1000);
    });

    test("não edita lançamento de outra pessoa nem id que não existe ou é inválido", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: t } = await add(ana, { type: "output", value: "10", description: "Da Ana" }).expect(201);
      const body = { value: "99", description: "Invadido", category: "outros" };
      await bia.put(`/api/transactions/${t.id}`).send(body).expect(404);
      await ana.put(`/api/transactions/${new mongoose.Types.ObjectId()}`).send(body).expect(404);
      await ana.put("/api/transactions/nao-e-id").send(body).expect(404);
      const saved = await Transaction.findById(t.id);
      assert.equal(saved.valueCents, 1000);
      assert.equal(saved.description, "Da Ana");
    });

    test("exige login e o cabeçalho CSRF", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Mercado" }).expect(201);
      const body = { value: "20", description: "Mercado", category: "outros" };
      await request(app).put(`/api/transactions/${t.id}`).send(body).expect(401);

      const bare = request.agent(app);
      bare.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
      await bare.put(`/api/transactions/${t.id}`).send(body).expect(403);
      assert.equal((await Transaction.findById(t.id)).valueCents, 1000);
    });
  });

  describe("buscar um", () => {
    test("devolve o lançamento do dono e 404 para os outros", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: t } = await add(ana, { type: "output", value: "10", description: "Da Ana", category: "lazer" }).expect(201);
      const own = await ana.get(`/api/transactions/${t.id}`).expect(200);
      assert.equal(own.body.category, "lazer");
      assert.equal(own.body.userId, undefined);
      await bia.get(`/api/transactions/${t.id}`).expect(404);
      await ana.get("/api/transactions/lixo").expect(404);
      await request(app).get(`/api/transactions/${t.id}`).expect(401);
    });
  });

  describe("excluir", () => {
    test("apaga, o saldo acompanha e uma segunda exclusão dá 404", async () => {
      const { agent } = await loggedAgent();
      await add(agent, { type: "input", value: "100", description: "Salário" }).expect(201);
      const { body: t } = await add(agent, { type: "output", value: "30", description: "Mercado" }).expect(201);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      const list = (await agent.get("/api/transactions")).body;
      assert.equal(list.transactions.length, 1);
      assert.equal(list.balance, 10000);
      await agent.delete(`/api/transactions/${t.id}`).expect(404);
    });

    test("não apaga lançamento de outra pessoa, nem com id inválido", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: t } = await add(ana, { type: "output", value: "10", description: "Da Ana" }).expect(201);
      await bia.delete(`/api/transactions/${t.id}`).expect(404);
      await bia.delete("/api/transactions/lixo").expect(404);
      assert.equal(await Transaction.countDocuments(), 1);
    });

    test("exige login e o cabeçalho CSRF", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Mercado" }).expect(201);
      await request(app).delete(`/api/transactions/${t.id}`).expect(401);
      const bare = request.agent(app);
      bare.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
      await bare.delete(`/api/transactions/${t.id}`).expect(403);
      assert.equal(await Transaction.countDocuments(), 1);
    });
  });

  describe("filtro por mês", () => {
    test("lista e resume só o mês pedido; o saldo continua sendo o geral", async () => {
      const { agent, userId } = await loggedAgent();
      await insertAt(userId, "2026-09-15T15:00:00Z", { type: "input", valueCents: 500000, description: "Set entrada", category: "salario" });
      await insertAt(userId, "2026-10-05T15:00:00Z", { type: "input", valueCents: 300000, description: "Out entrada", category: "freelance" });
      await insertAt(userId, "2026-10-10T15:00:00Z", { valueCents: 20000, description: "Out mercado", category: "mercado" });
      await insertAt(userId, "2026-10-12T15:00:00Z", { valueCents: 10000, description: "Out lazer", category: "lazer" });
      await insertAt(userId, "2026-10-20T15:00:00Z", { valueCents: 5000, description: "Out mercado 2", category: "mercado" });

      const res = (await agent.get("/api/transactions?month=2026-10").expect(200)).body;
      assert.deepEqual(res.transactions.map((t) => t.description), ["Out mercado 2", "Out lazer", "Out mercado", "Out entrada"]);
      assert.equal(res.month.key, "2026-10");
      assert.equal(res.month.totalIn, 300000);
      assert.equal(res.month.totalOut, 35000);
      assert.equal(res.month.count, 4);
      assert.deepEqual(res.month.categories.filter((c) => c.type === "output"), [
        { type: "output", category: "mercado", total: 25000 },
        { type: "output", category: "lazer", total: 10000 },
      ]);
      // Saldo e totais gerais ignoram o filtro.
      assert.equal(res.balance, 500000 + 300000 - 35000);
      assert.equal(res.totalIn, 800000);
      assert.equal(res.totalOut, 35000);
      assert.equal(res.truncated, false);
    });

    test("o limite entre meses é o horário de Brasília (UTC-3)", async () => {
      const { agent, userId } = await loggedAgent();
      // 01/11 01:30 UTC ainda é 31/10 22:30 em Brasília: pertence a outubro.
      await insertAt(userId, "2026-11-01T01:30:00Z", { description: "noite de 31" });
      // 01/11 03:00 UTC = 01/11 00:00 em Brasília: já é novembro.
      await insertAt(userId, "2026-11-01T03:00:00Z", { description: "meia-noite de 1" });
      // 01/10 02:59 UTC = 30/09 23:59 em Brasília: ainda setembro.
      await insertAt(userId, "2026-10-01T02:59:00Z", { description: "fim de setembro" });
      const names = async (m) => (await agent.get(`/api/transactions?month=${m}`)).body.transactions.map((t) => t.description);
      assert.deepEqual(await names("2026-10"), ["noite de 31"]);
      assert.deepEqual(await names("2026-11"), ["meia-noite de 1"]);
      assert.deepEqual(await names("2026-09"), ["fim de setembro"]);
    });

    test("mês sem lançamentos vem zerado, e sem o filtro o campo month é null", async () => {
      const { agent } = await loggedAgent();
      const res = (await agent.get("/api/transactions?month=2020-01").expect(200)).body;
      assert.deepEqual(res.month, { key: "2020-01", totalIn: 0, totalOut: 0, count: 0, categories: [] });
      assert.equal((await agent.get("/api/transactions")).body.month, null);
    });

    test("mês inválido é 422", async () => {
      const { agent } = await loggedAgent();
      for (const m of ["2026-13", "2026-00", "26-10", "2026-1", "abc", "1999-12", "2101-01", "2026-10-01"]) {
        assert.equal((await agent.get(`/api/transactions?month=${m}`)).status, 422, m);
      }
      // O Express 5 não monta objetos a partir da query: month[$ne] vira uma chave
      // qualquer, ignorada, e não vira operador do Mongo.
      const ignored = await agent.get("/api/transactions?month[$ne]=x").expect(200);
      assert.equal(ignored.body.month, null);
    });

    test("o resumo do mês é só do dono", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      await insertAt(ana.userId, "2026-10-10T15:00:00Z", { valueCents: 9999, category: "mercado" });
      const res = (await bia.agent.get("/api/transactions?month=2026-10")).body;
      assert.equal(res.month.totalOut, 0);
      assert.equal(res.transactions.length, 0);
    });
  });
});
