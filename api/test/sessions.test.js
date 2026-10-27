import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import Transaction from "../src/models/Transaction.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { describeDevice, maskIp } from "../src/lib/device.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("sessions");

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const cookieValue = (res, name) => {
  const line = res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`));
  return line?.split(";")[0].slice(name.length + 1);
};
const rawCookie = (res, name) => res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`));

describe("aparelhos de teste: descrição", () => {
  test("reconhece navegador e sistema, e não quebra com texto estranho", () => {
    assert.deepEqual(describeDevice(CHROME_MAC), { label: "Chrome no macOS", kind: "computer" });
    assert.deepEqual(describeDevice(SAFARI_IPHONE), { label: "Safari no iOS", kind: "phone" });
    assert.equal(describeDevice("").label, "Aparelho desconhecido");
    assert.equal(describeDevice(undefined).label, "Aparelho desconhecido");
    assert.equal(describeDevice("curl/8.0").label, "Aparelho desconhecido");
  });

  test("o IP aparece só pela metade", () => {
    assert.equal(maskIp("189.12.34.56"), "189.12.•.•");
    assert.equal(maskIp("::ffff:10.0.0.7"), "10.0.•.•");
    assert.match(maskIp("2804:14d:1:2::3"), /•$/);
    assert.ok(!maskIp("2804:14d:1:2::3").includes("2::3"));
    assert.equal(maskIp(""), "");
  });
});

