import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import RateLimitHit from "../src/models/RateLimitHit.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { cookieNames } from "../src/controllers/cookies.js";
import { testEnv, user, testDbUri } from "../support/helpers.js";

const uri = testDbUri("hostcookies");
const names = cookieNames(true);
const jar = (res) => Object.fromEntries((res.headers["set-cookie"] ?? []).map((c) => [c.split("=")[0], c]));
const valueOf = (res, name) => jar(res)[name]?.split(";")[0].slice(name.length + 1);

describe("nomes dos cookies", () => {
  test("com HTTPS levam __Host-; sem HTTPS ficam como eram", () => {
    assert.deepEqual(cookieNames(true), { session: "__Host-cw_session", refresh: "__Host-cw_refresh", csrf: "__Host-cw_csrf", nonce: "__Host-cw_gnonce" });
    assert.deepEqual(cookieNames(false), { session: "cw_session", refresh: "cw_refresh", csrf: "cw_csrf", nonce: "cw_gnonce" });
  });
});

describe("cookies __Host- (servindo por HTTPS)", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp({ ...testEnv, cookieSecure: true });

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User, RefreshSession].map((m) => m.init()));
  });
  beforeEach(async () => {
    await Promise.all([User, RefreshSession, RateLimitHit].map((m) => m.deleteMany({})));
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  async function login() {
    await request(app).post("/api/auth/signup").send(user(1)).expect(201);
    return request(app).post("/api/auth/signin").send({ email: user(1).email, password: user(1).password }).expect(200);
  }
  const cookieHeader = (res) => Object.keys(names).map((k) => k).filter((k) => k !== "nonce").map((k) => `${names[k]}=${valueOf(res, names[k])}`).join("; ");

  test("os três cookies da sessão: prefixo, Secure, Path=/ e sem Domain (exigências do __Host-)", async () => {
    const res = await login();
    const cookies = jar(res);
    assert.deepEqual(Object.keys(cookies).sort(), [names.csrf, names.refresh, names.session].sort(), "só os nomes com prefixo");
    for (const c of Object.values(cookies)) {
      assert.match(c, /; Secure/i);
      assert.match(c, /; Path=\/(;|$)/);
      assert.doesNotMatch(c, /Domain=/i);
    }
    assert.match(cookies[names.session], /HttpOnly/i);
    assert.match(cookies[names.refresh], /HttpOnly/i);
    assert.match(cookies[names.refresh], /SameSite=Strict/i);
    assert.doesNotMatch(cookies[names.csrf], /HttpOnly/i, "o front precisa ler o CSRF");
  });

  test("a sessão com os cookies prefixados funciona (me, renovação com CSRF)", async () => {
    const res = await login();
    const cookie = cookieHeader(res);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
    const csrf = valueOf(res, names.csrf);
    const out = await request(app).post("/api/auth/refresh").set("Cookie", cookie).set("X-CSRF-Token", csrf).expect(200);
    assert.ok(valueOf(out, names.session));
    assert.ok(valueOf(out, names.refresh));
  });

  test("cookie plantado SEM prefixo (por outro subdomínio, por exemplo) não vale como sessão nem como CSRF", async () => {
    const res = await login();
    // O invasor planta cookies com os nomes antigos, com tokens que ele mesmo obteve em uma conta dele.
    const planted = `cw_session=${valueOf(res, names.session)}; cw_refresh=${valueOf(res, names.refresh)}; cw_csrf=${valueOf(res, names.csrf)}`;
    await request(app).get("/api/auth/me").set("Cookie", planted).expect(401);
    await request(app).post("/api/auth/refresh").set("Cookie", planted).expect(401);
    // Sessão real + CSRF só no nome antigo: recusado.
    const mixed = `${names.session}=${valueOf(res, names.session)}; cw_csrf=${valueOf(res, names.csrf)}`;
    await request(app).post("/api/auth/logout-all").set("Cookie", mixed).set("X-CSRF-Token", valueOf(res, names.csrf)).expect(403);
  });

  test("sair apaga os cookies com prefixo e também os antigos", async () => {
    const res = await login();
    const out = await request(app).post("/api/auth/logout").set("Cookie", cookieHeader(res)).set("X-CSRF-Token", valueOf(res, names.csrf)).expect(204);
    const cleared = jar(out);
    for (const name of [names.session, names.refresh, names.csrf, "cw_session", "cw_refresh", "cw_csrf"]) {
      assert.ok(cleared[name], `${name} apagado`);
      assert.match(cleared[name], /Expires=Thu, 01 Jan 1970/);
    }
  });
});
