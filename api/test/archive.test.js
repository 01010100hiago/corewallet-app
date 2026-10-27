import { describe, test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import Transaction from "../src/models/Transaction.js";
import TransactionEvent from "../src/models/TransactionEvent.js";
import Category from "../src/models/Category.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { monthKeyOf } from "@corewallet/shared";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("arch");

describe("arquivar e desarquivar", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User.init(), Transaction.init(), TransactionEvent.init(), Category.init(), RefreshSession.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User, Transaction, TransactionEvent, Category, RefreshSession].map((m) => m.deleteMany({})));
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
  const add = (agent, body) => agent.post("/api/transactions").send(body);
  const bare = (agent) => {
    const a = request.agent(app);
    a.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
    return a;
  };
  const thisMonth = monthKeyOf(new Date());
  const list = async (agent) => (await agent.get(`/api/transactions?month=${thisMonth}`).expect(200)).body;

  async function seed(agent) {
    const { body: pay } = await add(agent, { type: "input", value: "1000", description: "Salário", category: "salario" }).expect(201);
    const { body: rent } = await add(agent, { type: "output", value: "300", description: "Aluguel", category: "moradia" }).expect(201);
    const { body: food } = await add(agent, { type: "output", value: "100", description: "Mercado", category: "mercado" }).expect(201);
    return { pay, rent, food };
  }

  test("arquivar tira da lista, mas o lançamento continua no saldo, nos totais e no gráfico", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);

    const body = await list(agent);
    assert.deepEqual(body.transactions.map((t) => t.description), ["Mercado", "Salário"], "sai da lista");
    assert.equal(body.balance, 100000 - 30000 - 10000, "o saldo não muda");
    assert.equal(body.totalOut, 40000);
    assert.equal(body.month.totalOut, 40000, "nem o resumo do mês");
    assert.deepEqual(body.month.categories.filter((c) => c.type === "output").map((c) => [c.category, c.total]), [["moradia", 30000], ["mercado", 10000]], "nem o gráfico");
    assert.equal(body.month.count, 2, "count é só o que aparece na lista");
    assert.equal(body.month.archivedCount, 1);
    assert.equal(body.truncated, false);
  });

  test("desarquivar devolve à lista, com a mesma data, e registra no histórico", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);
    const back = await agent.post(`/api/transactions/${rent.id}/unarchive`).expect(200);
    assert.equal(back.body.createdAt, rent.createdAt);
    const body = await list(agent);
    assert.equal(body.transactions.length, 3);
    assert.equal(body.month.archivedCount, 0);
    const { events } = (await agent.get(`/api/transactions/${rent.id}/history`)).body;
    assert.deepEqual(events.map((e) => e.action), ["unarchived", "archived", "created"]);
    assert.equal((await Transaction.findById(rent.id)).archivedAt, null);
  });

  test("arquivar duas vezes ou desarquivar o que não está arquivado é 404, e há um só evento", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    await agent.post(`/api/transactions/${rent.id}/unarchive`).expect(404);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(404);
    assert.equal(await TransactionEvent.countDocuments({ action: "archived" }), 1);
    assert.equal(await TransactionEvent.countDocuments({ action: "unarchived" }), 0);
  });

  test("duas requisições de arquivar ao mesmo tempo: uma vale e há um só evento", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    const results = await Promise.all([1, 2, 3].map(() => agent.post(`/api/transactions/${rent.id}/archive`)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 404, 404]);
    assert.equal(await TransactionEvent.countDocuments({ action: "archived" }), 1);
  });

  test("arquivado não se edita nem se exclui sem desarquivar (409), e nada muda", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);
    const put = await agent.put(`/api/transactions/${rent.id}`).send({ value: "999", description: "Aluguel", category: "moradia" });
    assert.equal(put.status, 409);
    assert.match(put.body.message, /Desarquive/);
    const del = await agent.delete(`/api/transactions/${rent.id}`);
    assert.equal(del.status, 409);
    const saved = await Transaction.findById(rent.id);
    assert.equal(saved.valueCents, 30000);
    assert.equal(saved.deletedAt, null);
    assert.equal(await TransactionEvent.countDocuments({ action: { $in: ["edited", "deleted"] } }), 0);
    // Depois de desarquivar, volta a poder editar e excluir.
    await agent.post(`/api/transactions/${rent.id}/unarchive`).expect(200);
    await agent.put(`/api/transactions/${rent.id}`).send({ value: "310", description: "Aluguel", category: "moradia" }).expect(200);
    await agent.delete(`/api/transactions/${rent.id}`).expect(204);
  });

  test("não arquiva o que foi excluído (404) e excluído não aparece como arquivado", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    await agent.delete(`/api/transactions/${rent.id}`).expect(204);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(404);
    const { archived } = (await agent.get("/api/transactions/activity")).body;
    assert.deepEqual(archived, []);
  });

  test("só o dono arquiva e desarquiva; id inválido é 404", async () => {
    const ana = (await loggedAgent(1)).agent;
    const bia = (await loggedAgent(2)).agent;
    const { rent } = await seed(ana);
    await bia.post(`/api/transactions/${rent.id}/archive`).expect(404);
    await ana.post(`/api/transactions/${rent.id}/archive`).expect(200);
    await bia.post(`/api/transactions/${rent.id}/unarchive`).expect(404);
    await ana.post("/api/transactions/lixo/archive").expect(404);
    await ana.post("/api/transactions/lixo/unarchive").expect(404);
    assert.ok((await Transaction.findById(rent.id)).archivedAt, "continua arquivado");
  });

  test("exige login e o cabeçalho CSRF", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    await request(app).post(`/api/transactions/${rent.id}/archive`).expect(401);
    await bare(agent).post(`/api/transactions/${rent.id}/archive`).expect(403);
    assert.equal((await Transaction.findById(rent.id)).archivedAt, null);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);
    await request(app).post(`/api/transactions/${rent.id}/unarchive`).expect(401);
    await bare(agent).post(`/api/transactions/${rent.id}/unarchive`).expect(403);
    assert.ok((await Transaction.findById(rent.id)).archivedAt);
  });

  test("activity lista os arquivados (com archivedAt), sem depender da janela de eventos", async () => {
    const { agent, userId } = await loggedAgent();
    const { rent, food } = await seed(agent);
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);
    await agent.post(`/api/transactions/${food.id}/archive`).expect(200);
    const body = (await agent.get("/api/transactions/activity")).body;
    assert.deepEqual(body.archived.map((t) => t.description), ["Mercado", "Aluguel"]);
    assert.ok(body.archived.every((t) => t.archivedAt && t.value > 0));
    // 105 eventos mais novos empurram os de arquivar para fora da janela de 100.
    const later = Date.now() + 60_000;
    await TransactionEvent.insertMany(
      Array.from({ length: 105 }, (_, i) => ({
        userId,
        transactionId: rent.id,
        action: "edited",
        at: new Date(later + i),
        snapshot: { type: "output", valueCents: 30000, description: "Aluguel", category: "moradia" },
        changes: [],
      }))
    );
    const again = (await agent.get("/api/transactions/activity")).body;
    assert.equal(again.truncated, true);
    assert.equal(again.archived.length, 2);
  });

  test("com mais de 200 arquivados a resposta avisa que cortou, e desarquivar traz o próximo", async () => {
    const { agent, userId } = await loggedAgent();
    const owner = new mongoose.Types.ObjectId(userId);
    const base = Date.now() - 10_000_000;
    await Transaction.collection.insertMany(
      Array.from({ length: 201 }, (_, i) => ({ userId: owner, type: "output", valueCents: 100, description: `Arq ${i}`, category: "outros", createdAt: new Date(), deletedAt: null, archivedAt: new Date(base + i * 1000) }))
    );
    let body = (await agent.get("/api/transactions/activity")).body;
    assert.equal(body.archived.length, 200);
    assert.equal(body.archivedTruncated, true);
    assert.equal(body.archived[0].description, "Arq 200", "os mais recentes primeiro");
    assert.ok(!body.archived.some((t) => t.description === "Arq 0"), "o mais antigo ficou de fora");
    assert.equal(body.deletedTruncated, false);

    await agent.post(`/api/transactions/${body.archived[0].id}/unarchive`).expect(200);
    body = (await agent.get("/api/transactions/activity")).body;
    assert.equal(body.archived.length, 200);
    assert.equal(body.archivedTruncated, false, "agora cabem todos");
    assert.ok(body.archived.some((t) => t.description === "Arq 0"), "o mais antigo apareceu");
  });

  test("exatamente 200 arquivados não é corte", async () => {
    const { agent, userId } = await loggedAgent();
    const owner = new mongoose.Types.ObjectId(userId);
    await Transaction.collection.insertMany(
      Array.from({ length: 200 }, (_, i) => ({ userId: owner, type: "output", valueCents: 100, description: `Arq ${i}`, category: "outros", createdAt: new Date(), deletedAt: null, archivedAt: new Date() }))
    );
    const body = (await agent.get("/api/transactions/activity")).body;
    assert.equal(body.archived.length, 200);
    assert.equal(body.archivedTruncated, false);
  });

  test("com mais de 200 excluídos a resposta também avisa do corte", async () => {
    const { agent, userId } = await loggedAgent();
    const owner = new mongoose.Types.ObjectId(userId);
    await Transaction.collection.insertMany(
      Array.from({ length: 201 }, (_, i) => ({ userId: owner, type: "output", valueCents: 100, description: `Exc ${i}`, category: "outros", createdAt: new Date(), deletedAt: new Date(Date.now() - i * 1000), archivedAt: null }))
    );
    const body = (await agent.get("/api/transactions/activity")).body;
    assert.equal(body.deleted.length, 200);
    assert.equal(body.deletedTruncated, true);
    assert.equal(body.archivedTruncated, false);
  });

  test("arquivar no meio de uma edição: o filtro da gravação impede editar o arquivado (409)", async () => {
    const { agent } = await loggedAgent();
    const { rent } = await seed(agent);
    // A edição leu o lançamento ANTES de ele ser arquivado: simulamos devolvendo essa leitura velha uma vez.
    const stale = await Transaction.findOne({ _id: rent.id });
    await agent.post(`/api/transactions/${rent.id}/archive`).expect(200);
    const find = mock.method(Transaction, "findOne", () => Promise.resolve(stale), { times: 1 });
    try {
      const res = await agent.put(`/api/transactions/${rent.id}`).send({ value: "999", description: "Aluguel", category: "moradia" });
      assert.equal(res.status, 409);
      assert.match(res.body.message, /Desarquive/);
      assert.equal(find.mock.callCount() >= 1, true);
    } finally {
      find.mock.restore();
    }
    assert.equal((await Transaction.findById(rent.id)).valueCents, 30000, "nada foi gravado");
    assert.equal(await TransactionEvent.countDocuments({ action: "edited" }), 0);
  });

  test("a lista de arquivados é só do dono", async () => {
    const ana = (await loggedAgent(1)).agent;
    const bia = (await loggedAgent(2)).agent;
    const { rent } = await seed(ana);
    await ana.post(`/api/transactions/${rent.id}/archive`).expect(200);
    assert.deepEqual((await bia.get("/api/transactions/activity")).body.archived, []);
  });

  test("o aviso de lista cortada ignora os arquivados", async () => {
    const { agent, userId } = await loggedAgent();
    await seed(agent);
    // 3 arquivados no mês: a lista mostra 3 ativos e não deve dizer que foi cortada.
    await Transaction.collection.insertMany(
      [1, 2, 3].map((n) => ({ userId: new mongoose.Types.ObjectId(userId), type: "output", valueCents: 100, description: `Arq ${n}`, category: "outros", createdAt: new Date(), archivedAt: new Date() }))
    );
    const body = await list(agent);
    assert.equal(body.transactions.length, 3);
    assert.equal(body.truncated, false);
    assert.equal(body.month.archivedCount, 3);
    assert.equal(body.balance, 100000 - 30000 - 10000 - 300);
  });

  test("lançamentos antigos, sem archivedAt, continuam na lista", async () => {
    const { agent, userId } = await loggedAgent();
    await Transaction.collection.insertOne({ userId: new mongoose.Types.ObjectId(userId), type: "input", valueCents: 5000, description: "legado", createdAt: new Date() });
    const body = await list(agent);
    assert.equal(body.transactions.length, 1);
    assert.equal(body.month.archivedCount, 0);
  });
});
