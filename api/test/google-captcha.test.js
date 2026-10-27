import { describe, test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import { createCaptcha } from "../src/services/captchaService.js";
import { createGoogleVerifier } from "../src/services/googleService.js";
import User from "../src/models/User.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("google");
const CLIENT_ID = "123-abc.apps.googleusercontent.com";

// ---------- captcha (não precisa de banco: só a Cloudflare, simulada) ----------
describe("createCaptcha", () => {
  const config = { secret: "segredo", siteKey: "site" };
  const fetchWith = (impl) => async (url, init) => impl(url, init);

  test("sem chave fica desligado e deixa passar", async () => {
    const captcha = createCaptcha(null);
    assert.equal(captcha.enabled, false);
    assert.equal(await captcha.verify("qualquer"), "ok");
  });

  test("manda segredo, token e IP para a Cloudflare e aceita success=true", async () => {
    let sent;
    const captcha = createCaptcha(config, fetchWith(async (url, init) => {
      sent = { url, body: init.body.toString() };
      return { ok: true, json: async () => ({ success: true }) };
    }));
    assert.equal(await captcha.verify("tok", "1.2.3.4"), "ok");
    assert.equal(sent.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const params = new URLSearchParams(sent.body);
    assert.equal(params.get("secret"), "segredo");
    assert.equal(params.get("response"), "tok");
    assert.equal(params.get("remoteip"), "1.2.3.4");
  });

  test("success=false é invalid; HTTP de erro, rede e JSON ruim são unavailable (falha fechada)", async () => {
    const mk = (impl) => createCaptcha(config, fetchWith(impl));
    assert.equal(await mk(async () => ({ ok: true, json: async () => ({ success: false }) })).verify("t"), "invalid");
    assert.equal(await mk(async () => ({ ok: true, json: async () => ({}) })).verify("t"), "invalid");
    assert.equal(await mk(async () => ({ ok: false, json: async () => ({}) })).verify("t"), "unavailable");
    assert.equal(await mk(async () => { throw new Error("rede"); }).verify("t"), "unavailable");
    assert.equal(await mk(async () => ({ ok: true, json: async () => { throw new Error("json"); } })).verify("t"), "unavailable");
  });
});

describe("createGoogleVerifier", () => {
  const goodPayload = { sub: "g-1", email: "Ana@Gmail.com", email_verified: true, name: "Ana Souza", nonce: "n1" };
  const clientReturning = (payload, onCall) => ({
    verifyIdToken: async (args) => {
      onCall?.(args);
      return { getPayload: () => payload };
    },
  });

  test("confere com a audiência certa e devolve o perfil com email em minúsculas", async () => {
    let args;
    const verifier = createGoogleVerifier(CLIENT_ID, clientReturning(goodPayload, (a) => (args = a)));
    const profile = await verifier.verify("tok", "n1");
    assert.deepEqual(profile, { googleId: "g-1", email: "ana@gmail.com", name: "Ana Souza" });
    assert.equal(args.audience, CLIENT_ID);
  });

  test("recusa email não verificado, nonce errado ou ausente, e token inválido", async () => {
    const bad = (payload, nonce = "n1") => createGoogleVerifier(CLIENT_ID, clientReturning(payload)).verify("tok", nonce);
    await assert.rejects(bad({ ...goodPayload, email_verified: false }), { status: 401 });
    await assert.rejects(bad({ ...goodPayload, email_verified: "true" }), { status: 401 });
    await assert.rejects(bad(goodPayload, "outro"), { status: 401 });
    await assert.rejects(bad(goodPayload, ""), { status: 401 });
    await assert.rejects(bad({ ...goodPayload, nonce: undefined }), { status: 401 });
    await assert.rejects(bad({ ...goodPayload, sub: undefined }), { status: 401 });
    await assert.rejects(bad({ ...goodPayload, email: undefined }), { status: 401 });
    const throwing = createGoogleVerifier(CLIENT_ID, { verifyIdToken: async () => { throw new Error("assinatura"); } });
    await assert.rejects(throwing.verify("tok", "n1"), { status: 401 });
  });

  test("sem clientId fica desligado", async () => {
    const verifier = createGoogleVerifier("");
    assert.equal(verifier.enabled, false);
    await assert.rejects(verifier.verify("t", "n"), { status: 503 });
  });
});

// ---------- rotas (com banco) ----------
describe("captcha e Google nas rotas", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  let verdict = "ok";
  let lastToken;
  const captcha = { enabled: true, verify: async (token) => { lastToken = token; return verdict; } };
  let googleProfile;
  // O token de teste carrega o nonce que o "navegador" recebeu (n=<nonce>;...).
  // Como no verificador de verdade, só vale se for igual ao nonce do cookie.
  const tokenFor = (nonce) => `n=${nonce};${"x".repeat(30)}`;
  const google = {
    enabled: true,
    verify: async (credential, expectedNonce) => {
      const refuse = (message) => Object.assign(new Error(message), { status: 401, expose: true });
      if (credential.startsWith("token-invalido")) throw refuse("recusado");
      const inToken = /^n=([^;]*);/.exec(credential)?.[1];
      if (!expectedNonce || inToken !== expectedNonce) throw refuse("nonce");
      return googleProfile;
    },
  };
  const app = createApp({ ...testEnv, googleClientId: CLIENT_ID, turnstile: { secret: "s", siteKey: "site-key-publica" } }, { captcha, google });
  const appOff = createApp(testEnv);

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await User.init();
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), RefreshSession.deleteMany({})]);
    verdict = "ok";
    lastToken = undefined;
    googleProfile = { googleId: "g-100", email: "ana@gmail.com", name: "ana souza" };
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  const credentials = () => ({ email: user().email, password: user().password });

  async function nonceAgent() {
    const agent = request.agent(app);
    const { body } = await agent.get("/api/auth/google/nonce").expect(200);
    return { agent, nonce: body.nonce };
  }

  describe("GET /api/auth/config", () => {
    test("devolve só chaves públicas quando tudo está ligado", async () => {
      const res = await request(app).get("/api/auth/config").expect(200);
      assert.deepEqual(res.body, { captcha: { provider: "turnstile", siteKey: "site-key-publica" }, google: { clientId: CLIENT_ID }, emailVerification: false });
      assert.ok(!JSON.stringify(res.body).includes('"s"'));
    });
    test("tudo nulo quando nada está configurado", async () => {
      const res = await request(appOff).get("/api/auth/config").expect(200);
      assert.deepEqual(res.body, { captcha: null, google: null, emailVerification: false });
    });
  });

  describe("captcha no cadastro e no login", () => {
    test("sem token: 400, e nem chega a olhar a senha", async () => {
      const res = await request(app).post("/api/auth/signin").send(credentials());
      assert.equal(res.status, 400);
      assert.match(res.body.message, /robô/);
      assert.equal(res.headers["set-cookie"], undefined);
    });

    test("token que não é texto ou é gigante: 400", async () => {
      for (const captchaToken of [{ $ne: 1 }, 123, "", "x".repeat(3000), ["a"]]) {
        const res = await request(app).post("/api/auth/signin").send({ ...credentials(), captchaToken });
        assert.equal(res.status, 400, JSON.stringify(captchaToken).slice(0, 30));
      }
    });

    test("token recusado: 403; Cloudflare fora do ar: 503", async () => {
      verdict = "invalid";
      assert.equal((await request(app).post("/api/auth/signup").send({ ...user(), captchaToken: "t" })).status, 403);
      verdict = "unavailable";
      assert.equal((await request(app).post("/api/auth/signup").send({ ...user(), captchaToken: "t" })).status, 503);
      assert.equal(await User.countDocuments(), 0);
    });

    test("token válido deixa cadastrar e entrar, e o campo não vaza para o banco", async () => {
      await request(app).post("/api/auth/signup").send({ ...user(), captchaToken: "bom" }).expect(201);
      assert.equal(lastToken, "bom");
      const saved = (await User.find().lean())[0];
      assert.equal(saved.captchaToken, undefined);
      await request(app).post("/api/auth/signin").send({ ...credentials(), captchaToken: "bom" }).expect(200);
    });

    test("captcha desligado não exige token", async () => {
      await request(appOff).post("/api/auth/signup").send(user()).expect(201);
      await request(appOff).post("/api/auth/signin").send(credentials()).expect(200);
    });

    test("logout, /me e Google não pedem captcha", async () => {
      await request(app).post("/api/auth/logout").expect(204);
      await request(app).get("/api/auth/me").expect(401);
      await request(app).get("/api/auth/google/nonce").expect(200);
    });
  });

  describe("entrar com o Google", () => {
    test("o nonce é aleatório, vai num cookie httpOnly e dura poucos minutos", async () => {
      const a = await request(app).get("/api/auth/google/nonce");
      const b = await request(app).get("/api/auth/google/nonce");
      assert.match(a.body.nonce, /^[0-9a-f]{64}$/);
      assert.notEqual(a.body.nonce, b.body.nonce);
      const cookie = a.headers["set-cookie"].find((c) => c.startsWith("cw_gnonce="));
      // O cookie guarda o segredo da tentativa, nunca o próprio nonce que vai no token.
      assert.match(cookie, /^cw_gnonce=\d{13}\.[0-9a-f]{32};/);
      assert.ok(!cookie.includes(a.body.nonce));
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Max-Age=300/);
    });

    test("primeiro acesso cria a conta sem senha, com perfil por completar, e abre a sessão", async () => {
      const { agent, nonce } = await nonceAgent();
      const res = await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) });
      assert.equal(res.status, 200);
      assert.equal(res.body.email, "ana@gmail.com");
      assert.equal(res.body.provider, "google");
      assert.equal(res.body.profileComplete, false);
      assert.ok(res.body.session.expiresAt);
      assert.ok(res.headers["set-cookie"].some((c) => c.startsWith("cw_session=") && /HttpOnly/i.test(c)));

      const saved = await User.findOne({ email: "ana@gmail.com" }).select("+passwordHash +googleId");
      assert.equal(saved.googleId, "g-100");
      assert.equal(saved.passwordHash, undefined);
      assert.equal(saved.emailVerified, true);
      assert.equal((await agent.get("/api/auth/me")).body.email, "ana@gmail.com");
    });

    test("o nonce vale uma vez: depois de usado o cookie some e repetir falha", async () => {
      const { agent, nonce } = await nonceAgent();
      const ok = await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) }).expect(200);
      assert.ok(ok.headers["set-cookie"].some((c) => /^cw_gnonce=;/.test(c)));
      const again = await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) });
      assert.equal(again.status, 401);
    });

    test("token de outra sessão (nonce diferente) ou sem cookie de nonce: 401, sem conta", async () => {
      const victim = await nonceAgent();
      const attacker = await nonceAgent();
      // O atacante usa um token feito para o navegador da vítima, no próprio navegador.
      const stolen = await attacker.agent.post("/api/auth/google").send({ credential: tokenFor(victim.nonce) });
      assert.equal(stolen.status, 401);
      const noCookie = await request(app).post("/api/auth/google").send({ credential: tokenFor(victim.nonce) });
      assert.equal(noCookie.status, 401);
      assert.equal(await User.countDocuments(), 0);
    });

    test("token roubado não serve: sem o cookie do navegador original não há como montar o nonce", async () => {
      const victim = await nonceAgent();
      // O atacante lê o nonce no token roubado e tenta fabricar um cookie qualquer.
      const forged = [
        "9999999999999.00000000000000000000000000000000",
        `${Date.now() + 60000}.${"a".repeat(32)}`,
        victim.nonce,
        "",
        "lixo",
      ];
      for (const cookie of forged) {
        const res = await request(app).post("/api/auth/google").set("Cookie", `cw_gnonce=${cookie}`).send({ credential: tokenFor(victim.nonce) });
        assert.equal(res.status, 401, cookie);
      }
      assert.equal(await User.countDocuments(), 0);
    });

    test("a tentativa vence em 5 minutos: um cookie legítimo, mas velho, não vale", async () => {
      // O cookie vai no cabeçalho "na mão": o cookie jar do supertest também
      // descartaria o cookie vencido, e o que queremos provar é a checagem da API.
      const first = await request(app).get("/api/auth/google/nonce");
      const cookie = first.headers["set-cookie"][0].split(";")[0];
      const realNow = Date.now();
      const clock = mock.method(Date, "now", () => realNow + 6 * 60 * 1000);
      try {
        const res = await request(app).post("/api/auth/google").set("Cookie", cookie).send({ credential: tokenFor(first.body.nonce) });
        assert.equal(res.status, 401);
      } finally {
        clock.mock.restore();
      }
      // Dentro do prazo, o mesmo cookie e o mesmo nonce servem.
      const ok = await request(app).post("/api/auth/google").set("Cookie", cookie).send({ credential: tokenFor(first.body.nonce) });
      assert.equal(ok.status, 200);
    });

    test("segundo acesso reaproveita a mesma conta", async () => {
      for (let i = 0; i < 2; i++) {
        const { agent, nonce } = await nonceAgent();
        await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) }).expect(200);
      }
      assert.equal(await User.countDocuments(), 1);
    });

    test("email que já tem conta com senha: 409 e NENHUMA junção automática", async () => {
      await request(app).post("/api/auth/signup").send({ ...user(), email: "ana@gmail.com", captchaToken: "t" }).expect(201);
      const { agent, nonce } = await nonceAgent();
      const res = await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) });
      assert.equal(res.status, 409);
      assert.match(res.body.message, /Entre com o email e a senha/);
      assert.ok(!res.headers["set-cookie"]?.some((c) => c.startsWith("cw_session=")), "não pode abrir sessão");
      const saved = await User.findOne({ email: "ana@gmail.com" }).select("+googleId");
      assert.equal(saved.googleId, undefined);
      assert.equal(saved.provider, "password");
    });

    test("token recusado pelo Google: 401, sem sessão e sem conta", async () => {
      const { agent } = await nonceAgent();
      const res = await agent.post("/api/auth/google").send({ credential: "token-invalido" + "x".repeat(20) });
      assert.equal(res.status, 401);
      assert.ok(!res.headers["set-cookie"]?.some((c) => c.startsWith("cw_session=")), "não pode abrir sessão");
      assert.equal(await User.countDocuments(), 0);
    });

    test("credencial ausente, curta, gigante ou que não é texto: 422", async () => {
      for (const credential of [undefined, "", "curta", "x".repeat(5000), { $ne: 1 }, 5]) {
        const res = await request(app).post("/api/auth/google").send({ credential });
        assert.equal(res.status, 422, JSON.stringify(credential)?.slice(0, 30));
      }
    });

    test("conta do Google não entra com senha: mesma resposta de login errado", async () => {
      const { agent, nonce } = await nonceAgent();
      await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) }).expect(200);
      const res = await request(app).post("/api/auth/signin").send({ email: "ana@gmail.com", password: "cavalo-azul-77", captchaToken: "t" });
      const wrong = await request(app).post("/api/auth/signin").send({ email: "ninguem@x.com", password: "cavalo-azul-77", captchaToken: "t" });
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, wrong.body);
    });

    test("Google desligado: 503 com mensagem clara", async () => {
      const res = await request(appOff).post("/api/auth/google").send({ credential: "c".repeat(30) });
      assert.equal(res.status, 503);
    });
  });

  describe("completar o perfil", () => {
    async function googleAgent() {
      const { agent, nonce } = await nonceAgent();
      await agent.post("/api/auth/google").send({ credential: tokenFor(nonce) }).expect(200);
      agent.set("X-CSRF-Token", csrfOf(agent));
      return agent;
    }

    test("exige login", async () => {
      await request(app).patch("/api/auth/profile").send({ name: "Maria Silva" }).expect(401);
    });

    test("guarda o nome limpo e marca o perfil como completo", async () => {
      const agent = await googleAgent();
      const res = await agent.patch("/api/auth/profile").send({ name: "  ana maria dos santos " }).expect(200);
      assert.equal(res.body.name, "Ana Maria dos Santos");
      assert.equal(res.body.profileComplete, true);
      assert.equal((await agent.get("/api/auth/me")).body.profileComplete, true);
    });

    test("recusa nome curto e só aceita o campo name (email e id não mudam)", async () => {
      const agent = await googleAgent();
      assert.equal((await agent.patch("/api/auth/profile").send({ name: "Al" })).status, 422);
      assert.equal((await agent.patch("/api/auth/profile").send({ name: { $ne: 1 } })).status, 422);
      const before = await User.findOne({ email: "ana@gmail.com" });
      await agent.patch("/api/auth/profile").send({ name: "Ana Souza", email: "outro@x.com", provider: "password", googleId: "x", _id: "0".repeat(24) }).expect(200);
      const after = await User.findOne({ _id: before._id }).select("+googleId");
      assert.equal(after.email, "ana@gmail.com");
      assert.equal(after.provider, "google");
      assert.equal(after.googleId, "g-100");
    });

    test("conta criada com senha já nasce com perfil completo", async () => {
      await request(app).post("/api/auth/signup").send({ ...user(), captchaToken: "t" }).expect(201);
      const agent = request.agent(app);
      const res = await agent.post("/api/auth/signin").send({ ...credentials(), captchaToken: "t" }).expect(200);
      assert.equal(res.body.profileComplete, true);
      assert.equal(res.body.provider, "password");
    });
  });
});