describe("sessões, CSRF e limites", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  const app = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await User.init();
    await RefreshSession.init();
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), RefreshSession.deleteMany({})]);
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  async function signup(n = 1) {
    await request(app).post("/api/auth/signup").send(user(n)).expect(201);
  }
  // Entra como um aparelho; devolve o agente (com CSRF) e a resposta do login.
  async function login(n = 1, ua = CHROME_MAC, target = app) {
    const agent = request.agent(target);
    agent.set("User-Agent", ua);
    const res = await agent.post("/api/auth/signin").send({ email: user(n).email, password: user(n).password }).expect(200);
    agent.set("X-CSRF-Token", csrfOf(agent));
    return { agent, res };
  }

  describe("cookies", () => {
    test("acesso, renovação e CSRF têm os atributos certos", async () => {
      await signup();
      const { res } = await login();
      const refresh = rawCookie(res, "cw_refresh");
      assert.match(refresh, /HttpOnly/i);
      assert.match(refresh, /SameSite=Strict/i);
      assert.match(refresh, /Path=\/api\/auth(;|$)/);
      assert.match(refresh, /Max-Age=259(1999|2000)/);

      const csrf = rawCookie(res, "cw_csrf");
      assert.doesNotMatch(csrf, /HttpOnly/i, "o JavaScript do site precisa ler o token CSRF");
      assert.match(csrf, /Path=\//);
      assert.doesNotMatch(JSON.stringify(res.body), /cw_refresh|refresh/i);
    });

    test("o banco guarda só o hash do token de renovação", async () => {
      await signup();
      const { res } = await login();
      const token = cookieValue(res, "cw_refresh");
      const saved = await RefreshSession.findOne();
      assert.notEqual(saved.tokenHash, token);
      assert.match(saved.tokenHash, /^[0-9a-f]{64}$/);
      assert.ok(!JSON.stringify(saved.toObject()).includes(token));
    });
  });

  describe("renovação", () => {
    test("troca o token de renovação e abre um novo acesso", async () => {
      await signup();
      const { agent, res } = await login();
      const before = cookieValue(res, "cw_refresh");
      const out = await agent.post("/api/auth/refresh").expect(200);
      assert.equal(out.body.email, user().email);
      assert.ok(out.body.session.accessExpiresAt);
      assert.equal(out.body.session.startedAt, res.body.session.startedAt, "é a mesma sessão");
      assert.notEqual(cookieValue(out, "cw_refresh"), before);
      assert.ok(cookieValue(out, "cw_session"));
      await agent.get("/api/auth/me").expect(200);
      assert.equal(await RefreshSession.countDocuments(), 1);
    });

    test("funciona com o acesso vencido: só o cookie de renovação basta", async () => {
      await signup();
      const { res } = await login();
      const out = await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${cookieValue(res, "cw_refresh")}`);
      assert.equal(out.status, 200);
    });

    test("sem cookie, com lixo ou com sessão vencida: 401", async () => {
      await signup();
      await request(app).post("/api/auth/refresh").expect(401);
      for (const junk of ["lixo", "a".repeat(500), ""]) {
        await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${junk}`).expect(401);
      }
      const { res } = await login();
      await RefreshSession.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
      await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${cookieValue(res, "cw_refresh")}`).expect(401);
    });

    test("token antigo logo depois da troca é só uma corrida entre abas: 409 e a sessão continua", async () => {
      await signup();
      const { agent, res } = await login();
      const old = cookieValue(res, "cw_refresh");
      await agent.post("/api/auth/refresh").expect(200);
      const race = await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${old}`);
      assert.equal(race.status, 409);
      assert.equal(race.headers["set-cookie"], undefined);
      await agent.get("/api/auth/me").expect(200);
    });

    test("token antigo reapresentado depois da janela é cópia: encerra a sessão inteira", async () => {
      await signup();
      const { agent, res } = await login();
      const old = cookieValue(res, "cw_refresh");
      await agent.post("/api/auth/refresh").expect(200);
      await RefreshSession.updateMany({}, { rotatedAt: new Date(Date.now() - 60_000) });

      const attacker = await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${old}`);
      assert.equal(attacker.status, 401);
      assert.equal(await RefreshSession.countDocuments(), 0);
      // O token novo, que o dono ainda tinha, também deixou de valer.
      await agent.post("/api/auth/refresh").expect(401);
      await agent.get("/api/auth/me").expect(401);
    });

    test("duas renovações ao mesmo tempo: só uma ganha e a sessão não é perdida", async () => {
      await signup();
      const { res } = await login();
      const cookie = `cw_refresh=${cookieValue(res, "cw_refresh")}`;
      const results = await Promise.all([1, 2, 3].map(() => request(app).post("/api/auth/refresh").set("Cookie", cookie)));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
      assert.equal(await RefreshSession.countDocuments(), 1);
    });

    test("usuário apagado: a renovação falha", async () => {
      await signup();
      const { res } = await login();
      await User.deleteMany({});
      await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${cookieValue(res, "cw_refresh")}`).expect(401);
    });
  });

  describe("CSRF", () => {
    test("com sessão aberta, mudar dados sem o cabeçalho é recusado", async () => {
      await signup();
      const { agent } = await login();
      const bad = request.agent(app);
      bad.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
      // Os cookies de sessão estão lá, mas falta o cabeçalho.
      const body = { type: "input", value: "10", description: "Salário" };
      assert.equal((await bad.post("/api/transactions").send(body)).status, 403);
      assert.equal((await bad.post("/api/transactions").set("X-CSRF-Token", "errado").send(body)).status, 403);
      assert.equal((await agent.post("/api/transactions").send(body)).status, 201);
      assert.equal(await Transaction.countDocuments(), 1);
    });

    test("vale para logout e perfil também", async () => {
      await signup();
      const { agent } = await login();
      const bare = request.agent(app);
      bare.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
      await bare.post("/api/auth/logout").expect(403);
      await bare.patch("/api/auth/profile").send({ name: "Outro Nome" }).expect(403);
      await bare.get("/api/auth/me").expect(200);
    });

    test("leitura (GET) não precisa do cabeçalho", async () => {
      await signup();
      const { agent } = await login();
      const bare = request.agent(app);
      bare.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
      await bare.get("/api/transactions").expect(200);
    });

    test("origem de outro site é recusada, até no login", async () => {
      await signup();
      const creds = { email: user().email, password: user().password };
      const evil = await request(app).post("/api/auth/signin").set("Origin", "https://site-malicioso.example").send(creds);
      assert.equal(evil.status, 403);
      assert.equal(evil.headers["set-cookie"], undefined);
      await request(app).post("/api/auth/signin").set("Origin", testEnv.webOrigin).send(creds).expect(200);
      // Mesmo endereço do próprio servidor (nginx na frente) também vale.
      await request(app).post("/api/auth/signin").set("Host", "app.exemplo.com:8080").set("Origin", "http://app.exemplo.com:8080").send(creds).expect(200);
      // Esquema diferente (https na frente do túnel, http dentro) não atrapalha...
      await request(app).post("/api/auth/signin").set("Host", "app.exemplo.com").set("Origin", "https://app.exemplo.com").send(creds).expect(200);
      // ...mas outro host ou outra porta, sim.
      await request(app).post("/api/auth/signin").set("Host", "app.exemplo.com").set("Origin", "https://app.exemplo.com:9999").send(creds).expect(403);
      await request(app).post("/api/auth/signin").set("Host", "app.exemplo.com").set("Origin", "not a url").send(creds).expect(403);
      await request(app).post("/api/auth/signin").set("Host", "app.exemplo.com").set("Origin", "https://app.exemplo.com.evil.com").send(creds).expect(403);
    });

    test("login e cadastro não exigem o cabeçalho (ainda não há sessão)", async () => {
      await signup();
      const { agent } = await login();
      // Já com cookies de sessão, entrar de novo continua possível.
      const again = request.agent(app);
      again.jar.setCookies(agent.jar.getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false }).map((c) => c.toString()));
      await again.post("/api/auth/signin").send({ email: user().email, password: user().password }).expect(200);
    });

    test("quem estava logado sem o cookie CSRF recebe um no /me", async () => {
      await signup();
      const { agent } = await login();
      const keep = agent.jar
        .getCookies({ domain: "127.0.0.1", path: "/api", secure: false, script: false })
        .filter((c) => c.name !== "cw_csrf")
        .map((c) => c.toString());
      const old = request.agent(app);
      old.jar.setCookies(keep);
      const me = await old.get("/api/auth/me").expect(200);
      assert.ok(cookieValue(me, "cw_csrf"));
    });
  });

  describe("aparelhos", () => {
    test("lista as sessões abertas, marca a atual e esconde o IP inteiro", async () => {
      await signup();
      await login(1, SAFARI_IPHONE);
      const { agent } = await login(1, CHROME_MAC);
      const list = (await agent.get("/api/auth/sessions").expect(200)).body;
      assert.equal(list.length, 2);
      const current = list.filter((s) => s.current);
      assert.equal(current.length, 1);
      assert.equal(current[0].device.label, "Chrome no macOS");
      assert.ok(list.some((s) => s.device.label === "Safari no iOS" && s.device.kind === "phone"));
      for (const s of list) {
        assert.deepEqual(Object.keys(s).sort(), ["current", "device", "expiresAt", "id", "ip", "lastUsedAt", "startedAt"]);
        assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(s.ip), "IP completo não pode sair");
      }
    });

    test("exige login", async () => {
      await request(app).get("/api/auth/sessions").expect(401);
      await request(app).post("/api/auth/logout-all").expect(401);
    });

    test("encerrar outro aparelho derruba o acesso dele na hora", async () => {
      await signup();
      const phone = (await login(1, SAFARI_IPHONE)).agent;
      const { agent } = await login(1, CHROME_MAC);
      const other = (await agent.get("/api/auth/sessions")).body.find((s) => !s.current);

      await phone.get("/api/auth/me").expect(200);
      await agent.delete(`/api/auth/sessions/${other.id}`).expect(204);
      await phone.get("/api/auth/me").expect(401);
      await phone.post("/api/auth/refresh").expect(401);
      await agent.get("/api/auth/me").expect(200);
    });

    test("encerrar o próprio aparelho também limpa os cookies", async () => {
      await signup();
      const { agent } = await login();
      const me = (await agent.get("/api/auth/sessions")).body[0];
      const out = await agent.delete(`/api/auth/sessions/${me.id}`).expect(204);
      assert.match(rawCookie(out, "cw_session"), /cw_session=;/);
      await agent.get("/api/auth/me").expect(401);
    });

    test("não dá para encerrar a sessão de outra pessoa nem uma que não existe", async () => {
      await signup(1);
      await signup(2);
      const alice = (await login(1)).agent;
      const bob = (await login(2)).agent;
      const bobSession = (await bob.get("/api/auth/sessions")).body[0];
      await alice.delete(`/api/auth/sessions/${bobSession.id}`).expect(404);
      await alice.delete(`/api/auth/sessions/${new mongoose.Types.ObjectId()}`).expect(404);
      await alice.delete("/api/auth/sessions/nao-e-um-id").expect(404);
      await bob.get("/api/auth/me").expect(200);
      assert.equal((await alice.get("/api/auth/sessions")).body.length, 1, "cada pessoa vê só as próprias sessões");
    });

    test("sair de todos os aparelhos encerra todos e só os da própria conta", async () => {
      await signup(1);
      await signup(2);
      const a1 = (await login(1)).agent;
      const a2 = (await login(1, SAFARI_IPHONE)).agent;
      const bob = (await login(2)).agent;
      await a1.post("/api/auth/logout-all").expect(204);
      await a1.get("/api/auth/me").expect(401);
      await a2.get("/api/auth/me").expect(401);
      await bob.get("/api/auth/me").expect(200);
    });

    test("sair apaga a sessão no servidor, mesmo com o acesso vencido", async () => {
      await signup();
      const { res } = await login();
      const refresh = cookieValue(res, "cw_refresh");
      const csrf = cookieValue(res, "cw_csrf");
      const out = await request(app).post("/api/auth/logout").set("Cookie", `cw_refresh=${refresh}; cw_csrf=${csrf}`).set("X-CSRF-Token", csrf);
      assert.equal(out.status, 204);
      assert.equal(await RefreshSession.countDocuments(), 0);
      await request(app).post("/api/auth/refresh").set("Cookie", `cw_refresh=${refresh}`).expect(401);
    });

    test("sair com o acesso ainda válido também apaga a sessão", async () => {
      await signup();
      const { agent } = await login();
      await agent.post("/api/auth/logout").expect(204);
      assert.equal(await RefreshSession.countDocuments(), 0);
    });
  });

  describe("limite de tentativas", () => {
    const tight = (rateLimits) => createApp({ ...testEnv, rateLimits });

    test("erros de senha na mesma conta bloqueiam essa conta, mas não outra", async () => {
      const limited = tight({ signinAccount: { windowMs: 60_000, limit: 3 } });
      await signup(1);
      await signup(2);
      const wrong = (email) => request(limited).post("/api/auth/signin").send({ email, password: "senha-errada-123" });
      for (let i = 0; i < 3; i++) assert.equal((await wrong(user(1).email)).status, 401);
      const blocked = await wrong(user(1).email);
      assert.equal(blocked.status, 429);
      assert.match(blocked.body.message, /Muitas tentativas/);
      assert.ok(blocked.headers["ratelimit-policy"] || blocked.headers["ratelimit"], "informa o limite nos cabeçalhos");
      // Outra conta, do mesmo IP, continua podendo entrar.
      await request(limited).post("/api/auth/signin").send({ email: user(2).email, password: user(2).password }).expect(200);
    });

    test("login certo não gasta o limite da conta", async () => {
      const limited = tight({ signinAccount: { windowMs: 60_000, limit: 2 } });
      await signup();
      for (let i = 0; i < 5; i++) {
        await request(limited).post("/api/auth/signin").send({ email: user().email, password: user().password }).expect(200);
      }
    });

    test("limite por IP no login, no cadastro e na renovação", async () => {
      const limited = tight({ signin: { windowMs: 60_000, limit: 2 }, signup: { windowMs: 60_000, limit: 2 }, refresh: { windowMs: 60_000, limit: 2 } });
      const creds = { email: "x@exemplo.com", password: "senha-errada-123" };
      await request(limited).post("/api/auth/signin").send(creds).expect(401);
      await request(limited).post("/api/auth/signin").send(creds).expect(401);
      await request(limited).post("/api/auth/signin").send(creds).expect(429);

      await request(limited).post("/api/auth/signup").send(user(1)).expect(201);
      await request(limited).post("/api/auth/signup").send(user(1)).expect(409);
      await request(limited).post("/api/auth/signup").send(user(2)).expect(429);

      await request(limited).post("/api/auth/refresh").expect(401);
      await request(limited).post("/api/auth/refresh").expect(401);
      await request(limited).post("/api/auth/refresh").expect(429);
    });

    test("limite geral da API", async () => {
      const limited = tight({ general: { windowMs: 60_000, limit: 3 } });
      for (let i = 0; i < 3; i++) await request(limited).get("/api/auth/config").expect(200);
      await request(limited).get("/api/auth/config").expect(429);
    });

    test("o email do corpo não vira brecha: objeto no lugar do email não derruba o limitador", async () => {
      const limited = tight({ signinAccount: { windowMs: 60_000, limit: 2 } });
      const res = await request(limited).post("/api/auth/signin").send({ email: { $gt: "" }, password: { $ne: "" } });
      assert.equal(res.status, 422);
    });
  });
});
