import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import { transactionsSupported } from "../src/lib/dbTransaction.js";
import User from "../src/models/User.js";
import Category from "../src/models/Category.js";
import Transaction from "../src/models/Transaction.js";
import TransactionEvent from "../src/models/TransactionEvent.js";
import RefreshSession from "../src/models/RefreshSession.js";
import RateLimitHit from "../src/models/RateLimitHit.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

// Gravações em mais de um passo (alteração + histórico; mover lançamentos + apagar categoria) valem juntas ou
// não valem. Estes testes derrubam a segunda gravação NO MEIO e olham o que sobrou no banco. Precisam de um
// Mongo em réplica (o do docker-compose); em um Mongo solto são pulados.
const uri = testDbUri("atomicity");

describe("atomicidade das gravações (queda no meio)", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp({ ...testEnv, rateLimits: false });
  let supported = false;

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    supported = transactionsSupported();
    await Promise.all([User, Category, Transaction, TransactionEvent, RefreshSession, RateLimitHit].map((m) => m.init()));
  });
  beforeEach(async () => {
    await Promise.all([User, Category, Transaction, TransactionEvent, RefreshSession, RateLimitHit].map((m) => m.deleteMany({})));
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  async function loggedAgent() {
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send(user(1)).expect(201);
    await agent.post("/api/auth/signin").send({ email: user(1).email, password: user(1).password }).expect(200);
    agent.set("X-CSRF-Token", csrfOf(agent));
    return agent;
  }

  // Faz `model[method]` falhar (a "queda" no meio) enquanto `body` roda; restaura sempre.
  async function failing(model, method, body) {
    const original = model[method];
    // Falha só se a chamada estiver dentro da transação: gravar fora dela escaparia do rollback.
    model[method] = (...args) => {
      if (!args.at(-1)?.session) return original.apply(model, args);
      return Promise.reject(new Error("queda no meio da gravação"));
    };
    try {
      return await body();
    } finally {
      model[method] = original;
    }
  }
  const events = (transactionId) => TransactionEvent.find({ transactionId }).sort({ at: 1 }).lean();

  test("o Mongo do teste é uma réplica (senão estes testes não provam nada)", (t) => {
    // No CI a réplica é obrigatória: pular aqui deixaria o CI verde sem provar nada.
    if (!supported && !process.env.CI) return t.skip("Mongo solto: sem transações");
    assert.equal(supported, true, "no CI o Mongo precisa ser uma réplica");
  });

  test("criar: se o histórico falha, o lançamento não fica", async (t) => {
    if (!supported) return t.skip("Mongo solto");
    const agent = await loggedAgent();
    const res = await failing(TransactionEvent, "create", () => agent.post("/api/transactions").send({ type: "output", value: "10", description: "pizza" }));
    assert.equal(res.status, 500);
    assert.equal(await Transaction.countDocuments(), 0);
    assert.equal(await TransactionEvent.countDocuments(), 0);
    // Sem a queda, funciona normalmente.
    await agent.post("/api/transactions").send({ type: "output", value: "10", description: "pizza" }).expect(201);
    assert.equal(await Transaction.countDocuments(), 1);
    assert.equal(await TransactionEvent.countDocuments(), 1);
  });

  test("editar: se o histórico falha, o valor NÃO muda", async (t) => {
    if (!supported) return t.skip("Mongo solto");
    const agent = await loggedAgent();
    const created = (await agent.post("/api/transactions").send({ type: "output", value: "10", description: "pizza" }).expect(201)).body;
    const res = await failing(TransactionEvent, "create", () => agent.put(`/api/transactions/${created.id}`).send({ value: "99", description: "pizza grande", category: created.category }));
    assert.equal(res.status, 500);
    const after = await Transaction.findById(created.id).lean();
    assert.equal(after.valueCents, 1000, "o valor continua o de antes");
    assert.equal(after.description, "pizza");
    assert.equal((await events(created.id)).length, 1, "só o evento 'criado'");
  });

  for (const [name, call, state] of [
    ["excluir", (agent, id) => agent.delete(`/api/transactions/${id}`), (t) => t.deletedAt == null],
    ["arquivar", (agent, id) => agent.post(`/api/transactions/${id}/archive`), (t) => t.archivedAt == null],
  ]) {
    test(`${name}: se o histórico falha, o estado NÃO muda`, async (t) => {
      if (!supported) return t.skip("Mongo solto");
      const agent = await loggedAgent();
      const created = (await agent.post("/api/transactions").send({ type: "input", value: "50", description: "freela" }).expect(201)).body;
      const res = await failing(TransactionEvent, "create", () => call(agent, created.id));
      assert.equal(res.status, 500);
      assert.ok(state(await Transaction.findById(created.id).lean()), "o lançamento continua como estava");
      assert.equal((await events(created.id)).length, 1);
    });
  }

  test("desarquivar e restaurar: se o histórico falha, o estado NÃO muda", async (t) => {
    if (!supported) return t.skip("Mongo solto");
    const agent = await loggedAgent();
    const a = (await agent.post("/api/transactions").send({ type: "input", value: "50", description: "arquivado" }).expect(201)).body;
    const d = (await agent.post("/api/transactions").send({ type: "input", value: "60", description: "excluído" }).expect(201)).body;
    await agent.post(`/api/transactions/${a.id}/archive`).expect(200);
    await agent.delete(`/api/transactions/${d.id}`).expect(204);
    await failing(TransactionEvent, "create", async () => {
      assert.equal((await agent.post(`/api/transactions/${a.id}/unarchive`)).status, 500);
      assert.equal((await agent.post(`/api/transactions/${d.id}/restore`)).status, 500);
    });
    assert.ok((await Transaction.findById(a.id).lean()).archivedAt, "continua arquivado");
    assert.ok((await Transaction.findById(d.id).lean()).deletedAt, "continua excluído");
    assert.equal((await events(a.id)).length, 2, "criado + arquivado");
    assert.equal((await events(d.id)).length, 2, "criado + excluído");
  });

  describe("apagar categoria", () => {
    async function setup() {
      const agent = await loggedAgent();
      const pets = (await agent.post("/api/categories").send({ type: "output", name: "Pets" }).expect(201)).body;
      const ids = [];
      for (const d of ["ração", "vet", "brinquedo"]) {
        ids.push((await agent.post("/api/transactions").send({ type: "output", value: "10", description: d, category: pets.id }).expect(201)).body.id);
      }
      const usersBefore = await User.findOne().lean();
      return { agent, pets, ids, countBefore: usersBefore.categoryCount.output };
    }
    async function assertUntouched({ pets, ids, countBefore }) {
      assert.ok(await Category.findById(pets.id), "a categoria continua existindo");
      assert.equal(await Transaction.countDocuments({ category: pets.id }), 3, "os lançamentos continuam na categoria");
      assert.equal(await TransactionEvent.countDocuments({ action: "edited" }), 0, "nenhum evento de edição ficou");
      assert.equal((await User.findOne().lean()).categoryCount.output, countBefore, "o contador não mudou");
      for (const id of ids) assert.equal((await events(id)).length, 1);
    }

    test("falha ao apagar a categoria depois de mover os lançamentos: tudo volta", async (t) => {
      if (!supported) return t.skip("Mongo solto");
      const ctx = await setup();
      const res = await failing(Category, "deleteOne", () => ctx.agent.delete(`/api/categories/${ctx.pets.id}?moveTo=outros`));
      assert.equal(res.status, 500);
      await assertUntouched(ctx);
    });

    test("falha ao gravar o histórico depois de mover os lançamentos: tudo volta", async (t) => {
      if (!supported) return t.skip("Mongo solto");
      const ctx = await setup();
      const res = await failing(TransactionEvent, "insertMany", () => ctx.agent.delete(`/api/categories/${ctx.pets.id}?moveTo=outros`));
      assert.equal(res.status, 500);
      await assertUntouched(ctx);
    });

    test("falha ao acertar o contador: tudo volta", async (t) => {
      if (!supported) return t.skip("Mongo solto");
      const ctx = await setup();
      const res = await failing(User, "updateOne", () => ctx.agent.delete(`/api/categories/${ctx.pets.id}?moveTo=outros`));
      assert.equal(res.status, 500);
      await assertUntouched(ctx);
    });

    test("criar lançamento e apagar a categoria ao mesmo tempo: nunca sobra lançamento órfão", async (t) => {
      if (!supported) return t.skip("Mongo solto");
      const agent = await loggedAgent();
      for (let round = 0; round < 10; round++) {
        const cat = (await agent.post("/api/categories").send({ type: "output", name: `Corrida${round}` }).expect(201)).body;
        await Promise.all([
          agent.post("/api/transactions").send({ type: "output", value: "5", description: "corrida", category: cat.id }),
          agent.delete(`/api/categories/${cat.id}?moveTo=outros`),
        ]);
        const ids = (await Category.find().lean()).map((c) => String(c._id));
        const orphans = await Transaction.find({ category: { $regex: /^[0-9a-f]{24}$/, $nin: ids } }).lean();
        assert.equal(orphans.length, 0, `rodada ${round}: lançamento apontando para categoria apagada`);
      }
    });

    test("sem queda, apaga: lançamentos movidos, um evento por lançamento e contador acertado", async () => {
      const ctx = await setup();
      const res = await ctx.agent.delete(`/api/categories/${ctx.pets.id}?moveTo=outros`).expect(200);
      assert.equal(res.body.moved, 3);
      assert.equal(await Category.countDocuments(), 0);
      assert.equal(await Transaction.countDocuments({ category: "outros" }), 3);
      assert.equal(await TransactionEvent.countDocuments({ action: "edited" }), 3);
      assert.equal((await User.findOne().lean()).categoryCount.output, ctx.countBefore - 1);
    });
  });
});
