import { describe, test, before, after, beforeEach } from "node:test";
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

const uri = testDbUri("hist");

describe("histórico, exclusão suave e categorias próprias", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
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

  describe("histórico", () => {
    test("criar grava o evento 'created' com o lançamento como ficou", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "12,50", description: "Café", category: "lazer" }).expect(201);
      const history = (await agent.get(`/api/transactions/${t.id}/history`).expect(200)).body;
      assert.equal(history.deleted, false);
      assert.equal(history.events.length, 1);
      const [e] = history.events;
      assert.equal(e.action, "created");
      assert.deepEqual(e.snapshot, { type: "output", value: 1250, description: "Café", category: "lazer" });
      assert.deepEqual(e.changes, []);
      assert.equal(e.transactionId, t.id);
    });

    test("editar grava o que mudou (de → para), do mais novo para o mais antigo", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "120,50", description: "Feira", category: "mercado" }).expect(201);
      await agent.put(`/api/transactions/${t.id}`).send({ value: "100", description: "Feira", category: "lazer" }).expect(200);
      await agent.put(`/api/transactions/${t.id}`).send({ value: "100", description: "Feira grande", category: "lazer" }).expect(200);

      const { events } = (await agent.get(`/api/transactions/${t.id}/history`)).body;
      assert.deepEqual(events.map((e) => e.action), ["edited", "edited", "created"]);
      assert.deepEqual(events[0].changes, [{ field: "description", from: "Feira", to: "Feira grande" }]);
      assert.deepEqual(events[1].changes, [
        { field: "value", from: 12050, to: 10000 },
        { field: "category", from: "mercado", to: "lazer" },
      ]);
      assert.equal(events[0].snapshot.description, "Feira grande");
      assert.ok(new Date(events[0].at) >= new Date(events[1].at));
    });

    test("editar sem mudar nada não cria evento", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Igual", category: "lazer" }).expect(201);
      const res = await agent.put(`/api/transactions/${t.id}`).send({ value: "10,00", description: "  Igual ", category: "lazer" });
      assert.equal(res.status, 200);
      assert.equal(await TransactionEvent.countDocuments(), 1);
    });

    test("o histórico é só de quem é dono; id inválido ou de outra pessoa dá 404", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: t } = await add(ana, { type: "output", value: "10", description: "Da Ana" }).expect(201);
      await bia.get(`/api/transactions/${t.id}/history`).expect(404);
      await ana.get("/api/transactions/lixo/history").expect(404);
      await ana.get(`/api/transactions/${new mongoose.Types.ObjectId()}/history`).expect(404);
      await request(app).get(`/api/transactions/${t.id}/history`).expect(401);
    });

    test("não existe rota para mexer no histórico", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Teste" }).expect(201);
      for (const [method, path] of [["delete", `/api/transactions/${t.id}/history`], ["put", `/api/transactions/${t.id}/history`], ["post", `/api/transactions/${t.id}/history`], ["delete", "/api/transactions/activity"]]) {
        const res = await agent[method](path).send({});
        assert.ok([404, 405].includes(res.status) || (method === "put" && res.status === 404), `${method} ${path} -> ${res.status}`);
      }
      assert.equal(await TransactionEvent.countDocuments(), 1);
    });
  });

  describe("excluir (suave) e restaurar", () => {
    test("excluir tira da lista, dos totais, do resumo do mês e do gráfico, mas o registro continua no banco", async () => {
      const { agent } = await loggedAgent();
      await add(agent, { type: "input", value: "100", description: "Salário", category: "salario" }).expect(201);
      const { body: t } = await add(agent, { type: "output", value: "30", description: "Mercado", category: "mercado" }).expect(201);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);

      const list = (await agent.get(`/api/transactions?month=${thisMonth}`)).body;
      assert.deepEqual(list.transactions.map((x) => x.description), ["Salário"]);
      assert.equal(list.balance, 10000);
      assert.equal(list.totalOut, 0);
      assert.equal(list.month.totalOut, 0);
      assert.equal(list.month.count, 1);
      assert.deepEqual(list.month.categories, [{ type: "input", category: "salario", total: 10000 }]);

      await agent.get(`/api/transactions/${t.id}`).expect(404);
      await agent.put(`/api/transactions/${t.id}`).send({ value: "5", description: "Mercado", category: "mercado" }).expect(404);
      await agent.delete(`/api/transactions/${t.id}`).expect(404);

      const kept = await Transaction.findById(t.id);
      assert.ok(kept, "o documento não é apagado");
      assert.ok(kept.deletedAt instanceof Date);
      assert.equal(kept.valueCents, 3000);
    });

    test("o histórico de um lançamento excluído continua acessível, com o evento 'deleted'", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "30", description: "Mercado", category: "mercado" }).expect(201);
      await agent.put(`/api/transactions/${t.id}`).send({ value: "35", description: "Mercado", category: "mercado" }).expect(200);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      const history = (await agent.get(`/api/transactions/${t.id}/history`).expect(200)).body;
      assert.equal(history.deleted, true);
      assert.deepEqual(history.events.map((e) => e.action), ["deleted", "edited", "created"]);
      assert.equal(history.events[0].snapshot.value, 3500, "guarda como estava ao excluir");
    });

    test("restaurar devolve o lançamento (mesma data), os totais voltam e fica registrado", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "30", description: "Mercado", category: "mercado" }).expect(201);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      const res = await agent.post(`/api/transactions/${t.id}/restore`).expect(200);
      assert.equal(res.body.id, t.id);
      assert.equal(res.body.createdAt, t.createdAt);
      assert.equal(res.body.value, 3000);

      const list = (await agent.get(`/api/transactions?month=${thisMonth}`)).body;
      assert.equal(list.transactions.length, 1);
      assert.equal(list.balance, -3000);
      const { events } = (await agent.get(`/api/transactions/${t.id}/history`)).body;
      assert.deepEqual(events.map((e) => e.action), ["restored", "deleted", "created"]);
      assert.equal((await Transaction.findById(t.id)).deletedAt, null);
    });

    test("restaurar o que não está excluído, de outra pessoa ou inválido dá 404", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: t } = await add(ana, { type: "output", value: "30", description: "Da Ana" }).expect(201);
      await ana.post(`/api/transactions/${t.id}/restore`).expect(404);
      await ana.delete(`/api/transactions/${t.id}`).expect(204);
      await bia.post(`/api/transactions/${t.id}/restore`).expect(404);
      await ana.post("/api/transactions/lixo/restore").expect(404);
      assert.ok((await Transaction.findById(t.id)).deletedAt, "continua excluído");
    });

    test("excluir e restaurar exigem login e o cabeçalho CSRF", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "30", description: "Mercado" }).expect(201);
      await request(app).delete(`/api/transactions/${t.id}`).expect(401);
      await bare(agent).delete(`/api/transactions/${t.id}`).expect(403);
      assert.equal((await Transaction.findById(t.id)).deletedAt, null);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      await request(app).post(`/api/transactions/${t.id}/restore`).expect(401);
      await bare(agent).post(`/api/transactions/${t.id}/restore`).expect(403);
      assert.ok((await Transaction.findById(t.id)).deletedAt);
    });

    test("lançamentos antigos, sem o campo deletedAt, continuam aparecendo e somando", async () => {
      const { agent, userId } = await loggedAgent();
      await Transaction.collection.insertOne({ userId: new mongoose.Types.ObjectId(userId), type: "input", valueCents: 5000, description: "legado", createdAt: new Date() });
      const list = (await agent.get(`/api/transactions?month=${thisMonth}`)).body;
      assert.equal(list.transactions.length, 1);
      assert.equal(list.balance, 5000);
      assert.equal(list.month.totalIn, 5000);
    });
  });

  describe("registro geral de alterações", () => {
    test("lista os eventos do usuário, do mais novo para o mais antigo, e só os dele", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: a } = await add(ana, { type: "output", value: "10", description: "Primeiro" }).expect(201);
      await add(ana, { type: "input", value: "20", description: "Segundo" }).expect(201);
      await add(bia, { type: "input", value: "99", description: "Da Bia" }).expect(201);
      await ana.put(`/api/transactions/${a.id}`).send({ value: "11", description: "Primeiro", category: "outros" }).expect(200);

      const events = (await ana.get("/api/transactions/activity").expect(200)).body.events;
      assert.deepEqual(events.map((e) => `${e.action}:${e.snapshot.description}`), ["edited:Primeiro", "created:Segundo", "created:Primeiro"]);
      assert.ok(!events.some((e) => e.snapshot.description === "Da Bia"));
      await request(app).get("/api/transactions/activity").expect(401);
    });

    test("activity traz os eventos, o aviso de corte e a lista dos excluídos", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Vai e volta" }).expect(201);
      const get = async () => (await agent.get("/api/transactions/activity").expect(200)).body;

      assert.deepEqual((await get()).deleted, []);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      let body = await get();
      assert.equal(body.truncated, false);
      assert.deepEqual(body.deleted.map((d) => [d.id, d.description, d.value, d.type]), [[t.id, "Vai e volta", 1000, "output"]]);
      assert.ok(body.deleted[0].deletedAt);
      assert.ok(!("canRestore" in body.events[0]));

      await agent.post(`/api/transactions/${t.id}/restore`).expect(200);
      assert.deepEqual((await get()).deleted, []);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      assert.equal((await get()).deleted.length, 1);
    });

    test("um excluído antigo continua na lista de excluídos mesmo fora da janela de 100 eventos", async () => {
      const { agent, userId } = await loggedAgent();
      const { body: old } = await add(agent, { type: "output", value: "10", description: "Excluído faz tempo" }).expect(201);
      await agent.delete(`/api/transactions/${old.id}`).expect(204);
      const { body: other } = await add(agent, { type: "input", value: "5", description: "Outro" }).expect(201);
      // 105 eventos mais novos empurram a exclusão para fora da janela do registro.
      const later = Date.now() + 60_000;
      await TransactionEvent.insertMany(
        Array.from({ length: 105 }, (_, i) => ({
          userId,
          transactionId: other.id,
          action: "edited",
          at: new Date(later + i),
          snapshot: { type: "input", valueCents: 500, description: "Outro", category: "outros" },
          changes: [],
        }))
      );
      const body = (await agent.get("/api/transactions/activity").expect(200)).body;
      assert.equal(body.events.length, 100);
      assert.equal(body.truncated, true);
      assert.ok(!body.events.some((e) => e.transactionId === old.id), "a exclusão ficou fora do registro");
      assert.deepEqual(body.deleted.map((d) => d.id), [old.id], "mas continua listada para restaurar");
      await agent.post(`/api/transactions/${old.id}/restore`).expect(200);
    });

    test("a lista de excluídos é só do dono", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const { body: t } = await add(ana, { type: "output", value: "10", description: "Da Ana" }).expect(201);
      await ana.delete(`/api/transactions/${t.id}`).expect(204);
      assert.deepEqual((await bia.get("/api/transactions/activity")).body.deleted, []);
      assert.equal((await ana.get("/api/transactions/activity")).body.deleted.length, 1);
    });
  });

  describe("concorrência e repetição", () => {
    test("restaurar duas vezes: a segunda é 404 e só há um evento 'restored'", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Repetido" }).expect(201);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      await agent.post(`/api/transactions/${t.id}/restore`).expect(200);
      await agent.post(`/api/transactions/${t.id}/restore`).expect(404);
      assert.equal(await TransactionEvent.countDocuments({ action: "restored" }), 1);
    });

    test("editar um lançamento já excluído é 404 e não cria evento", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Excluído" }).expect(201);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      await agent.put(`/api/transactions/${t.id}`).send({ value: "99", description: "Excluído", category: "outros" }).expect(404);
      assert.equal(await TransactionEvent.countDocuments({ action: "edited" }), 0);
      assert.equal((await Transaction.findById(t.id)).valueCents, 1000);
    });

    test("duas exclusões ao mesmo tempo: uma vale, a outra é 404, e há um só evento", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Corrida" }).expect(201);
      const results = await Promise.all([1, 2, 3].map(() => agent.delete(`/api/transactions/${t.id}`)));
      assert.deepEqual(results.map((r) => r.status).sort(), [204, 404, 404]);
      assert.equal(await TransactionEvent.countDocuments({ action: "deleted" }), 1);
    });

    test("duas restaurações ao mesmo tempo: uma vale e há um só evento", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Corrida" }).expect(201);
      await agent.delete(`/api/transactions/${t.id}`).expect(204);
      const results = await Promise.all([1, 2, 3].map(() => agent.post(`/api/transactions/${t.id}/restore`)));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 404, 404]);
      assert.equal(await TransactionEvent.countDocuments({ action: "restored" }), 1);
    });

    test("edições ao mesmo tempo: cada evento parte do valor que o anterior deixou (histórico encadeado)", async () => {
      const { agent } = await loggedAgent();
      const { body: t } = await add(agent, { type: "output", value: "10", description: "Disputa", category: "lazer" }).expect(201);
      const values = ["11", "12", "13", "14", "15", "16"];
      const results = await Promise.all(values.map((value) => agent.put(`/api/transactions/${t.id}`).send({ value, description: "Disputa", category: "lazer" })));
      assert.ok(results.every((r) => [200, 409].includes(r.status)), results.map((r) => r.status).join());
      assert.ok(results.some((r) => r.status === 200));

      const edits = (await TransactionEvent.find({ transactionId: t.id, action: "edited" }).lean()).map((e) => e.changes.find((c) => c.field === "value"));
      assert.equal(edits.length, results.filter((r) => r.status === 200).length, "um evento por edição que valeu");
      // Cada "de" aparece uma vez só e o caminho de 1000 até o valor final passa por todos os eventos.
      const next = new Map(edits.map((c) => [c.from, c.to]));
      assert.equal(next.size, edits.length, "dois eventos com o mesmo 'de' seriam um histórico incoerente");
      let at = 1000;
      for (let i = 0; i < edits.length; i++) at = next.get(at);
      assert.equal(at, (await Transaction.findById(t.id)).valueCents);
    });
  });

  describe("categorias da pessoa", () => {
    test("criar devolve id, tipo e nome limpos; listar mostra só as da pessoa", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const res = await ana.post("/api/categories").send({ type: "output", name: "  Pets   e   bichos " }).expect(201);
      assert.match(res.body.id, /^[0-9a-f]{24}$/);
      assert.deepEqual({ type: res.body.type, name: res.body.name }, { type: "output", name: "Pets e bichos" });
      assert.deepEqual((await ana.get("/api/categories")).body.categories, [res.body]);
      assert.deepEqual((await bia.get("/api/categories")).body.categories, []);
    });

    test("mesmo nome (sem diferenciar maiúscula nem acento) devolve a categoria que já existe", async () => {
      const { agent } = await loggedAgent();
      const first = await agent.post("/api/categories").send({ type: "output", name: "Café da manhã" }).expect(201);
      for (const name of ["café da manhã", "CAFE DA MANHA", " Cafe  da manha "]) {
        const again = await agent.post("/api/categories").send({ type: "output", name }).expect(200);
        assert.equal(again.body.id, first.body.id, name);
      }
      assert.equal(await Category.countDocuments(), 1);
    });

    test("nome de uma categoria de fábrica do mesmo tipo devolve a de fábrica", async () => {
      const { agent } = await loggedAgent();
      const res = await agent.post("/api/categories").send({ type: "output", name: "mercado" }).expect(200);
      assert.deepEqual(res.body, { id: "mercado", type: "output", name: "Supermercado" });
      const viaLabel = await agent.post("/api/categories").send({ type: "output", name: "Supermercado" }).expect(200);
      assert.equal(viaLabel.body.id, "mercado", "pelo nome que aparece na tela");
      const res2 = await agent.post("/api/categories").send({ type: "output", name: "Contas e serviços" }).expect(200);
      assert.equal(res2.body.id, "contas");
      assert.equal(await Category.countDocuments(), 0);
      // "Salário" só existe em entradas: numa saída vira categoria nova.
      assert.equal((await agent.post("/api/categories").send({ type: "output", name: "Salário" }).expect(201)).body.name, "Salário");
    });

    test("o mesmo nome em entrada e saída são categorias diferentes", async () => {
      const { agent } = await loggedAgent();
      const a = await agent.post("/api/categories").send({ type: "output", name: "Extras" }).expect(201);
      const b = await agent.post("/api/categories").send({ type: "input", name: "Extras" }).expect(201);
      assert.notEqual(a.body.id, b.body.id);
    });

    test("duas pessoas podem ter o mesmo nome sem conflito", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const a = await ana.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201);
      const b = await bia.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201);
      assert.notEqual(a.body.id, b.body.id);
    });

    test("duas criações ao mesmo tempo resultam numa só categoria", async () => {
      const { agent } = await loggedAgent();
      const results = await Promise.all([1, 2, 3, 4].map(() => agent.post("/api/categories").send({ type: "output", name: "Corrida" })));
      assert.ok(results.every((r) => [200, 201].includes(r.status)), results.map((r) => r.status).join());
      assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
      assert.equal(await Category.countDocuments(), 1);
    });

    test("nomes inválidos, tipo inválido e objetos são recusados", async () => {
      const { agent } = await loggedAgent();
      const bad = [
        { type: "output", name: "a" },
        { type: "output", name: "x".repeat(31) },
        { type: "output", name: "   " },
        { type: "output", name: "<script>alert(1)</script>" },
        { type: "output", name: "-começa com símbolo" },
        { type: "output", name: "😀😀" },
        { type: "output", name: { $ne: 1 } },
        { type: "output", name: ["Pets"] },
        { type: "transfer", name: "Pets" },
        { name: "Pets" },
        { type: "output" },
      ];
      for (const body of bad) {
        assert.equal((await agent.post("/api/categories").send(body)).status, 422, JSON.stringify(body));
      }
      assert.equal(await Category.countDocuments(), 0);
      // Quebra de linha e espaços repetidos viram um espaço só, em vez de entrar no nome.
      assert.equal((await agent.post("/api/categories").send({ type: "output", name: "linha\n\tnova" }).expect(201)).body.name, "linha nova");
      for (const name of ["Pets", "Aulas de violão", "Imposto 2026", "Mãe & filhos", "Carro (IPVA)".replace("(", "").replace(")", "")]) {
        assert.equal((await agent.post("/api/categories").send({ type: "output", name })).status, 201, name);
      }
    });

    test("no máximo 30 categorias próprias por tipo", async () => {
      const { agent, userId } = await loggedAgent();
      await Category.insertMany(Array.from({ length: 30 }, (_, i) => ({ userId, type: "output", name: `Cat ${i}`, nameKey: `cat ${i}` })));
      const res = await agent.post("/api/categories").send({ type: "output", name: "Trigésima primeira" });
      assert.equal(res.status, 422);
      assert.match(res.body.errors.name, /30/);
      // Repetir uma que já existe continua funcionando, e as entradas têm limite à parte.
      assert.equal((await agent.post("/api/categories").send({ type: "output", name: "cat 3" })).status, 200);
      assert.equal((await agent.post("/api/categories").send({ type: "input", name: "Nova entrada" })).status, 201);
    });

    test("o limite de 30 vale mesmo com criações ao mesmo tempo", async () => {
      const { agent, userId } = await loggedAgent();
      await Category.insertMany(Array.from({ length: 28 }, (_, i) => ({ userId, type: "output", name: `Cat ${i}`, nameKey: `cat ${i}` })));
      const results = await Promise.all(["Aa", "Bb", "Cc", "Dd", "Ee", "Ff"].map((name) => agent.post("/api/categories").send({ type: "output", name })));
      assert.ok(await Category.countDocuments({ userId, type: "output" }) <= 30);
      assert.ok(results.some((r) => r.status === 201), "ao menos uma coube");
      assert.ok(results.every((r) => [201, 422].includes(r.status)), results.map((r) => r.status).join());
    });

    test("exige login e o cabeçalho CSRF", async () => {
      const { agent } = await loggedAgent();
      await request(app).get("/api/categories").expect(401);
      await request(app).post("/api/categories").send({ type: "output", name: "Pets" }).expect(401);
      await bare(agent).post("/api/categories").send({ type: "output", name: "Pets" }).expect(403);
      assert.equal(await Category.countDocuments(), 0);
    });
  });

  describe("lançamentos com categoria da pessoa", () => {
    test("criar, listar e resumir usando uma categoria própria", async () => {
      const { agent } = await loggedAgent();
      const cat = (await agent.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
      const { body: t } = await add(agent, { type: "output", value: "80", description: "Ração", category: cat.id }).expect(201);
      assert.equal(t.category, cat.id);
      const list = (await agent.get(`/api/transactions?month=${thisMonth}`)).body;
      assert.deepEqual(list.categories, [cat]);
      assert.deepEqual(list.month.categories, [{ type: "output", category: cat.id, total: 8000 }]);
    });

    test("categoria própria só vale no tipo certo, para o dono, e se existir", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const pets = (await ana.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
      const body = (category, type = "output") => ({ type, value: "10", description: "Teste ok", category });
      assert.equal((await add(ana, body(pets.id, "input"))).status, 422, "categoria de saída numa entrada");
      assert.equal((await add(bia, body(pets.id))).status, 422, "categoria de outra pessoa");
      assert.equal((await add(ana, body(String(new mongoose.Types.ObjectId())))).status, 422, "id que não existe");
      assert.equal((await add(ana, body("a".repeat(24)))).status, 422);
      assert.equal(await Transaction.countDocuments(), 0);
      assert.equal((await add(ana, body(pets.id))).status, 201);
    });

    test("editar para uma categoria própria, e a regra vale também na edição", async () => {
      const ana = (await loggedAgent(1)).agent;
      const bia = (await loggedAgent(2)).agent;
      const pets = (await ana.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
      const { body: t } = await add(ana, { type: "output", value: "10", description: "Ração" }).expect(201);
      await ana.put(`/api/transactions/${t.id}`).send({ value: "10", description: "Ração", category: pets.id }).expect(200);
      assert.equal((await Transaction.findById(t.id)).category, pets.id);
      const { body: u } = await add(bia, { type: "output", value: "10", description: "Da Bia" }).expect(201);
      const res = await bia.put(`/api/transactions/${u.id}`).send({ value: "10", description: "Da Bia", category: pets.id });
      assert.equal(res.status, 422);
      assert.equal((await Transaction.findById(u.id)).category, "outros");
      const { events } = (await ana.get(`/api/transactions/${t.id}/history`)).body;
      assert.deepEqual(events[0].changes, [{ field: "category", from: "outros", to: pets.id }]);
    });
  });
});
