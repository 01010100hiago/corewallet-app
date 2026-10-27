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
import { settleCategory } from "../src/services/transactionService.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("catmanage");

describe("gerenciar categorias: uso, renomear e apagar", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User, Transaction, TransactionEvent, Category, RefreshSession].map((m) => m.init()));
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
  const bare = (agent) => {
    const a = request.agent(app);
    a.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
    return a;
  };
  const newCat = async (agent, name, type = "output") => (await agent.post("/api/categories").send({ type, name }).expect(201)).body;
  const addTx = (agent, body) => agent.post("/api/transactions").send({ type: "output", value: "10", description: "Teste ok", ...body });

  describe("uso por categoria", () => {
    test("conta lançamentos ativos, arquivados e excluídos por categoria, e só os da pessoa", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const pets = await newCat(ana.agent, "Pets");
      const a = (await addTx(ana.agent, { category: pets.id }).expect(201)).body;
      await addTx(ana.agent, { category: pets.id }).expect(201);
      const c = (await addTx(ana.agent, { category: pets.id }).expect(201)).body;
      await addTx(ana.agent, { category: "mercado" }).expect(201);
      await addTx(ana.agent, { type: "input", category: "salario" }).expect(201);
      await ana.agent.post(`/api/transactions/${a.id}/archive`).expect(200);
      await ana.agent.delete(`/api/transactions/${c.id}`).expect(204);
      await addTx(bia.agent, { category: "mercado" }).expect(201);

      const { usage } = (await ana.agent.get("/api/categories/usage").expect(200)).body;
      const get = (type, category) => usage.find((u) => u.type === type && u.category === category)?.count;
      assert.equal(get("output", pets.id), 3, "os 3: o arquivado e o excluído também serão movidos ao apagar a categoria");
      assert.equal(get("output", "mercado"), 1, "o da Bia não entra");
      assert.equal(get("input", "salario"), 1);
    });

    test("lançamento antigo, sem categoria, conta como 'outros'", async () => {
      const { agent, userId } = await loggedAgent();
      await Transaction.collection.insertOne({ userId: new mongoose.Types.ObjectId(userId), type: "output", valueCents: 100, description: "legado", createdAt: new Date() });
      const { usage } = (await agent.get("/api/categories/usage")).body;
      assert.deepEqual(usage, [{ type: "output", category: "outros", count: 1 }]);
    });

    test("exige login", async () => {
      await request(app).get("/api/categories/usage").expect(401);
    });
  });

  describe("renomear", () => {
    test("muda o nome e todos os lançamentos passam a mostrá-lo (o id é o mesmo)", async () => {
      const { agent } = await loggedAgent();
      const pets = await newCat(agent, "Pets");
      await addTx(agent, { category: pets.id }).expect(201);
      const res = await agent.patch(`/api/categories/${pets.id}`).send({ name: "  Animais   de estimação " }).expect(200);
      assert.deepEqual(res.body, { id: pets.id, type: "output", name: "Animais de estimação" });
      assert.deepEqual((await agent.get("/api/categories")).body.categories, [res.body]);
      const list = (await agent.get("/api/transactions")).body;
      assert.equal(list.transactions[0].category, pets.id);
      assert.deepEqual(list.categories, [res.body]);
    });

    test("trocar só maiúsculas e acentos da própria categoria é permitido", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "cafe");
      assert.equal((await agent.patch(`/api/categories/${c.id}`).send({ name: "Café" }).expect(200)).body.name, "Café");
    });

    test("nome já usado por outra categoria sua, ou por uma padrão do mesmo tipo, é 409", async () => {
      const { agent } = await loggedAgent();
      await newCat(agent, "Pets");
      const other = await newCat(agent, "Viagens");
      for (const name of ["pets", "PETS", "Supermercado", "mercado", "Contas e serviços", "Outras despesas"]) {
        const res = await agent.patch(`/api/categories/${other.id}`).send({ name });
        assert.equal(res.status, 409, name);
        assert.ok(res.body.errors.name, name);
      }
      assert.equal((await Category.findById(other.id)).name, "Viagens");
      // Nome de categoria padrão de OUTRO tipo não atrapalha ("Salário" só existe em receitas).
      assert.equal((await agent.patch(`/api/categories/${other.id}`).send({ name: "Salário" }).expect(200)).body.name, "Salário");
    });

    test("nome inválido é 422 e nada muda", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      for (const body of [{ name: "a" }, { name: "x".repeat(31) }, { name: "<b>" }, { name: { $ne: 1 } }, { name: ["Pets"] }, {}, { type: "input" }]) {
        assert.equal((await agent.patch(`/api/categories/${c.id}`).send(body)).status, 422, JSON.stringify(body));
      }
      assert.equal((await Category.findById(c.id)).name, "Pets");
    });

    test("só muda o nome: tipo e dono ignoram o que vier no corpo", async () => {
      const { agent, userId } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await agent.patch(`/api/categories/${c.id}`).send({ name: "Bichos", type: "input", userId: String(new mongoose.Types.ObjectId()) }).expect(200);
      const saved = await Category.findById(c.id);
      assert.equal(saved.type, "output");
      assert.equal(String(saved.userId), userId);
    });

    test("categoria de outra pessoa, inexistente, id inválido ou de fábrica: 404", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const pets = await newCat(ana.agent, "Pets");
      await bia.agent.patch(`/api/categories/${pets.id}`).send({ name: "Roubada" }).expect(404);
      await ana.agent.patch(`/api/categories/${new mongoose.Types.ObjectId()}`).send({ name: "Fantasma" }).expect(404);
      await ana.agent.patch("/api/categories/lixo").send({ name: "Lixo ok" }).expect(404);
      await ana.agent.patch("/api/categories/mercado").send({ name: "Feira" }).expect(404);
      assert.equal((await Category.findById(pets.id)).name, "Pets");
    });

    test("exige login e o cabeçalho CSRF", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await request(app).patch(`/api/categories/${c.id}`).send({ name: "Outro" }).expect(401);
      await bare(agent).patch(`/api/categories/${c.id}`).send({ name: "Outro" }).expect(403);
      assert.equal((await Category.findById(c.id)).name, "Pets");
    });
  });

  describe("apagar", () => {
    test("sem lançamentos apaga direto e libera a vaga do limite de 30", async () => {
      const { agent, userId } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      assert.equal((await User.findById(userId)).categoryCount.output, 1);
      const res = await agent.delete(`/api/categories/${c.id}`).expect(200);
      assert.deepEqual(res.body, { moved: 0 });
      assert.equal(await Category.countDocuments(), 0);
      assert.equal((await User.findById(userId)).categoryCount.output, 0);
      assert.deepEqual((await agent.get("/api/categories")).body.categories, []);
    });

    test("com lançamentos exige o destino (409 com o aviso) e não apaga nada sem ele", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await addTx(agent, { category: c.id }).expect(201);
      await addTx(agent, { category: c.id }).expect(201);
      const res = await agent.delete(`/api/categories/${c.id}`);
      assert.equal(res.status, 409);
      assert.match(res.body.message, /2 lançamentos/);
      assert.ok(res.body.errors.moveTo);
      assert.ok(await Category.findById(c.id), "a categoria continua");
      assert.equal(await Transaction.countDocuments({ category: c.id }), 2);
    });

    test("move todos para o destino (padrão ou outra sua), de qualquer status, e registra no histórico", async () => {
      const { agent } = await loggedAgent();
      const pets = await newCat(agent, "Pets");
      const viagens = await newCat(agent, "Viagens");
      const a = (await addTx(agent, { category: pets.id, description: "Ração" }).expect(201)).body;
      const b = (await addTx(agent, { category: pets.id, description: "Banho" }).expect(201)).body;
      const gone = (await addTx(agent, { category: pets.id, description: "Excluído" }).expect(201)).body;
      await agent.post(`/api/transactions/${b.id}/archive`).expect(200);
      await agent.delete(`/api/transactions/${gone.id}`).expect(204);

      const res = await agent.delete(`/api/categories/${pets.id}?moveTo=${viagens.id}`).expect(200);
      assert.deepEqual(res.body, { moved: 3 });
      assert.equal(await Category.findById(pets.id), null);
      assert.equal(await Transaction.countDocuments({ category: pets.id }), 0);
      assert.equal(await Transaction.countDocuments({ category: viagens.id }), 3, "inclui o arquivado e o excluído");

      const { events } = (await agent.get(`/api/transactions/${a.id}/history`)).body;
      assert.equal(events[0].action, "edited");
      assert.deepEqual(events[0].changes, [{ field: "category", from: pets.id, to: viagens.id }]);
      assert.equal(events[0].snapshot.category, viagens.id);
      assert.equal(events[0].snapshot.description, "Ração");
      assert.equal(events[0].snapshot.value, 1000);
    });

    test("pode mover para uma categoria padrão do mesmo tipo", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await addTx(agent, { category: c.id }).expect(201);
      await agent.delete(`/api/categories/${c.id}?moveTo=outros`).expect(200);
      assert.equal((await agent.get("/api/transactions")).body.transactions[0].category, "outros");
    });

    test("destino inválido (de outro tipo, de outra pessoa, a própria, inexistente, lixo) é 422 e nada muda", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const pets = await newCat(ana.agent, "Pets");
      const bicos = await newCat(ana.agent, "Bicos", "input");
      const alheia = await newCat(bia.agent, "Alheia");
      await addTx(ana.agent, { category: pets.id }).expect(201);
      for (const moveTo of [bicos.id, "salario", alheia.id, pets.id, String(new mongoose.Types.ObjectId()), "lixo", "a".repeat(24)]) {
        const res = await ana.agent.delete(`/api/categories/${pets.id}?moveTo=${moveTo}`);
        assert.equal(res.status, 422, moveTo);
        assert.ok(res.body.errors.moveTo, moveTo);
      }
      assert.ok(await Category.findById(pets.id));
      assert.equal(await Transaction.countDocuments({ category: pets.id }), 1);
    });

    test("só o dono apaga; id inválido, inexistente ou de fábrica é 404", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const pets = await newCat(ana.agent, "Pets");
      await bia.agent.delete(`/api/categories/${pets.id}`).expect(404);
      await ana.agent.delete("/api/categories/lixo").expect(404);
      await ana.agent.delete("/api/categories/mercado").expect(404);
      await ana.agent.delete(`/api/categories/${new mongoose.Types.ObjectId()}`).expect(404);
      assert.ok(await Category.findById(pets.id));
    });

    test("apagar duas vezes: a segunda é 404", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await agent.delete(`/api/categories/${c.id}`).expect(200);
      await agent.delete(`/api/categories/${c.id}`).expect(404);
    });

    test("lançamento criado com a categoria no meio da exclusão também vai para o destino", async () => {
      const { agent, userId } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      // Simula a corrida: um lançamento com a categoria aparece sem passar pela contagem inicial.
      // (Inserido direto no banco logo antes, a contagem vê, então testamos o caminho com destino.)
      await Transaction.collection.insertOne({
        userId: new mongoose.Types.ObjectId(userId),
        type: "output",
        valueCents: 500,
        description: "Chegou tarde",
        category: c.id,
        createdAt: new Date(),
        deletedAt: null,
        archivedAt: null,
      });
      const res = await agent.delete(`/api/categories/${c.id}?moveTo=outros`).expect(200);
      assert.equal(res.body.moved, 1);
      assert.equal(await Transaction.countDocuments({ category: c.id }), 0);
    });

    test("só mexe nos lançamentos do dono, mesmo que dados de outra pessoa apontem para o mesmo id", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const pets = await newCat(ana.agent, "Pets");
      await addTx(ana.agent, { category: pets.id, description: "Da Ana" }).expect(201);
      // Estado que a API nunca produz (outra pessoa com o id de categoria da Ana): a exclusão não pode tocar nele.
      const alien = await Transaction.collection.insertOne({
        userId: new mongoose.Types.ObjectId(bia.userId),
        type: "output",
        valueCents: 900,
        description: "Da Bia",
        category: pets.id,
        createdAt: new Date(),
        deletedAt: null,
        archivedAt: null,
      });
      const res = await ana.agent.delete(`/api/categories/${pets.id}?moveTo=outros`).expect(200);
      assert.equal(res.body.moved, 1);
      assert.equal((await Transaction.findById(alien.insertedId)).category, pets.id, "o lançamento da Bia continua como estava");
      assert.equal(await TransactionEvent.countDocuments({ transactionId: alien.insertedId }), 0, "e sem evento nenhum");
    });

    test("depois de apagar dá para criar outra com o mesmo nome (novo id) e a contagem do limite fecha", async () => {
      const { agent, userId } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await agent.delete(`/api/categories/${c.id}`).expect(200);
      const again = await newCat(agent, "Pets");
      assert.notEqual(again.id, c.id);
      assert.equal((await User.findById(userId)).categoryCount.output, 1);
    });

    test("exige login e o cabeçalho CSRF", async () => {
      const { agent } = await loggedAgent();
      const c = await newCat(agent, "Pets");
      await request(app).delete(`/api/categories/${c.id}`).expect(401);
      await bare(agent).delete(`/api/categories/${c.id}`).expect(403);
      assert.ok(await Category.findById(c.id));
    });
  });

  describe("categoria apagada no meio de uma gravação", () => {
    test("settleCategory manda para 'Outros' o lançamento cuja categoria já não existe, e deixa os demais quietos", async () => {
      const { agent, userId } = await loggedAgent(1);
      const pets = await newCat(agent, "Pets");
      const mk = (category) => Transaction.create({ userId, type: "output", valueCents: 1000, description: "Teste ok", category });
      const alive = await mk(pets.id);
      assert.equal((await settleCategory(alive)).category, pets.id, "a categoria existe: nada muda");
      const builtIn = await mk("mercado");
      assert.equal((await settleCategory(builtIn)).category, "mercado");
      await agent.delete(`/api/categories/${pets.id}?moveTo=outros`).expect(200);
      // Simula o lançamento que chegou depois da varredura da exclusão, ainda com o id antigo.
      const orphan = await mk(pets.id);
      assert.equal((await settleCategory(orphan)).category, "outros");
      assert.equal((await Transaction.findById(orphan._id)).category, "outros", "gravado no banco, não só na resposta");
    });
  });
});
