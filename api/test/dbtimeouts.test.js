import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb, pingDb } from "../src/config/database.js";
import { isDbUnavailable } from "../src/lib/dbErrors.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("dbtimeouts");

test("isDbUnavailable reconhece banco fora do ar e consulta que estourou o tempo", () => {
  assert.equal(isDbUnavailable({ name: "MongooseServerSelectionError" }), true);
  assert.equal(isDbUnavailable({ name: "MongoNetworkTimeoutError" }), true);
  assert.equal(isDbUnavailable({ name: "MongoNotConnectedError" }), true);
  assert.equal(isDbUnavailable({ name: "MongoServerError", code: 50 }), true);
  assert.equal(isDbUnavailable({ name: "MongooseError", message: "Operation `users.findOne()` buffering timed out after 10000ms" }), true);
});

test("isDbUnavailable não confunde bug ou erro de validação com banco indisponível", () => {
  assert.equal(isDbUnavailable(undefined), false);
  assert.equal(isDbUnavailable(new TypeError("x is not a function")), false);
  assert.equal(isDbUnavailable({ name: "MongoServerError", code: 11000 }), false);
  assert.equal(isDbUnavailable({ name: "MongooseError", message: "outra coisa" }), false);
});

describe("banco lento ou fora do ar", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await mongoose.model("User").init();
  });
  after(async () => {
    if (!mongoose.connection.readyState) await connectDb(uri);
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  test("com o banco respondendo, a saúde confere com um ping e dá 200", async () => {
    assert.equal(await pingDb(), true);
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok", db: "up" });
  });

  test("consulta que passa do limite do Mongo vira 503 com Retry-After, não 500", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send(user(1)).expect(201);
    await agent.post("/api/auth/signin").send({ email: user(1).email, password: user(1).password }).expect(200);
    agent.set("X-CSRF-Token", csrfOf(agent));

    // Perde a conexão e encurta a espera do Mongoose para o teste não demorar os 10 s do padrão.
    mongoose.set("bufferTimeoutMS", 300);
    await mongoose.disconnect();
    try {
      const res = await agent.get("/api/auth/me");
      assert.equal(res.status, 503);
      assert.equal(res.headers["retry-after"], "3");
      assert.match(res.body.message, /indisponível/i);
      assert.equal((await request(app).get("/api/health")).status, 503);
    } finally {
      mongoose.set("bufferTimeoutMS", 10_000);
      await connectDb(uri);
    }
  });
});
