import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import Transaction from "../src/models/Transaction.js";
import Category from "../src/models/Category.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { monthKeyOf, monthRange, shiftMonth } from "@corewallet/shared";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("analysis");

describe("análise financeira", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);
  const now = new Date();
  const current = monthKeyOf(now);
  const back = (n) => shiftMonth(current, -n);
  // Meio do mês (dia 10, 12h em Brasília): longe das bordas.
  const inMonth = (key, day = 10) => new Date(monthRange(key).start.getTime() + (day - 1) * 86_400_000 + 12 * 3_600_000);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User.init(), Transaction.init(), Category.init(), RefreshSession.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User, Transaction, Category, RefreshSession].map((m) => m.deleteMany({})));
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
    return { agent, userId: (await agent.get("/api/auth/me")).body.id };
  }
  const put = (userId, key, type, cents, over = {}) =>
    Transaction.collection.insertOne({
      userId: new mongoose.Types.ObjectId(userId),
      type,
      valueCents: cents,
      description: over.description ?? `${type} ${key}`,
      category: over.category ?? "outros",
      createdAt: over.createdAt ?? inMonth(key),
      deletedAt: null,
      archivedAt: null,
      ...over.extra,
    });
  const get = async (agent, months) => (await agent.get(`/api/analysis${months ? `?months=${months}` : ""}`).expect(200)).body;

  test("exige login", async () => {
    await request(app).get("/api/analysis").expect(401);
  });

  test("padrão de 6 meses, do mais antigo ao atual, com zero onde não houve lançamento", async () => {
    const { agent, userId } = await loggedAgent();
    await put(userId, current, "input", 100000);
    await put(userId, back(2), "output", 25000);
    const body = await get(agent);
    assert.equal(body.months.length, 6);
    assert.deepEqual(body.months.map((m) => m.key), [back(5), back(4), back(3), back(2), back(1), current]);
    assert.deepEqual(body.months[3], { key: back(2), totalIn: 0, totalOut: 25000 });
    assert.deepEqual(body.months[5], { key: current, totalIn: 100000, totalOut: 0 });
    assert.deepEqual(body.months[0], { key: back(5), totalIn: 0, totalOut: 0 });
  });

  test("aceita 3 e 12 meses e recusa o resto", async () => {
    const { agent } = await loggedAgent();
    assert.equal((await get(agent, 3)).months.length, 3);
    assert.equal((await get(agent, 12)).months.length, 12);
    for (const bad of ["0", "1", "5", "7", "13", "24", "abc", "", "-6", "6.0", "06"]) {
      assert.equal((await agent.get(`/api/analysis?months=${bad}`)).status, 422, bad);
    }
    const ignored = await agent.get("/api/analysis?months[$ne]=x").expect(200);
    assert.equal(ignored.body.months.length, 6, "objeto na query vira chave ignorada, usa o padrão");
  });

  test("saldo inicial é tudo o que aconteceu antes do período", async () => {
    const { agent, userId } = await loggedAgent();
    await put(userId, back(9), "input", 500000);
    await put(userId, back(8), "output", 120000);
    await put(userId, back(4), "input", 7000); // dentro de 6 meses: não entra no saldo inicial
    const six = await get(agent, 6);
    assert.equal(six.openingBalance, 500000 - 120000);
    const three = await get(agent, 3);
    assert.equal(three.openingBalance, 500000 - 120000 + 7000, "com 3 meses, o lançamento de 4 meses atrás já é 'antes'");
  });

  test("categorias do período, com o total do período anterior para comparar", async () => {
    const { agent, userId } = await loggedAgent();
    // Período atual (3 meses): atual, -1, -2. Anterior: -3, -4, -5.
    await put(userId, current, "output", 30000, { category: "mercado" });
    await put(userId, back(1), "output", 10000, { category: "mercado" });
    await put(userId, back(2), "output", 5000, { category: "lazer" });
    await put(userId, back(3), "output", 20000, { category: "mercado" });
    await put(userId, back(5), "output", 9000, { category: "moradia" });
    await put(userId, current, "input", 400000, { category: "salario" });
    await put(userId, back(4), "input", 300000, { category: "salario" });
    const body = await get(agent, 3);
    assert.deepEqual(body.categories, [
      { type: "input", category: "salario", total: 400000, previousTotal: 300000 },
      { type: "output", category: "mercado", total: 40000, previousTotal: 20000 },
      { type: "output", category: "lazer", total: 5000, previousTotal: 0 },
    ]);
    assert.deepEqual(body.previous, { totalIn: 300000, totalOut: 29000 });
  });

  test("lançamento antigo, sem category, conta como 'outros'", async () => {
    const { agent, userId } = await loggedAgent();
    await Transaction.collection.insertOne({ userId: new mongoose.Types.ObjectId(userId), type: "output", valueCents: 1234, description: "legado", createdAt: inMonth(current) });
    const body = await get(agent);
    assert.deepEqual(body.categories, [{ type: "output", category: "outros", total: 1234, previousTotal: 0 }]);
    assert.equal(body.months.at(-1).totalOut, 1234);
  });

  test("arquivados contam; excluídos não", async () => {
    const { agent, userId } = await loggedAgent();
    await put(userId, current, "output", 10000, { description: "Normal" });
    await put(userId, current, "output", 20000, { description: "Arquivado", extra: { archivedAt: new Date() } });
    await put(userId, current, "output", 40000, { description: "Excluído", extra: { deletedAt: new Date() } });
    await put(userId, back(8), "output", 80000, { description: "Excluído antigo", extra: { deletedAt: new Date() } });
    const body = await get(agent);
    assert.equal(body.months.at(-1).totalOut, 30000);
    assert.equal(body.openingBalance, 0, "excluído antes do período também fica de fora");
    assert.deepEqual(body.topExpenses.map((t) => t.description), ["Arquivado", "Normal"]);
  });

  test("maiores despesas: só despesas do período, da maior para a menor, no máximo 5", async () => {
    const { agent, userId } = await loggedAgent();
    for (const [i, cents] of [100, 700, 300, 900, 500, 200, 800].entries()) await put(userId, current, "output", cents, { description: `D${i}` });
    await put(userId, current, "input", 999999, { description: "Receita enorme" });
    await put(userId, back(8), "output", 999999, { description: "Antiga demais" });
    const body = await get(agent);
    assert.deepEqual(body.topExpenses.map((t) => [t.description, t.value]), [["D3", 900], ["D6", 800], ["D1", 700], ["D4", 500], ["D2", 300]]);
    assert.deepEqual(Object.keys(body.topExpenses[0]).sort(), ["category", "createdAt", "description", "id", "value"]);
  });

  test("o mês é o de Brasília: 01:30 UTC do dia 1 ainda é do mês anterior", async () => {
    const { agent, userId } = await loggedAgent();
    const nextStart = monthRange(current).end; // 03:00 UTC do dia 1 do mês seguinte
    await put(userId, back(1), "output", 1111, { createdAt: new Date(monthRange(current).start.getTime() - 90 * 60_000), description: "Noite do dia 31" });
    await put(userId, current, "output", 2222, { createdAt: monthRange(current).start, description: "Meia-noite do dia 1" });
    await put(userId, current, "output", 3333, { createdAt: new Date(nextStart.getTime() - 1), description: "Último instante" });
    const body = await get(agent);
    assert.equal(body.months.at(-2).totalOut, 1111);
    assert.equal(body.months.at(-1).totalOut, 2222 + 3333);
  });

  test("só os dados de quem pediu", async () => {
    const ana = await loggedAgent(1);
    const bia = await loggedAgent(2);
    await put(ana.userId, current, "output", 50000, { category: "lazer" });
    await put(bia.userId, current, "output", 7000, { category: "moradia" });
    const a = await get(ana.agent);
    const b = await get(bia.agent);
    assert.equal(a.months.at(-1).totalOut, 50000);
    assert.equal(b.months.at(-1).totalOut, 7000);
    assert.deepEqual(b.categories.map((c) => c.category), ["moradia"]);
    assert.deepEqual(b.topExpenses.map((t) => t.value), [7000]);
  });

  test("devolve as categorias criadas pela pessoa, para a tela mostrar o nome", async () => {
    const { agent, userId } = await loggedAgent();
    const pets = (await agent.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
    await put(userId, current, "output", 8000, { category: pets.id });
    const body = await get(agent);
    assert.deepEqual(body.customCategories, [pets]);
    assert.equal(body.categories[0].category, pets.id);
  });

  test("sem lançamentos a resposta é zerada, sem erro", async () => {
    const { agent } = await loggedAgent();
    const body = await get(agent);
    assert.equal(body.openingBalance, 0);
    assert.deepEqual(body.previous, { totalIn: 0, totalOut: 0 });
    assert.deepEqual(body.categories, []);
    assert.deepEqual(body.topExpenses, []);
    assert.ok(body.months.every((m) => m.totalIn === 0 && m.totalOut === 0));
  });
});
