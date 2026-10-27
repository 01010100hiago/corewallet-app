import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import Transaction from "../src/models/Transaction.js";
import { listByUser } from "../src/services/transactionService.js";
import { testEnv, user } from "../support/helpers.js";

const uri = process.env.TEST_DATABASE_URI;

// Estes testes usam um Mongo de verdade. Sem TEST_DATABASE_URI eles são pulados.
describe("API com banco", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    // Os testes apagam o banco inteiro: só rodam num banco cujo nome termina em _test.
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await User.init();
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({})]);
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  async function loggedAgent(n = 1) {
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send(user(n)).expect(201);
    await agent.post("/api/auth/signin").send({ email: user(n).email, password: user(n).password }).expect(200);
    return agent;
  }

  describe("cadastro", () => {
    test("cria o usuário, guarda só o hash e não devolve a senha", async () => {
      const res = await request(app).post("/api/auth/signup").send(user());
      assert.equal(res.status, 201);
      assert.deepEqual(Object.keys(res.body).sort(), ["email", "id", "name"]);

      const saved = await User.findOne({ email: user().email }).select("+passwordHash");
      assert.match(saved.passwordHash, /^\$2[aby]\$12\$/);
      assert.notEqual(saved.passwordHash, user().password);
    });

    test("normaliza email e nome", async () => {
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ name: "ana lima", email: " ANA@Exemplo.com ", password: "cavalo-azul-77" });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, "Ana Lima");
      assert.equal(res.body.email, "ana@exemplo.com");
    });

    test("email repetido devolve 409, mesmo com maiúsculas diferentes", async () => {
      await request(app).post("/api/auth/signup").send(user()).expect(201);
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ ...user(), email: user().email.toUpperCase() });
      assert.equal(res.status, 409);
    });

    test("duas requisições simultâneas com o mesmo email: uma cria, a outra 409", async () => {
      const results = await Promise.all([
        request(app).post("/api/auth/signup").send(user()),
        request(app).post("/api/auth/signup").send(user()),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await User.countDocuments(), 1);
    });

    test("dados inválidos devolvem 422 com o erro de cada campo", async () => {
      const res = await request(app).post("/api/auth/signup").send({ name: "A", email: "x", password: "123" });
      assert.equal(res.status, 422);
      assert.deepEqual(Object.keys(res.body.errors).sort(), ["email", "name", "password"]);
    });

    test("ignora campos extras como _id e passwordHash", async () => {
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ ...user(), _id: "000000000000000000000001", passwordHash: "x" });
      assert.equal(res.status, 201);
      assert.notEqual(res.body.id, "000000000000000000000001");
      const saved = await User.findOne({ email: user().email }).select("+passwordHash");
      assert.notEqual(saved.passwordHash, "x");
    });
  });

  describe("login", () => {
    test("define cookie httpOnly com SameSite=Lax e não manda o token no corpo", async () => {
      await request(app).post("/api/auth/signup").send(user()).expect(201);
      const res = await request(app).post("/api/auth/signin").send({ email: user().email, password: user().password });
      assert.equal(res.status, 200);
      assert.equal(res.body.token, undefined);

      const cookie = res.headers["set-cookie"].find((c) => c.startsWith("cw_session="));
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Path=\/api/);
      assert.match(cookie, /Max-Age=3600/);
    });

    test("o login devolve quando a sessão começou e quando vence", async () => {
      await request(app).post("/api/auth/signup").send(user()).expect(201);
      const res = await request(app).post("/api/auth/signin").send({ email: user().email, password: user().password });
      assert.ok(res.body.session.startedAt);
      assert.equal(new Date(res.body.session.expiresAt) - new Date(res.body.session.startedAt), 3600 * 1000);
    });

    test("cadastro recusa senha comum", async () => {
      const res = await request(app).post("/api/auth/signup").send({ ...user(), password: "senha1234" });
      assert.equal(res.status, 422);
      assert.match(res.body.errors.password, /comum/);
    });

    test("senha errada e email inexistente dão a mesma resposta", async () => {
      await request(app).post("/api/auth/signup").send(user()).expect(201);
      const wrongPass = await request(app).post("/api/auth/signin").send({ email: user().email, password: "outra-senha-aqui" });
      const noUser = await request(app).post("/api/auth/signin").send({ email: "ninguem@exemplo.com", password: "outra-senha-aqui" });
      assert.equal(wrongPass.status, 401);
      assert.equal(noUser.status, 401);
      assert.deepEqual(wrongPass.body, noUser.body);
      assert.equal(wrongPass.headers["set-cookie"], undefined);
    });

    test("recusa objetos no lugar de texto (NoSQL injection)", async () => {
      await request(app).post("/api/auth/signup").send(user()).expect(201);
      const res = await request(app).post("/api/auth/signin").send({ email: { $gt: "" }, password: { $ne: "" } });
      assert.equal(res.status, 422);
      assert.equal(res.headers["set-cookie"], undefined);
    });

    test("/me devolve o usuário logado e logout apaga o cookie", async () => {
      const agent = await loggedAgent();
      const me = await agent.get("/api/auth/me").expect(200);
      assert.equal(me.body.email, user().email);
      const { startedAt, expiresAt } = me.body.session;
      assert.equal(new Date(expiresAt) - new Date(startedAt), 3600 * 1000);
      assert.ok(new Date(expiresAt) > new Date());
      assert.ok(Math.abs(new Date(me.body.session.serverTime) - Date.now()) < 5000);

      const out = await agent.post("/api/auth/logout").expect(204);
      assert.match(out.headers["set-cookie"][0], /cw_session=;/);
      await agent.get("/api/auth/me").expect(401);
    });
  });

  describe("token", () => {
    async function savedUserId() {
      await request(app).post("/api/auth/signup").send(user()).expect(201);
      return String((await User.findOne({ email: user().email }))._id);
    }
    const withCookie = (token) => request(app).get("/api/auth/me").set("Cookie", `cw_session=${token}`);

    test("aceita token válido assinado pela API", async () => {
      const id = await savedUserId();
      const token = jwt.sign({ sub: id }, testEnv.jwtSecret, { expiresIn: 60 });
      await withCookie(token).expect(200);
    });

    test("recusa token vencido, de outro segredo, sem assinatura e lixo", async () => {
      const id = await savedUserId();
      const expired = jwt.sign({ sub: id }, testEnv.jwtSecret, { expiresIn: -10 });
      const otherSecret = jwt.sign({ sub: id }, "outro-segredo-qualquer-com-32-caracteres", { expiresIn: 60 });
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id })).toString("base64url")}.`;
      for (const token of [expired, otherSecret, none, "lixo", ""]) {
        await withCookie(token).expect(401);
      }
    });

    test("recusa token de usuário que foi apagado", async () => {
      const id = await savedUserId();
      const token = jwt.sign({ sub: id }, testEnv.jwtSecret, { expiresIn: 60 });
      await User.deleteMany({});
      await withCookie(token).expect(401);
    });

    test("recusa sub que não é um ObjectId", async () => {
      const token = jwt.sign({ sub: { $ne: null } }, testEnv.jwtSecret, { expiresIn: 60 });
      await withCookie(token).expect(401);
    });
  });

  describe("lançamentos", () => {
    test("cria entrada em reais e devolve em centavos", async () => {
      const agent = await loggedAgent();
      const res = await agent.post("/api/transactions").send({ type: "input", value: "1.234,56", description: "Salário" });
      assert.equal(res.status, 201);
      assert.equal(res.body.value, 123456);
      assert.equal(res.body.type, "input");
      assert.ok(res.body.createdAt);
      assert.equal(res.body.userId, undefined);
    });

    test("lista do mais novo para o mais antigo, com o saldo", async () => {
      const agent = await loggedAgent();
      await agent.post("/api/transactions").send({ type: "input", value: "100", description: "primeiro" });
      await agent.post("/api/transactions").send({ type: "output", value: "5,50", description: "segundo" });
      await agent.post("/api/transactions").send({ type: "output", value: "0,10", description: "terceiro" });
      const res = await agent.get("/api/transactions").expect(200);
      assert.deepEqual(res.body.transactions.map((t) => t.description), ["terceiro", "segundo", "primeiro"]);
      assert.equal(res.body.balance, 10000 - 550 - 10);
      assert.equal(res.body.truncated, false);
    });

    test("saldo vazio é zero", async () => {
      const agent = await loggedAgent();
      const res = await agent.get("/api/transactions").expect(200);
      assert.deepEqual(res.body, { balance: 0, truncated: false, transactions: [] });
    });

    test("lista cortada pelo limite continua com o saldo de todos os lançamentos", async () => {
      const agent = await loggedAgent();
      const userId = (await agent.get("/api/auth/me")).body.id;
      for (let i = 1; i <= 5; i++) {
        await agent.post("/api/transactions").send({ type: "input", value: `${i}`, description: `entrada ${i}` });
      }
      await agent.post("/api/transactions").send({ type: "output", value: "1", description: "saída" });
      const out = await listByUser(userId, 2);
      assert.equal(out.transactions.length, 2);
      assert.equal(out.truncated, true);
      assert.equal(out.balance, (1 + 2 + 3 + 4 + 5 - 1) * 100);
    });

    test("um usuário nunca vê os lançamentos de outro", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      await ana.post("/api/transactions").send({ type: "input", value: "100", description: "da Ana" }).expect(201);
      await bia.post("/api/transactions").send({ type: "input", value: "50", description: "da Bia" }).expect(201);

      const anaList = (await ana.get("/api/transactions").expect(200)).body;
      const biaList = (await bia.get("/api/transactions").expect(200)).body;
      assert.deepEqual(anaList.transactions.map((t) => t.description), ["da Ana"]);
      assert.deepEqual(biaList.transactions.map((t) => t.description), ["da Bia"]);
      assert.equal(anaList.balance, 10000);
      assert.equal(biaList.balance, 5000);
    });

    test("não aceita userId nem createdAt vindos do cliente", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const biaId = (await bia.get("/api/auth/me")).body.id;
      const res = await ana.post("/api/transactions").send({
        type: "input", value: "10", description: "tentativa", userId: biaId, createdAt: "2000-01-01",
      });
      assert.equal(res.status, 201);
      assert.equal((await bia.get("/api/transactions")).body.transactions.length, 0);
      assert.equal((await ana.get("/api/transactions")).body.transactions.length, 1);
      assert.ok(new Date(res.body.createdAt).getFullYear() >= 2026);
    });

    test("recusa senha com mais de 72 bytes mesmo com poucos caracteres", async () => {
      const res = await request(app).post("/api/auth/signup").send({ ...user(), password: "é".repeat(40) });
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.password);
    });

    test("recusa valor inválido, tipo desconhecido e objetos", async () => {
      const agent = await loggedAgent();
      const bad = [
        { type: "input", value: "0", description: "zero" },
        { type: "input", value: "-10", description: "negativo" },
        { type: "input", value: "abc", description: "texto" },
        { type: "transfer", value: "10", description: "tipo ruim" },
        { type: "input", value: { $gt: 0 }, description: "objeto" },
        { type: { $ne: "x" }, value: "10", description: "tipo objeto" },
        { type: "input", value: "10", description: "ab" },
      ];
      for (const body of bad) {
        const res = await agent.post("/api/transactions").send(body);
        assert.equal(res.status, 422, JSON.stringify(body));
      }
      assert.equal(await Transaction.countDocuments(), 0);
    });
  });
});
