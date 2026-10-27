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
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("search");

describe("extrato com filtros (GET /transactions/search)", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User, Transaction, Category, RefreshSession].map((m) => m.init()));
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
  const put = (userId, over) =>
    Transaction.collection.insertOne({
      userId: new mongoose.Types.ObjectId(userId),
      type: "output",
      valueCents: 1000,
      description: "Item",
      category: "outros",
      createdAt: new Date("2026-10-15T15:00:00Z"),
      deletedAt: null,
      archivedAt: null,
      ...over,
    });
  const search = async (agent, qs = "") => (await agent.get(`/api/transactions/search${qs ? `?${qs}` : ""}`).expect(200)).body;
  const names = (body) => body.transactions.map((t) => t.description);

  async function seed(userId) {
    await put(userId, { description: "Salário de outubro", type: "input", valueCents: 500000, category: "salario", createdAt: new Date("2026-10-05T15:00:00Z") });
    await put(userId, { description: "Mercado da semana", valueCents: 30000, category: "mercado", createdAt: new Date("2026-10-10T15:00:00Z") });
    await put(userId, { description: "Aluguel", valueCents: 120000, category: "moradia", createdAt: new Date("2026-09-30T15:00:00Z") });
    await put(userId, { description: "Cinema antigo", valueCents: 4000, category: "lazer", createdAt: new Date("2026-08-20T15:00:00Z"), archivedAt: new Date() });
    await put(userId, { description: "Compra apagada", valueCents: 9000, category: "lazer", createdAt: new Date("2026-10-12T15:00:00Z"), deletedAt: new Date() });
  }

  test("exige login", async () => {
    await request(app).get("/api/transactions/search").expect(401);
  });

  test("sem filtros: ativos e arquivados, do mais novo para o mais antigo, sem os excluídos", async () => {
    const { agent, userId } = await loggedAgent();
    await seed(userId);
    const body = await search(agent);
    assert.deepEqual(names(body), ["Mercado da semana", "Salário de outubro", "Aluguel", "Cinema antigo"]);
    assert.deepEqual(body.transactions.map((t) => t.status), ["active", "active", "active", "archived"]);
    assert.equal(body.nextCursor, null);
    assert.deepEqual(body.totals, { count: 4, totalIn: 500000, totalOut: 154000 });
    const first = body.transactions[0];
    assert.deepEqual(Object.keys(first).sort(), ["archivedAt", "category", "createdAt", "deletedAt", "description", "id", "status", "type", "value"]);
    assert.equal(first.value, 30000);
  });

  test("situação: ativos, arquivados, excluídos", async () => {
    const { agent, userId } = await loggedAgent();
    await seed(userId);
    assert.deepEqual(names(await search(agent, "status=active")), ["Mercado da semana", "Salário de outubro", "Aluguel"]);
    assert.deepEqual(names(await search(agent, "status=archived")), ["Cinema antigo"]);
    const deleted = await search(agent, "status=deleted");
    assert.deepEqual(names(deleted), ["Compra apagada"]);
    assert.equal(deleted.transactions[0].status, "deleted");
    assert.ok(deleted.transactions[0].deletedAt);
    assert.deepEqual(deleted.totals, { count: 1, totalIn: 0, totalOut: 9000 });
  });

  test("tipo e categoria (de fábrica, 'outros' com lançamento antigo, e da pessoa)", async () => {
    const { agent, userId } = await loggedAgent();
    await seed(userId);
    const pets = (await agent.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
    await put(userId, { description: "Ração", category: pets.id, createdAt: new Date("2026-10-20T15:00:00Z") });
    await Transaction.collection.insertOne({ userId: new mongoose.Types.ObjectId(userId), type: "output", valueCents: 700, description: "Legado sem categoria", createdAt: new Date("2026-10-01T15:00:00Z") });

    assert.deepEqual(names(await search(agent, "type=input")), ["Salário de outubro"]);
    assert.deepEqual(names(await search(agent, "type=output")).includes("Salário de outubro"), false);
    assert.deepEqual(names(await search(agent, "category=mercado")), ["Mercado da semana"]);
    assert.deepEqual(names(await search(agent, `category=${pets.id}`)), ["Ração"]);
    assert.deepEqual(names(await search(agent, "category=outros")), ["Legado sem categoria"], "'outros' inclui o lançamento antigo sem o campo");
    assert.deepEqual(names(await search(agent, "type=input&category=mercado")), [], "combinação sem resultado");
  });

  test("busca por parte da descrição, sem diferenciar maiúsculas, e caracteres especiais valem como texto", async () => {
    const { agent, userId } = await loggedAgent();
    await seed(userId);
    await put(userId, { description: "Conta (luz) 50% .* [a]", createdAt: new Date("2026-10-21T15:00:00Z") });
    assert.deepEqual(names(await search(agent, "q=MERCADO")), ["Mercado da semana"]);
    assert.deepEqual(names(await search(agent, "q=sal")), ["Salário de outubro"]);
    assert.deepEqual(names(await search(agent, "q=%20semana%20")), ["Mercado da semana"], "espaços nas pontas são ignorados");
    for (const q of ["(luz)", ".*", "[a]", "50%"]) {
      assert.deepEqual(names(await search(agent, `q=${encodeURIComponent(q)}`)), ["Conta (luz) 50% .* [a]"], q);
    }
    assert.deepEqual(names(await search(agent, `q=${encodeURIComponent("(a+)+$")}`)), [], "não vira expressão regular");
    assert.equal((await search(agent, "q=")).transactions.length, 5, "busca vazia não filtra (4 do seed + 1 extra)");
  });

  test("período por dia, inclusive nas duas pontas, no horário de Brasília", async () => {
    const { agent, userId } = await loggedAgent();
    // 02:59 UTC do dia 11 ainda é dia 10 em Brasília; 03:00 UTC já é dia 11.
    await put(userId, { description: "Fim do dia 10", createdAt: new Date("2026-10-11T02:59:59Z") });
    await put(userId, { description: "Começo do dia 11", createdAt: new Date("2026-10-11T03:00:00Z") });
    await put(userId, { description: "Fim do dia 11", createdAt: new Date("2026-10-12T02:59:59Z") });
    await put(userId, { description: "Começo do dia 10", createdAt: new Date("2026-10-10T03:00:00Z") });
    assert.deepEqual(names(await search(agent, "from=2026-10-11&to=2026-10-11")).sort(), ["Começo do dia 11", "Fim do dia 11"]);
    assert.deepEqual(names(await search(agent, "from=2026-10-10&to=2026-10-10")).sort(), ["Começo do dia 10", "Fim do dia 10"]);
    assert.deepEqual(names(await search(agent, "from=2026-10-11")).sort(), ["Começo do dia 11", "Fim do dia 11"], "só a data inicial");
    assert.deepEqual(names(await search(agent, "to=2026-10-10")).sort(), ["Começo do dia 10", "Fim do dia 10"], "só a data final");
    assert.equal((await search(agent, "from=2026-10-10&to=2026-10-11")).transactions.length, 4);
  });

  test("totais valem para o filtro inteiro, não só para a página", async () => {
    const { agent, userId } = await loggedAgent();
    for (let i = 1; i <= 7; i++) await put(userId, { description: `Despesa ${i}`, valueCents: i * 100, createdAt: new Date(`2026-10-0${i}T15:00:00Z`) });
    await put(userId, { description: "Receita", type: "input", valueCents: 5000, createdAt: new Date("2026-10-09T15:00:00Z") });
    const page = await search(agent, "limit=3");
    assert.equal(page.transactions.length, 3);
    assert.deepEqual(page.totals, { count: 8, totalIn: 5000, totalOut: 2800 });
    assert.deepEqual(await search(agent, "limit=3&type=output").then((b) => b.totals), { count: 7, totalIn: 0, totalOut: 2800 });
    // Na segunda página os totais continuam sendo os do filtro inteiro, não os do que sobrou depois do cursor.
    const second = await search(agent, `limit=3&cursor=${page.nextCursor}`);
    assert.equal(second.transactions.length, 3);
    assert.deepEqual(second.totals, { count: 8, totalIn: 5000, totalOut: 2800 });
  });

  test("paginação por cursor: sem repetir nem pular, com datas iguais, e a última página sem cursor", async () => {
    const { agent, userId } = await loggedAgent();
    const same = new Date("2026-10-10T15:00:00Z");
    for (let i = 0; i < 5; i++) await put(userId, { description: `Mesma hora ${i}`, createdAt: same });
    for (let i = 0; i < 4; i++) await put(userId, { description: `Outra hora ${i}`, createdAt: new Date(`2026-10-0${i + 1}T15:00:00Z`) });
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const body = await search(agent, `limit=4${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...body.transactions.map((t) => t.id));
      cursor = body.nextCursor;
      pages++;
      assert.ok(pages < 10, "não pode girar para sempre");
    } while (cursor);
    assert.equal(pages, 3);
    assert.equal(seen.length, 9);
    assert.equal(new Set(seen).size, 9, "nenhum repetido");
    const all = (await Transaction.find({}).lean()).map((t) => String(t._id));
    assert.deepEqual([...seen].sort(), all.sort(), "nenhum pulado");
  });

  test("exatamente um limite cheio não gera cursor", async () => {
    const { agent, userId } = await loggedAgent();
    for (let i = 0; i < 3; i++) await put(userId, { description: `Item ${i}` });
    const body = await search(agent, "limit=3");
    assert.equal(body.transactions.length, 3);
    assert.equal(body.nextCursor, null);
  });

  test("o cursor respeita os filtros da página seguinte", async () => {
    const { agent, userId } = await loggedAgent();
    for (let i = 1; i <= 4; i++) await put(userId, { description: `Despesa ${i}`, createdAt: new Date(`2026-10-0${i}T15:00:00Z`) });
    for (let i = 1; i <= 4; i++) await put(userId, { description: `Receita ${i}`, type: "input", createdAt: new Date(`2026-10-0${i}T16:00:00Z`) });
    const first = await search(agent, "type=input&limit=2");
    const second = await search(agent, `type=input&limit=2&cursor=${first.nextCursor}`);
    assert.deepEqual(names(first), ["Receita 4", "Receita 3"]);
    assert.deepEqual(names(second), ["Receita 2", "Receita 1"]);
    assert.equal(second.nextCursor, null);
  });

  test("parâmetros inválidos são 422 e dizem qual", async () => {
    const { agent } = await loggedAgent();
    const bad = {
      status: ["status=tudo", "status=ACTIVE"],
      type: ["type=transfer"],
      category: ["category=nao-existe", "category=" + "a".repeat(23)],
      from: ["from=2026-02-30", "from=10/10/2026", "from=2026-1-1", "from=1999-12-31"],
      to: ["to=2026-13-01", "to=abc"],
      limit: ["limit=0", "limit=101", "limit=abc", "limit=1.5", "limit=-1"],
      cursor: ["cursor=lixo", "cursor=123_456", "cursor=" + "9".repeat(81)],
      q: ["q=" + "x".repeat(101), "q=a&q=b"],
    };
    for (const [field, queries] of Object.entries(bad)) {
      for (const qs of queries) {
        const res = await agent.get(`/api/transactions/search?${qs}`);
        assert.equal(res.status, 422, qs);
        assert.ok(res.body.errors[field], `${qs} -> ${JSON.stringify(res.body)}`);
      }
    }
    const reversed = await agent.get("/api/transactions/search?from=2026-10-10&to=2026-10-09");
    assert.equal(reversed.status, 422);
    assert.ok(reversed.body.errors.to);
  });

  test("objetos na query viram chaves ignoradas, não operadores do Mongo", async () => {
    const { agent, userId } = await loggedAgent();
    await seed(userId);
    const body = await search(agent, "q[$ne]=x&type[$ne]=input&status[$ne]=all");
    assert.equal(body.transactions.length, 4);
  });

  test("só os lançamentos de quem pediu", async () => {
    const ana = await loggedAgent(1);
    const bia = await loggedAgent(2);
    await put(ana.userId, { description: "Da Ana" });
    await put(bia.userId, { description: "Da Bia", valueCents: 99999 });
    await put(bia.userId, { description: "Apagado da Bia", deletedAt: new Date() });
    assert.deepEqual(names(await search(ana.agent)), ["Da Ana"]);
    assert.deepEqual(names(await search(ana.agent, "q=bia")), []);
    assert.deepEqual(names(await search(ana.agent, "status=deleted")), []);
    assert.equal((await search(ana.agent)).totals.totalOut, 1000);
    // O cursor de uma pessoa não abre os dados de outra: usado por quem não é o dono, só devolve os dele.
    await put(bia.userId, { description: "Outra da Bia", createdAt: new Date("2026-10-16T15:00:00Z") });
    await put(bia.userId, { description: "Mais uma da Bia", createdAt: new Date("2026-10-17T15:00:00Z") });
    const cursor = (await search(bia.agent, "limit=1")).nextCursor;
    assert.ok(cursor, "a Bia tem mais de uma página");
    const withHerCursor = await search(ana.agent, `cursor=${cursor}`);
    assert.deepEqual(names(withHerCursor).filter((n) => /Bia/.test(n)), []);
  });

  test("lançamentos antigos, sem archivedAt e deletedAt, aparecem como ativos", async () => {
    const { agent, userId } = await loggedAgent();
    await Transaction.collection.insertOne({ userId: new mongoose.Types.ObjectId(userId), type: "input", valueCents: 5000, description: "legado", createdAt: new Date("2026-10-01T15:00:00Z") });
    const body = await search(agent, "status=active");
    assert.equal(body.transactions[0].status, "active");
    assert.equal(body.transactions[0].category, "outros");
  });

  test("devolve as categorias da pessoa para a tela mostrar o nome", async () => {
    const { agent, userId } = await loggedAgent();
    const pets = (await agent.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
    await put(userId, { description: "Ração", category: pets.id });
    assert.deepEqual((await search(agent)).categories, [pets]);
  });

  test("sem lançamentos a resposta é vazia e zerada", async () => {
    const { agent } = await loggedAgent();
    assert.deepEqual(await search(agent), { transactions: [], nextCursor: null, totals: { count: 0, totalIn: 0, totalOut: 0 }, categories: [] });
  });
});
