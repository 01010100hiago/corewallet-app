import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import RateLimitHit from "../src/models/RateLimitHit.js";
import { connectDb, disconnectDb } from "../src/config/database.js";
import User from "../src/models/User.js";
import RefreshSession from "../src/models/RefreshSession.js";
import { googleSignin } from "../src/services/authService.js";
import { createEmailVerification } from "../src/services/emailVerificationService.js";
import { testEnv, user, testDbUri } from "../support/helpers.js";

const uri = testDbUri("email");

describe("confirmação de email", { skip: !uri && "defina TEST_DATABASE_URI para rodar" }, () => {
  let clock = 1_800_000_000_000;
  const now = () => clock;
  let outbox;
  let failing = false;
  const mailer = {
    enabled: true,
    async send(message) {
      if (failing) throw new Error("SMTP fora do ar");
      outbox.push(message);
    },
  };
  const emailVerification = createEmailVerification({ mailer, webOrigin: "https://carteira.exemplo.com/", now });
  const required = { ...testEnv, emailVerificationRequired: true };
  const app = createApp(required, { mailer, emailVerification });

  // O reenvio responde antes de trabalhar: espera o trabalho em segundo plano terminar.
  const flush = () => new Promise((r) => setTimeout(r, 150));
  const tokenOf = (message) => /verify-email\?token=([\w-]+)/.exec(message.text)[1];

  before(async () => {
    await connectDb(uri);
    if (!mongoose.connection.name.endsWith("_test")) {
      await disconnectDb();
      throw new Error("TEST_DATABASE_URI precisa apontar para um banco terminado em _test");
    }
    await Promise.all([User, RefreshSession].map((m) => m.init()));
  });
  beforeEach(async () => {
    outbox = [];
    failing = false;
    await Promise.all([User, RefreshSession, RateLimitHit].map((m) => m.deleteMany({})));
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });

  const signup = (n = 1, over = {}) => request(app).post("/api/auth/signup").send({ ...user(n), ...over });
  const signin = (n = 1, over = {}) => request(app).post("/api/auth/signin").send({ email: user(n).email, password: user(n).password, ...over });

  test("a configuração avisa o front que a confirmação é exigida", async () => {
    assert.equal((await request(app).get("/api/auth/config")).body.emailVerification, true);
    assert.equal((await request(createApp(testEnv)).get("/api/auth/config")).body.emailVerification, false);
  });

  test("o cadastro envia um email com o link e responde que a confirmação é necessária", async () => {
    const res = await signup().expect(201);
    assert.equal(res.body.verificationRequired, true);
    assert.equal(res.body.verificationSent, true);
    assert.equal(res.body.emailVerified, false);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, user(1).email);
    assert.match(outbox[0].text, /https:\/\/carteira\.exemplo\.com\/verify-email\?token=[\w-]{40,}/);
    assert.ok(!outbox[0].text.includes("//verify"), "sem barra duplicada");
    assert.match(outbox[0].html, /<a href="https:\/\/carteira\.exemplo\.com\/verify-email\?token=/);
  });

  test("o banco guarda só o hash do link, nunca o token", async () => {
    await signup().expect(201);
    const token = tokenOf(outbox[0]);
    const raw = await User.collection.findOne({ email: user(1).email });
    assert.match(raw.emailVerifyHash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(raw).includes(token));
    assert.ok(raw.emailVerifyExpires > new Date(now()));
  });

  test("sem confirmar o email, a senha certa NÃO abre a sessão (403 com código); senha errada continua 401 genérico", async () => {
    await signup().expect(201);
    const blocked = await signin().expect(403);
    assert.equal(blocked.body.code, "email_not_verified");
    assert.deepEqual(blocked.headers["set-cookie"] ?? [], []);
    const wrong = await signin(1, { password: "senha-errada-123" }).expect(401);
    assert.equal(wrong.body.message, "Email ou senha incorretos");
    assert.equal(wrong.body.code, undefined);
    const nobody = await request(app).post("/api/auth/signin").send({ email: "ninguem@exemplo.com", password: "qualquer-senha-1" }).expect(401);
    assert.equal(nobody.body.message, "Email ou senha incorretos");
  });

  test("o link confirma o email e depois dá para entrar; o link vale uma vez só", async () => {
    await signup().expect(201);
    const token = tokenOf(outbox[0]);
    await request(app).post("/api/auth/email/verify").send({ token, password: user(1).password }).expect(200).then((r) => assert.equal(r.body.verified, true));
    assert.equal((await signin().expect(200)).body.emailVerified, true);
    const again = await request(app).post("/api/auth/email/verify").send({ token, password: user(1).password }).expect(400);
    assert.match(again.body.message, /inválido ou vencido/);
    const raw = await User.collection.findOne({ email: user(1).email });
    assert.equal(raw.emailVerifyHash, undefined, "o hash some depois de usado");
  });

  test("link adulterado, inventado, de formato errado ou vencido é recusado", async () => {
    await signup().expect(201);
    const token = tokenOf(outbox[0]);
    const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1);
    for (const bad of [flipped, "x".repeat(43), token.slice(0, -3)]) await request(app).post("/api/auth/email/verify").send({ token: bad, password: user(1).password }).expect(400);
    for (const bad of [{}, { token: "curto" }, { token: { $ne: "" } }, { token: 12345 }, { token }, { token, password: "" }, { token, password: { $ne: "" } }]) await request(app).post("/api/auth/email/verify").send(bad).expect(422);
    clock += 24 * 60 * 60 * 1000 + 1000;
    await request(app).post("/api/auth/email/verify").send({ token, password: user(1).password }).expect(400);
    await signin().expect(403);
  });

  test("o link sozinho não confirma: exige a senha da conta; senha errada é recusada (403) e NÃO gasta o link", async () => {
    await signup().expect(201);
    const token = tokenOf(outbox[0]);
    const wrong = await request(app).post("/api/auth/email/verify").send({ token, password: "senha-errada-123" }).expect(403);
    assert.equal(wrong.body.code, "wrong_password");
    assert.equal((await User.collection.findOne({ email: user(1).email })).emailVerified, false);
    await signin().expect(403);
    await request(app).post("/api/auth/email/verify").send({ token, password: user(1).password }).expect(200);
    await signin().expect(200);
  });

  test("reenviar: sempre 202 com a mesma mensagem, exista a conta ou não; um novo link invalida o antigo", async () => {
    await signup().expect(201);
    const old = tokenOf(outbox[0]);
    clock += 61_000;
    const known = await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    const unknown = await request(app).post("/api/auth/email/resend").send({ email: "ninguem@exemplo.com" }).expect(202);
    await flush();
    assert.deepEqual(known.body, unknown.body);
    assert.equal(outbox.length, 2);
    assert.equal(outbox[1].to, user(1).email);
    await request(app).post("/api/auth/email/verify").send({ token: old, password: user(1).password }).expect(400);
    await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[1]), password: user(1).password }).expect(200);
    // Já confirmado: nada a reenviar, e a resposta continua igual.
    clock += 61_000;
    const done = await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    await flush();
    assert.deepEqual(done.body, known.body);
    assert.equal(outbox.length, 2);
  });

  test("reenviar tem intervalo de 1 minuto por conta", async () => {
    await signup().expect(201);
    await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    await flush();
    assert.equal(outbox.length, 1, "logo depois do cadastro, não manda outro");
    clock += 59_000;
    await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    await flush();
    assert.equal(outbox.length, 1);
    clock += 2_000;
    await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    await flush();
    assert.equal(outbox.length, 2);
  });

  test("se o email não puder ser enviado, o cadastro vale e o envio pode ser refeito", async () => {
    failing = true;
    const res = await signup().expect(201);
    assert.equal(res.body.verificationSent, false);
    assert.equal(await User.countDocuments({ email: user(1).email }), 1);
    failing = false;
    clock += 61_000;
    await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    await flush();
    assert.equal(outbox.length, 1);
    await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[0]), password: user(1).password }).expect(200);
  });

  test("o email só usa o primeiro nome, só com letras (nada de links nem marcação vindos de quem digitou)", async () => {
    await signup(1, { name: 'Ana <img src=x onerror="alert(1)">' }).expect(201);
    assert.ok(!outbox[0].html.includes("<img"));
    assert.ok(outbox[0].html.includes("Olá, Ana!"));
    await signup(2, { name: "http://golpe.example/entre agora" }).expect(201);
    assert.ok(!outbox[1].text.includes("golpe.example"), "o texto livre do nome não vai no email");
    assert.match(outbox[1].text, /^Olá, Httpgolpeexampleentre!/);
    await signup(3, { name: "123 456 789" }).expect(201);
    assert.match(outbox[2].text, /^Olá!/);
  });

  test("falha ao enviar o email nunca vira erro no reenvio nem muda a resposta", async () => {
    await signup().expect(201);
    clock += 61_000;
    failing = true;
    const ok = await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
    const unknown = await request(app).post("/api/auth/email/resend").send({ email: "ninguem@exemplo.com" }).expect(202);
    assert.deepEqual(ok.body, unknown.body);
    await flush();
  });

  test("pedidos de reenvio em paralelo mandam um email só (o intervalo é atômico)", async () => {
    await signup().expect(201);
    clock += 61_000;
    await Promise.all(Array.from({ length: 8 }, () => request(app).post("/api/auth/email/resend").send({ email: user(1).email })));
    await flush();
    assert.equal(outbox.length, 2, "1 do cadastro + 1 do reenvio");
  });

  test("o mesmo email só recebe 5 pedidos de reenvio por hora, de qualquer IP", async () => {
    const limited = createApp({ ...required, rateLimits: {} }, { mailer, emailVerification });
    await request(limited).post("/api/auth/signup").send(user(1)).expect(201);
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await request(limited).post("/api/auth/email/resend").send({ email: user(1).email })).status);
    assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429, 429]);
    // Outro email não é afetado.
    await request(limited).post("/api/auth/email/resend").send({ email: "outra@exemplo.com" }).expect(202);
  });

  describe("reserva do email por quem não é o dono", () => {
    test("quem cadastra o email de verdade assume a conta reservada e nunca confirmada; o invasor perde o acesso", async () => {
      await signup(1, { password: "senha-do-invasor-77" }).expect(201);
      const squatterLink = tokenOf(outbox[0]);
      // O dono de verdade se cadastra com o mesmo email.
      const owner = await signup(1, { name: "Dono Verdadeiro", password: "senha-do-dono-99" }).expect(201);
      assert.equal(owner.body.verificationRequired, true);
      assert.equal(outbox.length, 2);
      assert.equal(outbox[1].to, user(1).email);
      // O link do invasor morreu; só o link novo (que chega ao dono) confirma.
      await request(app).post("/api/auth/email/verify").send({ token: squatterLink, password: "senha-do-invasor-77" }).expect(400);
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[1]), password: "senha-do-dono-99" }).expect(200);
      await signin(1, { password: "senha-do-invasor-77" }).expect(401);
      const ok = await signin(1, { password: "senha-do-dono-99" }).expect(200);
      assert.equal(ok.body.name, "Dono Verdadeiro");
    });

    test("conta já confirmada, conta antiga (sem link pendente) e conta do Google NÃO podem ser assumidas", async () => {
      await signup(1).expect(201);
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[0]), password: user(1).password }).expect(200);
      await signup(1, { password: "senha-do-invasor-77" }).expect(409);
      await signin(1).expect(200); // a senha original continua valendo

      // Conta de antes da confirmação existir: não confirmada, mas sem link pendente.
      await User.collection.insertOne({ name: "Antigo", email: "antigo@exemplo.com", passwordHash: "x", provider: "password", emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
      await request(app).post("/api/auth/signup").send({ name: "Invasor Tentando", email: "antigo@exemplo.com", password: "senha-do-invasor-77" }).expect(409);
      assert.equal((await User.collection.findOne({ email: "antigo@exemplo.com" })).passwordHash, "x");

      await User.create({ name: "Gabi Google", email: "gabi@exemplo.com", googleId: "g-1", provider: "google", emailVerified: true });
      await request(app).post("/api/auth/signup").send({ name: "Invasor Tentando", email: "gabi@exemplo.com", password: "senha-do-invasor-77" }).expect(409);
    });

    test("pré-sequestro: a vítima clica no link do invasor e digita a SUA senha; a conta NÃO é confirmada", async () => {
      await signup(1, { password: "senha-do-invasor-77" }).expect(201);
      const link = tokenOf(outbox[0]);
      const attempt = await request(app).post("/api/auth/email/verify").send({ token: link, password: user(1).password }).expect(403);
      assert.equal(attempt.body.code, "wrong_password");
      const raw = await User.collection.findOne({ email: user(1).email });
      assert.equal(raw.emailVerified, false);
      assert.ok(raw.emailVerifyHash, "o link continua pendente");
      // O invasor também não entra: a conta não foi confirmada.
      assert.equal((await signin(1, { password: "senha-do-invasor-77" }).expect(403)).body.code, "email_not_verified");
      // A vítima cria a conta dela de verdade: assume a reserva e confirma com a própria senha.
      await signup(1, { name: "Vítima", password: "senha-da-vitima-55" }).expect(201);
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[1]), password: "senha-da-vitima-55" }).expect(200);
      await signin(1, { password: "senha-do-invasor-77" }).expect(401);
      assert.equal((await signin(1, { password: "senha-da-vitima-55" }).expect(200)).body.name, "Vítima");
    });

    test("o cadastro do dono no meio da conferência não deixa o link antigo confirmar a senha do invasor", async () => {
      await signup(1, { password: "senha-do-invasor-77" }).expect(201);
      const squatterLink = tokenOf(outbox[0]);
      await signup(1, { name: "Dono", password: "senha-do-dono-99" }).expect(201);
      // Link e senha do invasor não valem mais; nem o link novo com a senha do invasor.
      await request(app).post("/api/auth/email/verify").send({ token: squatterLink, password: "senha-do-invasor-77" }).expect(400);
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[1]), password: "senha-do-invasor-77" }).expect(403);
      assert.equal((await User.collection.findOne({ email: user(1).email })).emailVerified, false);
    });

    test("conta antiga não confirmada que recebe um link pelo reenvio NÃO vira assumível por um cadastro novo", async () => {
      const passwordHash = await bcrypt.hash("senha-antiga-77", 4);
      await User.collection.insertOne({ name: "Antigo", email: "antigo@exemplo.com", passwordHash, provider: "password", emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
      await request(app).post("/api/auth/email/resend").send({ email: "antigo@exemplo.com" }).expect(202);
      await flush();
      assert.equal(outbox.length, 1);
      const raw = await User.collection.findOne({ email: "antigo@exemplo.com" });
      assert.ok(raw.emailVerifyHash, "recebeu o link");
      assert.equal(raw.pendingSignup, undefined);
      await request(app).post("/api/auth/signup").send({ name: "Invasor", email: "antigo@exemplo.com", password: "senha-do-invasor-77" }).expect(409);
      assert.equal((await User.collection.findOne({ email: "antigo@exemplo.com" })).passwordHash, passwordHash, "a senha não foi trocada");
      // O dono, que sabe a senha, confirma e entra.
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[0]), password: "senha-antiga-77" }).expect(200);
      await request(app).post("/api/auth/signin").send({ email: "antigo@exemplo.com", password: "senha-antiga-77" }).expect(200);
    });

    test("corrida de verdade: o dono se cadastra ENTRE a conferência da senha e a gravação; a confirmação não vale", async () => {
      await signup(1, { password: "senha-do-invasor-77" }).expect(201);
      const squatterLink = tokenOf(outbox[0]);
      // Força a interposição: depois que a conferência leu a conta do invasor, o dono assume a conta.
      const realFindOne = User.findOne;
      let interleaved = false;
      User.findOne = function patched(...args) {
        const query = realFindOne.apply(this, args);
        if (interleaved || !args[0]?.emailVerifyHash) return query;
        interleaved = true;
        const realThen = query.then.bind(query);
        query.then = (resolve, reject) =>
          realThen(async (doc) => {
            User.findOne = realFindOne;
            await signup(1, { name: "Dono", password: "senha-do-dono-99" });
            return doc;
          }).then(resolve, reject);
        return query;
      };
      try {
        const res = await request(app).post("/api/auth/email/verify").send({ token: squatterLink, password: "senha-do-invasor-77" });
        assert.equal(res.status, 400, "a conta mudou no meio: o link antigo não confirma");
      } finally {
        User.findOne = realFindOne;
      }
      assert.ok(interleaved, "a interposição aconteceu");
      assert.equal((await User.collection.findOne({ email: user(1).email })).emailVerified, false);
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[1]), password: "senha-do-dono-99" }).expect(200);
    });

    test("cada link aceita 5 senhas erradas; na quinta ele morre, mesmo com a senha certa depois", async () => {
      await signup().expect(201);
      const token = tokenOf(outbox[0]);
      for (let i = 0; i < 4; i++) await request(app).post("/api/auth/email/verify").send({ token, password: `senha-errada-${i}-x` }).expect(403);
      await request(app).post("/api/auth/email/verify").send({ token, password: "senha-errada-final" }).expect(400);
      await request(app).post("/api/auth/email/verify").send({ token, password: user(1).password }).expect(400);
      assert.equal((await User.collection.findOne({ email: user(1).email })).emailVerifyHash, undefined);
      // Um link novo (reenvio) recomeça a contagem.
      clock += 61_000;
      await request(app).post("/api/auth/email/resend").send({ email: user(1).email }).expect(202);
      await flush();
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[1]), password: user(1).password }).expect(200);
    });

    test("login com Google: libera a reserva do invasor, mas nunca apaga conta antiga nem conta confirmada", async () => {
      const profile = { googleId: "g-77", email: user(1).email, name: "Dono Google" };
      await signup(1, { password: "senha-do-invasor-77" }).expect(201);
      const g = await googleSignin(profile, { releaseUnverified: true });
      assert.equal(g.provider, "google");
      assert.equal(await User.countDocuments({ email: user(1).email, provider: "password" }), 0, "a reserva do invasor sumiu");

      // Conta antiga não confirmada, mesmo com link pendente: fica, e o Google recebe 409.
      const passwordHash = await bcrypt.hash("senha-antiga-77", 4);
      await User.collection.insertOne({ name: "Antigo", email: "antigo@exemplo.com", passwordHash, provider: "password", emailVerified: false, emailVerifyHash: "a".repeat(64), createdAt: new Date(), updatedAt: new Date() });
      await assert.rejects(googleSignin({ googleId: "g-78", email: "antigo@exemplo.com", name: "X" }, { releaseUnverified: true }), { status: 409 });
      assert.equal((await User.collection.findOne({ email: "antigo@exemplo.com" })).passwordHash, passwordHash);
    });

    test("depois de confirmada, a conta deixa de ser assumível (o marcador some)", async () => {
      await signup().expect(201);
      assert.equal((await User.collection.findOne({ email: user(1).email })).pendingSignup, true);
      await request(app).post("/api/auth/email/verify").send({ token: tokenOf(outbox[0]), password: user(1).password }).expect(200);
      assert.equal((await User.collection.findOne({ email: user(1).email })).pendingSignup, undefined);
    });

    test("sem a confirmação de email ligada, um cadastro nunca assume conta nenhuma", async () => {
      await signup(1).expect(201);
      const plain = createApp(testEnv, { mailer, emailVerification });
      await request(plain).post("/api/auth/signup").send({ ...user(1), password: "senha-do-invasor-77" }).expect(409);
    });
  });

  test("com a confirmação desligada o cadastro já nasce ativo, e continua entrando quando ela for ligada depois", async () => {
    const plain = createApp(testEnv, { mailer, emailVerification });
    const res = await request(plain).post("/api/auth/signup").send(user(4)).expect(201);
    assert.equal(res.body.emailVerified, true);
    const raw = await User.collection.findOne({ email: user(4).email });
    assert.equal(raw.emailVerified, true);
    assert.equal(raw.pendingSignup, undefined, "não é assumível: não está pendente");
    assert.equal(outbox.length, 0);
    // Ligando a confirmação depois, a conta já ativa entra sem passar pelo link.
    await request(app).post("/api/auth/signin").send({ email: user(4).email, password: user(4).password }).expect(200);
    // E ninguém assume essa conta por um cadastro novo.
    await request(app).post("/api/auth/signup").send({ ...user(4), password: "senha-do-invasor-77" }).expect(409);
  });

  test("contas do Google não passam pela confirmação, e sem a exigência o cadastro não manda email", async () => {
    await User.create({ name: "Gabi Google", email: "gabi@exemplo.com", googleId: "g-1", provider: "google", emailVerified: true });
    // O Google não tem senha: a regra só vale para contas de senha.
    const plain = createApp(testEnv, { mailer, emailVerification });
    const res = await request(plain).post("/api/auth/signup").send(user(3)).expect(201);
    assert.equal(res.body.verificationRequired, undefined);
    assert.equal(outbox.length, 0);
    await request(plain).post("/api/auth/signin").send({ email: user(3).email, password: user(3).password }).expect(200);
    await request(plain).post("/api/auth/email/resend").send({ email: user(3).email }).expect(202);
    assert.equal(outbox.length, 0, "sem a exigência, reenviar não faz nada");
  });
});
