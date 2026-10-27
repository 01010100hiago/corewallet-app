import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signupSchema,
  signupFormSchema,
  signinSchema,
  transactionSchema,
  parseToCents,
  formatCents,
  evaluatePassword,
} from "../src/index.js";

test("parseToCents aceita formatos brasileiros e simples", () => {
  assert.equal(parseToCents("12,50"), 1250);
  assert.equal(parseToCents("12.5"), 1250);
  assert.equal(parseToCents("1.234,56"), 123456);
  assert.equal(parseToCents("7"), 700);
  assert.equal(parseToCents(" 0,05 "), 5);
  assert.equal(parseToCents(10.1), 1010);
});

test("parseToCents recusa lixo", () => {
  const bad = ["", "abc", "1,234", "12,5,0", "-3", "1e3", "NaN", "10.50,00", "1.23,45", "1.2345,67", ".5,00", 19.999, 0.001, null, undefined, {}, [], NaN, Infinity];
  for (const value of bad) {
    assert.equal(parseToCents(value), null, String(value));
  }
});

test("parseToCents aceita milhar bem formado e número com 2 casas", () => {
  assert.equal(parseToCents("1.234.567,89"), 123456789);
  assert.equal(parseToCents("1234,5"), 123450);
  assert.equal(parseToCents(19.99), 1999);
  assert.equal(parseToCents(0.1 + 0.2), 30);
});

test("formatCents formata em reais", () => {
  assert.match(formatCents(123456), /1\.234,56/);
  assert.match(formatCents(5), /0,05/);
});

test("signup normaliza nome e email", () => {
  const out = signupSchema.parse({ name: "  maria  da silva ", email: " Maria@Exemplo.COM ", password: "x9Lm2Qz7" });
  assert.equal(out.name, "Maria da Silva");
  assert.equal(out.email, "maria@exemplo.com");
});

test("signup recusa nome curto, email ruim e senha curta ou longa", () => {
  const base = { name: "Maria", email: "m@e.com", password: "x9Lm2Qz7" };
  assert.equal(signupSchema.safeParse({ ...base, name: "Al" }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, email: "sem-arroba" }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, password: "1234567" }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, password: "a".repeat(73) }).success, false);
});

test("signup recusa tipos que não são texto (objetos de NoSQL injection)", () => {
  const base = { name: "Maria", email: "m@e.com", password: "x9Lm2Qz7" };
  assert.equal(signupSchema.safeParse({ ...base, email: { $gt: "" } }).success, false);
  assert.equal(signinSchema.safeParse({ email: "m@e.com", password: { $ne: null } }).success, false);
});

test("formulário de cadastro exige senhas iguais", () => {
  const data = { name: "Maria", email: "m@e.com", password: "x9Lm2Qz7", confirmPassword: "outra-senha" };
  const res = signupFormSchema.safeParse(data);
  assert.equal(res.success, false);
  assert.deepEqual(res.error.issues[0].path, ["confirmPassword"]);
  assert.equal(signupFormSchema.safeParse({ ...data, confirmPassword: "x9Lm2Qz7" }).success, true);
});

test("transaction converte reais em centavos", () => {
  const out = transactionSchema.parse({ value: "19,90", description: "Almoço", type: "output" });
  assert.deepEqual(out, { value: 1990, description: "Almoço", type: "output" });
});

test("transaction recusa valor zero, negativo, enorme e tipo desconhecido", () => {
  const ok = { value: "10", description: "Teste", type: "input" };
  assert.equal(transactionSchema.safeParse({ ...ok, value: "0" }).success, false);
  assert.equal(transactionSchema.safeParse({ ...ok, value: "-5" }).success, false);
  assert.equal(transactionSchema.safeParse({ ...ok, value: "999999999999" }).success, false);
  assert.equal(transactionSchema.safeParse({ ...ok, type: "transfer" }).success, false);
  assert.equal(transactionSchema.safeParse({ ...ok, description: "ab" }).success, false);
});

test("nome mantém da/de/do/dos/das/e em minúsculas", () => {
  const out = signupSchema.parse({ name: "MARIA DA SILVA E SOUSA", email: "m@e.com", password: "x9Lm2Qz7" });
  assert.equal(out.name, "MARIA da SILVA e SOUSA");
  const out2 = signupSchema.parse({ name: "joão dos santos", email: "m@e.com", password: "x9Lm2Qz7" });
  assert.equal(out2.name, "João dos Santos");
});

test("limite da senha é em bytes, porque o bcrypt corta em 72 bytes", () => {
  const base = { name: "Maria", email: "m@e.com" };
  const fits = (password) => signupSchema.safeParse({ ...base, password }).success;
  // "éa" = 3 bytes: 24 repetições = 72 bytes (cabe), 25 = 75 (não cabe)
  assert.equal(fits("éa".repeat(24)), true);
  assert.equal(fits("éa".repeat(25)), false);
  // só ASCII: 72 caracteres cabem, 73 não
  assert.equal(fits("ab9x".repeat(18)), true);
  assert.equal(fits("ab9x".repeat(18) + "z"), false);
  // 20 emojis = 80 bytes, embora sejam só 20 caracteres
  assert.equal(fits("😀".repeat(20)), false);
  assert.equal(signinSchema.safeParse({ email: "m@e.com", password: "😀".repeat(20) }).success, false);
});

test("cadastro recusa senhas comuns e sequências, o login não", () => {
  const base = { name: "Maria", email: "m@e.com" };
  for (const password of ["12345678", "SENHA123", "password", "aaaaaaaa", "abcdefgh", "87654321", "Qwerty123"]) {
    const res = signupSchema.safeParse({ ...base, password });
    assert.equal(res.success, false, password);
  }
  assert.equal(signupSchema.safeParse({ ...base, password: "cavalo-azul-77" }).success, true);
  assert.equal(signinSchema.safeParse({ email: "m@e.com", password: "12345678" }).success, true);
});

test("evaluatePassword dá nota e diz o que falta", () => {
  assert.equal(evaluatePassword("").score, 0);
  assert.equal(evaluatePassword("abc").score, 1);
  assert.equal(evaluatePassword("12345678").acceptable, false);
  const ok = evaluatePassword("cavalo azul");
  assert.equal(ok.acceptable, true);
  assert.equal(ok.score, 2);
  assert.equal(evaluatePassword("cavalo-77").score, 3);
  const strong = evaluatePassword("cavalo-azul-77-bravo");
  assert.equal(strong.score, 4);
  assert.equal(strong.label, "Forte");
  assert.deepEqual(strong.checks.map((c) => c.id), ["length", "common", "mix", "long"]);
});

test("medidor reprova senha acima de 72 bytes, como a API", () => {
  const long = "a1".repeat(40);
  const res = evaluatePassword(long);
  assert.equal(res.acceptable, false);
  assert.equal(res.score, 1);
  assert.ok(res.checks.some((c) => c.id === "bytes" && !c.ok));
  assert.equal(signupSchema.safeParse({ name: "Maria", email: "m@e.com", password: long }).success, false);
  assert.ok(!evaluatePassword("cavalo-azul-77").checks.some((c) => c.id === "bytes"));
});
