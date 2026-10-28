import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPow } from "../src/services/powService.js";
import { createPowCaptcha } from "../src/services/captchaService.js";
import { createMemoryClaimStore } from "../src/lib/claimStores.js";
import { testEnv } from "../support/helpers.js";

const SECRET = "segredo-do-teste-com-bastante-tamanho-0123456789";
const sha256 = (t) => createHash("sha256").update(t).digest("hex");

// Faz o que o navegador faz: procura o número que dá o hash do desafio.
export function solve(challenge, tamper = {}) {
  let number = 0;
  while (sha256(challenge.salt + number) !== challenge.challenge) number++;
  const payload = { algorithm: challenge.algorithm, challenge: challenge.challenge, number, salt: challenge.salt, signature: challenge.signature, ...tamper };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
const token = (payload) => Buffer.from(JSON.stringify(payload)).toString("base64");

describe("verificação automática (prova de trabalho)", async () => {
  const make = ({ maxUsed, ...over } = {}) => {
    const clock = { t: 1_800_000_000_000 };
    const store = createMemoryClaimStore({ maxUsed, now: () => clock.t });
    const pow = createPow({ secret: SECRET, maxNumber: 500, now: () => clock.t, store, ...over });
    return { pow, clock, store };
  };

  test("o desafio tem o formato esperado, expira e é assinado", async () => {
    const { pow, clock } = make();
    const c = pow.issue();
    assert.deepEqual(Object.keys(c).sort(), ["algorithm", "challenge", "maxnumber", "salt", "signature", "ttl"]);
    assert.equal(c.algorithm, "SHA-256");
    assert.equal(c.maxnumber, 500);
    assert.equal(c.ttl, 300);
    assert.match(c.salt, /^[0-9a-f]{32}\?e=\d+$/);
    assert.equal(Number(c.salt.split("?e=")[1]), clock.t + 300_000);
    assert.match(c.challenge, /^[0-9a-f]{64}$/);
    assert.match(c.signature, /^[0-9a-f]{64}$/);
    // O número secreto não vai junto: só se descobre trabalhando.
    assert.ok(!JSON.stringify(c).includes('"number"'));
  });

  test("resolvido corretamente vale; cada desafio é diferente", async () => {
    const { pow } = make();
    const a = pow.issue();
    const b = pow.issue();
    assert.notEqual(a.challenge, b.challenge);
    assert.notEqual(a.salt, b.salt);
    assert.equal(await pow.verify(solve(a)), "ok");
    assert.equal(await pow.verify(solve(b)), "ok");
  });

  test("só vale uma vez (repetir o mesmo token é recusado)", async () => {
    const { pow, store } = make();
    const t = solve(pow.issue());
    assert.equal(await pow.verify(t), "ok");
    assert.equal(await pow.verify(t), "invalid");
    assert.equal(store.size, 1);
  });

  test("recusa número errado, desafio adulterado, assinatura de outro segredo e campos trocados", async () => {
    const { pow, store } = make();
    const c = pow.issue();
    const good = JSON.parse(Buffer.from(solve(c), "base64").toString());
    assert.equal(await pow.verify(token({ ...good, number: (good.number + 1) % 501 })), "invalid", "número errado");
    assert.equal(await pow.verify(token({ ...good, signature: "0".repeat(64) })), "invalid", "assinatura inventada");
    const other = createPow({ secret: "outro-segredo-completamente-diferente-123456789", maxNumber: 500, now: () => 1_800_000_000_000 });
    assert.equal(await other.verify(solve(c)), "invalid", "desafio de outro servidor");
    // Troca o sal por outro com a mesma validade: hash e assinatura deixam de bater.
    assert.equal(await pow.verify(token({ ...good, salt: `${"a".repeat(32)}?e=${good.salt.split("?e=")[1]}` })), "invalid");
    // Troca o desafio por um que ela mesma calculou, sem assinatura do servidor.
    const forgedSalt = `${"b".repeat(32)}?e=${good.salt.split("?e=")[1]}`;
    const forged = sha256(forgedSalt + 7);
    assert.equal(await pow.verify(token({ algorithm: "SHA-256", salt: forgedSalt, challenge: forged, number: 7, signature: good.signature })), "invalid");
    assert.equal(await pow.verify(token({ algorithm: "SHA-256", salt: forgedSalt, challenge: forged, number: 7, signature: "f".repeat(64) })), "invalid");
    assert.equal(store.size, 0, "nada recusado fica marcado como usado");
    assert.equal(await pow.verify(solve(c)), "ok", "o desafio de verdade continua válido");
  });

  test("vencido é recusado, e o tempo é o do servidor", async () => {
    const { pow, clock } = make();
    const t = solve(pow.issue());
    clock.t += 5 * 60_000 - 1;
    assert.equal(await pow.verify(t), "ok", "ainda dentro do prazo");
    const late = solve(pow.issue());
    clock.t += 5 * 60_000 + 1;
    assert.equal(await pow.verify(late), "invalid", "passou do prazo");
  });

  test("número fora do intervalo, tipos errados e lixo são recusados sem estourar", async () => {
    const { pow } = make();
    const good = JSON.parse(Buffer.from(solve(pow.issue()), "base64").toString());
    const bad = [
      { ...good, number: -1 },
      { ...good, number: 501 },
      { ...good, number: 1.5 },
      { ...good, number: "7" },
      { ...good, number: null },
      { ...good, algorithm: "MD5" },
      { ...good, salt: 5 },
      { ...good, challenge: "xyz" },
      { ...good, signature: ["a"] },
      { ...good, salt: "sem-formato" },
      null,
      [],
      "texto",
      42,
    ];
    for (const payload of bad) assert.equal(await pow.verify(token(payload)), "invalid", JSON.stringify(payload));
    for (const raw of ["", "não-é-base64!!", Buffer.from("{ quebrado").toString("base64"), "a".repeat(5000)]) assert.equal(await pow.verify(raw), "invalid");
  });

  test("passou do teto de desafios guardados: falha fechada, e os vencidos liberam espaço", async () => {
    const { pow, clock, store } = make({ maxUsed: 5 });
    for (let i = 0; i < 5; i++) assert.equal(await pow.verify(solve(pow.issue())), "ok");
    assert.equal(store.size, 5);
    const extra = solve(pow.issue());
    assert.equal(await pow.verify(extra), "unavailable", "cheio: não esquece um desafio usado para abrir vaga");
    assert.equal(store.size, 5);
    // Quando os usados vencem (eles já não valem mesmo), sobra espaço e o desafio novo passa.
    clock.t += 5 * 60_000 + 10;
    const fresh = solve(pow.issue());
    assert.equal(await pow.verify(fresh), "ok");
    assert.equal(store.size, 1, "os vencidos foram varridos");
  });

  test("createPowCaptcha segue a mesma interface do Turnstile", async () => {
    const captcha = createPowCaptcha({ secret: SECRET, maxNumber: 300 });
    assert.equal(captcha.enabled, true);
    assert.equal(captcha.provider, "pow");
    const c = captcha.challenge();
    assert.equal(await captcha.verify(solve(c)), "ok");
    assert.equal(await captcha.verify(solve(c)), "invalid");
    assert.equal(await captcha.verify("lixo"), "invalid");
  });
});

describe("rotas com a verificação automática (sem banco)", () => {
  const env = { ...testEnv, pow: { secret: SECRET, maxNumber: 300 } };
  // Sem banco: contadores e desafios usados na memória do processo.
  const memory = () => ({ powStore: createMemoryClaimStore(), rateLimitStoreFor: () => undefined });

  test("GET /auth/config anuncia o provedor, sem segredo", async () => {
    const res = await request(createApp(env, memory())).get("/api/auth/config").expect(200);
    assert.deepEqual(res.body.captcha, { provider: "pow" });
    assert.ok(!JSON.stringify(res.body).includes(SECRET));
  });

  test("GET /auth/challenge devolve um desafio novo a cada pedido, sem cache", async () => {
    const app = createApp(env, memory());
    const a = await request(app).get("/api/auth/challenge").expect(200);
    const b = await request(app).get("/api/auth/challenge").expect(200);
    assert.notEqual(a.body.challenge, b.body.challenge);
    assert.equal(a.body.maxnumber, 300);
    assert.equal(a.headers["cache-control"], "no-store");
    assert.ok(!("number" in a.body));
  });

  test("sem a verificação ligada a rota não existe (404) e a config diz captcha null", async () => {
    const app = createApp(testEnv);
    await request(app).get("/api/auth/challenge").expect(404);
    assert.equal((await request(app).get("/api/auth/config").expect(200)).body.captcha, null);
  });

  test("com Turnstile configurado a rota de desafio também não existe", async () => {
    const app = createApp({ ...testEnv, turnstile: { secret: "s", siteKey: "k" } });
    await request(app).get("/api/auth/challenge").expect(404);
    assert.deepEqual((await request(app).get("/api/auth/config")).body.captcha, { provider: "turnstile", siteKey: "k" });
  });

  test("cadastro e login exigem o token; token errado é 403; sem token é 400", async () => {
    const app = createApp(env, memory());
    const body = { name: "Ana Lima", email: "ana@exemplo.com", password: "cavalo-azul-77" };
    assert.equal((await request(app).post("/api/auth/signup").send(body)).status, 400);
    assert.equal((await request(app).post("/api/auth/signin").send({ email: body.email, password: body.password })).status, 400);
    assert.equal((await request(app).post("/api/auth/signup").send({ ...body, captchaToken: "lixo" })).status, 403);
    const c = (await request(app).get("/api/auth/challenge")).body;
    const wrong = solve(c, { number: 0 === JSON.parse(Buffer.from(solve(c), "base64").toString()).number ? 1 : 0 });
    assert.equal((await request(app).post("/api/auth/signin").send({ email: body.email, password: body.password, captchaToken: wrong })).status, 403);
  });

  test("o limite de pedidos de desafio vale por IP", async () => {
    const app = createApp({ ...env, rateLimits: { challenge: { windowMs: 60_000, limit: 3 } } }, memory());
    for (let i = 0; i < 3; i++) await request(app).get("/api/auth/challenge").expect(200);
    const blocked = await request(app).get("/api/auth/challenge");
    assert.equal(blocked.status, 429);
  });
});
