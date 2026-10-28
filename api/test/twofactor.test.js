import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { createTwoFactor } from "../src/services/twoFactorService.js";
import { codeAt, STEP_SECONDS } from "../src/lib/totp.js";
import { testEnv, user, testDbUri, csrfOf } from "../support/helpers.js";

const uri = testDbUri("twofactor");
const PW = user(1).password;
const STEP_MS = STEP_SECONDS * 1000;

describe("verificação em duas etapas (TOTP)", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  // Relógio do servidor controlado: cada teste anda de passo em passo, sem esperar 30 s de verdade.
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const advance = (steps = 1) => {
    clock += steps * STEP_MS;
  };
  const twoFactor = createTwoFactor({ jwtSecret: testEnv.jwtSecret, now });
  const app = createApp(testEnv, { twoFactor });

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User, RefreshSession].map((m) => m.init()));
  });
  beforeEach(async () => {
    await Promise.all([User, RefreshSession].map((m) => m.deleteMany({})));
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
    return agent;
  }

  // Ativa o 2FA e devolve o segredo e os códigos de recuperação.
  async function activate(agent) {
    const { secret } = (await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200)).body;
    const { recoveryCodes } = (await agent.post("/api/auth/2fa/enable").send({ code: codeAt(secret, now()) }).expect(200)).body;
    return { secret, recoveryCodes };
  }

  const password = (n = 1) => ({ email: user(n).email, password: user(n).password });
  const fresh = () => request(app);

  describe("ativar", () => {
    test("setup devolve segredo, link otpauth e QR code em imagem, e ainda não ativa nada", async () => {
      const agent = await loggedAgent();
      const body = (await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200)).body;
      assert.match(body.secret, /^[A-Z2-7]{32}$/);
      assert.ok(body.uri.startsWith("otpauth://totp/CoreWallet:"));
      assert.ok(body.uri.includes(`secret=${body.secret}`));
      assert.match(body.qr, /^data:image\/svg\+xml;base64,/);
      assert.match(Buffer.from(body.qr.split(",")[1], "base64").toString(), /^<svg/);
      assert.equal((await agent.get("/api/auth/2fa").expect(200)).body.enabled, false);
      assert.equal((await agent.get("/api/auth/me")).body.twoFactorEnabled, false);
    });

    test("o segredo fica CIFRADO no banco (nem pendente, nem ativo aparece às claras)", async () => {
      const agent = await loggedAgent();
      const { secret } = (await agent.post("/api/auth/2fa/setup").send({ password: PW })).body;
      let raw = await User.collection.findOne({ email: user(1).email });
      assert.ok(raw.totpPendingSecret.startsWith("v1."));
      assert.ok(!JSON.stringify(raw).includes(secret), "o segredo não pode estar legível no banco (pendente)");
      await agent.post("/api/auth/2fa/enable").send({ code: codeAt(secret, now()) }).expect(200);
      raw = await User.collection.findOne({ email: user(1).email });
      assert.equal(raw.totpEnabled, true);
      assert.equal(raw.totpPendingSecret, undefined, "o segredo pendente some depois de ativar");
      assert.ok(!JSON.stringify(raw).includes(secret), "o segredo não pode estar legível no banco (ativo)");
      assert.equal(raw.recoveryCodes.length, 10);
      assert.ok(raw.recoveryCodes.every((h) => /^[0-9a-f]{64}$/.test(h)), "recuperação guardada só em hash");
    });

    test("ativar com código errado é recusado e não ativa", async () => {
      const agent = await loggedAgent();
      await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200);
      const res = await agent.post("/api/auth/2fa/enable").send({ code: "000000" }).expect(422);
      assert.ok(res.body.errors.code);
      assert.equal((await agent.get("/api/auth/2fa")).body.enabled, false);
      await agent.post("/api/auth/2fa/enable").send({ code: "abc" }).expect(422);
    });

    test("ativar sem ter feito o setup pede para começar de novo", async () => {
      const agent = await loggedAgent();
      await agent.post("/api/auth/2fa/enable").send({ code: "123456" }).expect(409);
    });

    test("devolve 10 códigos de recuperação diferentes no formato XXXXX-XXXXX, só nessa resposta", async () => {
      const agent = await loggedAgent();
      const { recoveryCodes } = await activate(agent);
      assert.equal(recoveryCodes.length, 10);
      assert.equal(new Set(recoveryCodes).size, 10);
      for (const c of recoveryCodes) assert.match(c, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
      const status = (await agent.get("/api/auth/2fa")).body;
      assert.deepEqual(status, { enabled: true, recoveryCodesLeft: 10 });
      assert.equal((await agent.get("/api/auth/me")).body.twoFactorEnabled, true);
    });

    test("não dá para ativar duas vezes, nem sem estar logado", async () => {
      const agent = await loggedAgent();
      await activate(agent);
      await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(409);
      await fresh().post("/api/auth/2fa/setup").send({ password: PW }).expect(401);
      await fresh().post("/api/auth/2fa/enable").send({ code: "123456" }).expect(401);
      await fresh().post("/api/auth/2fa/disable").send({ password: "x", code: "123456" }).expect(401);
    });

    test("quem entra pelo Google é orientado a usar o 2FA do Google", async () => {
      const agent = await loggedAgent();
      await User.updateOne({ email: user(1).email }, { $set: { provider: "google" } });
      const res = await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(409);
      assert.match(res.body.message, /Google/);
    });

    test("conta antiga, sem o campo totpEnabled gravado no banco, também ativa", async () => {
      const agent = await loggedAgent();
      // Contas criadas antes do 2FA existir não têm o campo; o Mongoose só o preenche ao ler.
      await User.collection.updateOne({ email: user(1).email }, { $unset: { totpEnabled: "" } });
      assert.equal(await User.collection.countDocuments({ email: user(1).email, totpEnabled: { $exists: false } }), 1);
      const { secret } = (await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200)).body;
      await agent.post("/api/auth/2fa/enable").send({ code: codeAt(secret, now()) }).expect(200);
      assert.equal((await agent.get("/api/auth/2fa").expect(200)).body.enabled, true);
    });
  });

  describe("entrar", () => {
    test("com 2FA ativo, a senha sozinha NÃO abre a sessão: devolve só um desafio", async () => {
      const agent = await loggedAgent();
      await activate(agent);
      const res = await fresh().post("/api/auth/signin").send(password()).expect(200);
      assert.equal(res.body.twoFactorRequired, true);
      assert.ok(res.body.challenge.length > 20);
      assert.equal(res.body.session, undefined);
      assert.equal(res.body.email, undefined);
      assert.deepEqual(res.headers["set-cookie"] ?? [], [], "nenhum cookie de sessão antes do segundo fator");
    });

    test("o desafio + o código do aplicativo abrem a sessão", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      advance(); // o código usado na ativação não vale de novo
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      const agent = request.agent(app);
      const res = await agent.post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(200);
      assert.equal(res.body.email, user(1).email);
      assert.ok(res.body.session.startedAt);
      await agent.get("/api/auth/me").expect(200);
    });

    test("código errado: 401 genérico, sem sessão", async () => {
      const first = await loggedAgent();
      await activate(first);
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      const res = await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "000000" }).expect(401);
      assert.equal(res.body.message, "Código incorreto");
      assert.deepEqual(res.headers["set-cookie"] ?? [], []);
    });

    test("o mesmo código do aplicativo não vale duas vezes (nem na ativação, nem no login)", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      // Mesmo passo da ativação, dentro do mesmo intervalo de 30 s: recusado.
      const a = (await fresh().post("/api/auth/signin").send(password())).body.challenge;
      await fresh().post("/api/auth/signin/2fa").send({ challenge: a, code: codeAt(secret, now()) }).expect(401);
      advance();
      const code = codeAt(secret, now());
      const b = (await fresh().post("/api/auth/signin").send(password())).body.challenge;
      await fresh().post("/api/auth/signin/2fa").send({ challenge: b, code }).expect(200);
      // Replay do mesmo código, com outro desafio válido.
      const c = (await fresh().post("/api/auth/signin").send(password())).body.challenge;
      await fresh().post("/api/auth/signin/2fa").send({ challenge: c, code }).expect(401);
    });

    test("aceita o código do passo anterior e do seguinte, e recusa os mais distantes", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      advance(3);
      const go = async (delta) => {
        const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
        return fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now() + delta * STEP_MS) });
      };
      await go(-2).then((r) => assert.equal(r.status, 401));
      await go(2).then((r) => assert.equal(r.status, 401));
      await go(-1).then((r) => assert.equal(r.status, 200));
    });

    test("desafio adulterado, de outro formato ou vencido é recusado", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      advance();
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      const [payload, sig] = challenge.split(".");
      const tampered = `${Buffer.from(Buffer.from(payload, "base64url").toString().replace(/^[0-9a-f]{24}/, "0".repeat(24))).toString("base64url")}.${sig}`;
      const code = codeAt(secret, now());
      for (const bad of [tampered, `${payload}.${sig.slice(0, -2)}xx`, "lixo.lixo.lixo", "x".repeat(40)]) {
        await fresh().post("/api/auth/signin/2fa").send({ challenge: bad, code }).expect(401);
      }
      advance(11); // passou de 5 minutos
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(401);
    });

    test("depois de 5 erros o desafio morre, até com o código certo", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      advance();
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      for (let i = 0; i < 5; i++) await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "000000" }).expect(401);
      const res = await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(429);
      assert.match(res.body.message, /Entre de novo/);
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(401);
    });

    test("cada desafio vale uma entrada só", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      advance();
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(200);
      advance();
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(401);
    });

    test("o desafio não serve para outra conta e não existe sem a senha certa", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      const a = await activate(ana);
      await activate(bia);
      advance();
      const { challenge } = (await fresh().post("/api/auth/signin").send(password(1))).body;
      // Código da Bia no desafio da Ana.
      const b = (await bia.get("/api/auth/me")).body;
      assert.ok(b.twoFactorEnabled);
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "123456" }).expect(401);
      await fresh().post("/api/auth/signin").send({ email: user(1).email, password: "senha-errada-123" }).expect(401);
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(a.secret, now()) }).expect(200);
    });

    test("corpo inválido na segunda etapa é recusado com 422", async () => {
      await fresh().post("/api/auth/signin/2fa").send({}).expect(422);
      await fresh().post("/api/auth/signin/2fa").send({ challenge: "x", code: "123456" }).expect(422);
      await fresh().post("/api/auth/signin/2fa").send({ challenge: "a".repeat(30), code: { $ne: "" } }).expect(422);
    });
  });

  describe("códigos de recuperação", () => {
    test("abrem a sessão, com ou sem traço e em minúsculas, e cada um vale uma vez", async () => {
      const first = await loggedAgent();
      const { recoveryCodes } = await activate(first);
      const enter = async (code) => {
        const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
        return fresh().post("/api/auth/signin/2fa").send({ challenge, code });
      };
      assert.equal((await enter(recoveryCodes[0])).status, 200);
      assert.equal((await enter(recoveryCodes[0])).status, 401, "o mesmo código não vale de novo");
      assert.equal((await enter(recoveryCodes[1].replace("-", "").toLowerCase())).status, 200);
      assert.equal((await enter(` ${recoveryCodes[2]} `)).status, 200);
      assert.equal((await fresh().post("/api/auth/signin").send(password())).body.twoFactorRequired, true, "só com a senha continua exigindo o segundo fator");
      const status = (await first.get("/api/auth/2fa")).body;
      assert.equal(status.recoveryCodesLeft, 7);
    });

    test("um código de recuperação de outra conta não vale", async () => {
      const ana = await loggedAgent(1);
      const bia = await loggedAgent(2);
      await activate(ana);
      const b = await activate(bia);
      const { challenge } = (await fresh().post("/api/auth/signin").send(password(1))).body;
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: b.recoveryCodes[0] }).expect(401);
    });
  });

  describe("desativar", () => {
    test("pede senha E código, e depois o login volta a ser só senha", async () => {
      const agent = await loggedAgent();
      const { secret } = await activate(agent);
      advance();
      const code = codeAt(secret, now());
      await agent.post("/api/auth/2fa/disable").send({ password: "senha-errada-123", code }).expect(422).then((r) => assert.ok(r.body.errors.password));
      await agent.post("/api/auth/2fa/disable").send({ password: user(1).password, code: "000000" }).expect(422).then((r) => assert.ok(r.body.errors.code));
      assert.equal((await agent.get("/api/auth/2fa")).body.enabled, true, "falhas não desativam");
      await agent.post("/api/auth/2fa/disable").send({ password: user(1).password, code }).expect(204);
      assert.equal((await agent.get("/api/auth/2fa")).body.enabled, false);
      const raw = await User.collection.findOne({ email: user(1).email });
      assert.equal(raw.totpSecret, undefined);
      assert.equal(raw.recoveryCodes, undefined);
      const res = await fresh().post("/api/auth/signin").send(password()).expect(200);
      assert.ok(res.body.session, "sem 2FA a senha abre a sessão de novo");
    });

    test("dá para desativar com um código de recuperação", async () => {
      const agent = await loggedAgent();
      const { recoveryCodes } = await activate(agent);
      await agent.post("/api/auth/2fa/disable").send({ password: user(1).password, code: recoveryCodes[0] }).expect(204);
    });

    test("ativar de novo gera segredo e códigos novos (os antigos morrem)", async () => {
      const agent = await loggedAgent();
      const one = await activate(agent);
      advance();
      await agent.post("/api/auth/2fa/disable").send({ password: user(1).password, code: codeAt(one.secret, now()) }).expect(204);
      advance();
      const two = await activate(agent);
      assert.notEqual(one.secret, two.secret);
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: one.recoveryCodes[0] }).expect(401);
    });
  });

  test("segredo adulterado no banco falha com segurança (não aceita nada)", async () => {
    const agent = await loggedAgent();
    await activate(agent);
    advance();
    await User.collection.updateOne({ email: user(1).email }, { $set: { totpSecret: "v1.AAAA.AAAA.AAAA" } });
    const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
    await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "123456" }).expect(401);
  });

  describe("endurecimento (achados da revisão)", () => {
    test("começar a ativar exige a senha: sessão aberta sozinha não registra um aplicativo", async () => {
      const agent = await loggedAgent();
      await agent.post("/api/auth/2fa/setup").expect(422);
      await agent.post("/api/auth/2fa/setup").send({ password: "senha-errada-123" }).expect(422).then((r) => assert.ok(r.body.errors.password));
      await agent.post("/api/auth/2fa/setup").send({ password: { $ne: "" } }).expect(422);
      const raw = await User.collection.findOne({ email: user(1).email });
      assert.equal(raw.totpPendingSecret, undefined, "nada foi gerado sem a senha");
      await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200);
    });

    test("ativar o 2FA desconecta as outras sessões (a atual continua)", async () => {
      const here = await loggedAgent();
      const other = request.agent(app);
      await other.post("/api/auth/signin").send(password()).expect(200);
      await other.get("/api/auth/me").expect(200);
      await activate(here);
      await here.get("/api/auth/me").expect(200);
      await other.get("/api/auth/me").expect(401);
    });

    test("10 erros seguidos travam a CONTA (qualquer desafio), até para o código certo, e destravam depois de 15 minutos", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      advance();
      // 2 erros em cada um de 5 desafios diferentes = 10 erros na conta.
      for (let c = 0; c < 5; c++) {
        const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
        for (let i = 0; i < 2; i++) await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "000000" }).expect(401);
      }
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      const locked = await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(429);
      assert.equal(locked.body.code, "account_locked");
      // Desativar também fica travado.
      await first.post("/api/auth/2fa/disable").send({ password: PW, code: codeAt(secret, now()) }).expect(429);
      clock += 16 * 60 * 1000;
      const again = (await fresh().post("/api/auth/signin").send(password())).body.challenge;
      await fresh().post("/api/auth/signin/2fa").send({ challenge: again, code: codeAt(secret, now()) }).expect(200);
    });

    test("acertar zera a contagem de erros", async () => {
      const first = await loggedAgent();
      const { secret } = await activate(first);
      for (let round = 0; round < 3; round++) {
        advance();
        const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
        for (let i = 0; i < 4; i++) await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "000000" }).expect(401);
        await fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }).expect(200);
      }
      // 12 erros no total, mas nunca 10 seguidos: a conta não travou.
      const raw = await User.collection.findOne({ email: user(1).email });
      assert.equal(raw.totpFails, 0);
      assert.equal(raw.totpLockedUntil, undefined);
    });

    test("o código errado devolve o código 'wrong_code' e o desafio vencido, outro", async () => {
      const first = await loggedAgent();
      await activate(first);
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      assert.equal((await fresh().post("/api/auth/signin/2fa").send({ challenge, code: "000000" }).expect(401)).body.code, "wrong_code");
      const expired = await fresh().post("/api/auth/signin/2fa").send({ challenge: "lixo.lixo.lixo", code: "000000" }).expect(401);
      assert.equal(expired.body.code, "challenge_invalid");
    });

    test("pedidos em paralelo com o mesmo desafio não abrem duas sessões", async () => {
      const first = await loggedAgent();
      const { secret, recoveryCodes } = await activate(first);
      advance();
      const { challenge } = (await fresh().post("/api/auth/signin").send(password())).body;
      const results = await Promise.all([
        fresh().post("/api/auth/signin/2fa").send({ challenge, code: codeAt(secret, now()) }),
        fresh().post("/api/auth/signin/2fa").send({ challenge, code: recoveryCodes[0] }),
        fresh().post("/api/auth/signin/2fa").send({ challenge, code: recoveryCodes[1] }),
      ]);
      assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.status).join());
      // O desafio fica gasto: nem os códigos que sobraram abrem outra sessão com ele.
      await fresh().post("/api/auth/signin/2fa").send({ challenge, code: recoveryCodes[2] }).expect(401);
    });

    test("uma chave própria do 2FA (TOTP_ENCRYPTION_KEY) cifra o segredo e não depende do JWT_SECRET", async () => {
      const own = createTwoFactor({ jwtSecret: testEnv.jwtSecret, encryptionKey: "chave-propria-do-2fa-com-mais-de-32-caracteres", now });
      const ownApp = createApp(testEnv, { twoFactor: own });
      const agent = request.agent(ownApp);
      await agent.post("/api/auth/signup").send(user(1)).expect(201);
      await agent.post("/api/auth/signin").send(password()).expect(200);
      agent.set("X-CSRF-Token", csrfOf(agent));
      const { secret } = (await agent.post("/api/auth/2fa/setup").send({ password: PW }).expect(200)).body;
      await agent.post("/api/auth/2fa/enable").send({ code: codeAt(secret, now()) }).expect(200);
      // Outra instância com a MESMA chave própria (e outro JWT_SECRET) lê o segredo; uma sem ela não.
      advance();
      const sameKey = createTwoFactor({ jwtSecret: "outro-jwt-secret-bem-diferente-com-32-caracteres", encryptionKey: "chave-propria-do-2fa-com-mais-de-32-caracteres", now });
      const userId = (await User.findOne({ email: user(1).email }))._id;
      assert.equal(await sameKey.check(userId, codeAt(secret, now())), true);
      advance();
      const jwtOnly = createTwoFactor({ jwtSecret: testEnv.jwtSecret, now });
      assert.equal(await jwtOnly.check(userId, codeAt(secret, now())), false, "só com o JWT_SECRET não decifra");
    });
  });
});
