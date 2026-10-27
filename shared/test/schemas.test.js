import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signupSchema,
  signupFormSchema,
  signinSchema,
  transactionSchema,
  transactionFormSchema,
  transactionUpdateSchema,
  listQuerySchema,
  CATEGORIES,
  isCategoryOf,
  categoryLabel,
  ALL_CATEGORY_IDS,
  isMonthKey,
  monthRange,
  monthKeyOf,
  dayKeyOf,
  shiftMonth,
  monthLabel,
  categoryOptions,
  isCustomCategoryId,
  categoryNameSchema,
  newCategorySchema,
  MAX_CUSTOM_CATEGORIES_PER_TYPE,
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
  assert.deepEqual(out, { value: 1990, description: "Almoço", type: "output", category: "outros" });
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

test("categoria precisa combinar com o tipo, e o padrão é outros", () => {
  const base = { value: "10", description: "Teste" };
  assert.equal(transactionSchema.parse({ ...base, type: "output" }).category, "outros");
  assert.equal(transactionSchema.parse({ ...base, type: "output", category: "mercado" }).category, "mercado");
  assert.equal(transactionSchema.parse({ ...base, type: "input", category: "salario" }).category, "salario");
  const bad = transactionSchema.safeParse({ ...base, type: "output", category: "salario" });
  assert.equal(bad.success, false);
  assert.equal(bad.error.issues[0].path[0], "category");
  assert.equal(transactionSchema.safeParse({ ...base, type: "input", category: "mercado" }).success, false);
  for (const category of ["inexistente", "", 7, null, { $ne: 1 }]) {
    assert.equal(transactionSchema.safeParse({ ...base, type: "output", category }).success, false, JSON.stringify(category));
  }
});

test("o formulário e a edição não têm tipo e ignoram campos extras", () => {
  const out = transactionFormSchema.parse({ value: "1,5", description: "Café", category: "lazer", type: "input", userId: "x" });
  assert.deepEqual(out, { value: 150, description: "Café", category: "lazer" });
  // Na edição, sem categoria é erro (o padrão apagaria a categoria que já existia).
  assert.equal(transactionUpdateSchema.safeParse({ value: "1", description: "Café" }).success, false);
  assert.equal(transactionUpdateSchema.safeParse({ value: "1", description: "Café", category: undefined }).success, false);
  assert.equal(transactionUpdateSchema.parse({ value: "1", description: "Café", category: "lazer" }).category, "lazer");
});

test("categorias: sem repetição dentro do tipo, rótulos e consulta", () => {
  for (const list of Object.values(CATEGORIES)) {
    assert.equal(new Set(list.map((c) => c.id)).size, list.length);
    assert.ok(list.some((c) => c.id === "outros"));
  }
  assert.equal(isCategoryOf("output", "mercado"), true);
  assert.equal(isCategoryOf("input", "mercado"), false);
  assert.equal(isCategoryOf("transfer", "outros"), false);
  assert.equal(isCategoryOf("output", undefined), false);
  assert.equal(categoryLabel("output", "contas"), "Contas e serviços");
  assert.equal(categoryLabel("input", "freelance"), "Renda extra");
  assert.equal(categoryLabel("output", "outros"), "Outras despesas");
  assert.equal(categoryLabel("input", "outros"), "Outras receitas");
  assert.equal(categoryLabel("output", "nao-existe"), "Outros");
  assert.ok(ALL_CATEGORY_IDS.includes("salario") && ALL_CATEGORY_IDS.includes("moradia"));
});

test("mês: formato, limites em Brasília, ida e volta", () => {
  assert.equal(isMonthKey("2026-10"), true);
  for (const bad of ["2026-13", "2026-00", "26-10", "2026-1", "1999-12", "2101-01", "2026-10-01", 202610, null, undefined, "abc"]) {
    assert.equal(isMonthKey(bad), false, String(bad));
  }
  const { start, end } = monthRange("2026-10");
  assert.equal(start.toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(monthRange("2026-12").end.toISOString(), "2027-01-01T03:00:00.000Z");
  assert.equal(monthRange("lixo"), null);

  assert.equal(monthKeyOf("2026-11-01T01:30:00Z"), "2026-10");
  assert.equal(monthKeyOf("2026-11-01T03:00:00Z"), "2026-11");
  // O dia também é o de Brasília: 02:59 UTC ainda é o dia anterior, 03:00 UTC já é o seguinte.
  assert.equal(dayKeyOf("2026-11-01T02:59:59Z"), "2026-10-31");
  assert.equal(dayKeyOf("2026-11-01T03:00:00Z"), "2026-11-01");
  assert.equal(dayKeyOf("2027-01-01T02:00:00Z"), "2026-12-31");
  assert.equal(monthKeyOf(monthRange("2026-03").start), "2026-03");
  assert.equal(monthKeyOf(new Date(monthRange("2026-03").end.getTime() - 1)), "2026-03");

  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-10", 0), "2026-10");
  assert.equal(shiftMonth("2026-10", -13), "2025-09");
  assert.equal(monthLabel("2026-03"), "março de 2026");
});

test("consulta de listagem aceita só month válido", () => {
  assert.deepEqual(listQuerySchema.parse({}), {});
  assert.deepEqual(listQuerySchema.parse({ month: "2026-10" }), { month: "2026-10" });
  assert.equal(listQuerySchema.safeParse({ month: "2026-13" }).success, false);
  assert.equal(listQuerySchema.safeParse({ month: { $ne: 1 } }).success, false);
});

const PETS = "a1b2c3d4e5f60718293a4b5c";

test("categorias próprias: reconhecimento do id, rótulo e opções por tipo", () => {
  assert.equal(isCustomCategoryId(PETS), true);
  for (const bad of ["mercado", "", PETS.toUpperCase(), PETS + "0", PETS.slice(1), 123, null, undefined, { $ne: 1 }]) {
    assert.equal(isCustomCategoryId(bad), false, String(bad));
  }
  assert.equal(MAX_CUSTOM_CATEGORIES_PER_TYPE, 30);
  const custom = [{ id: PETS, type: "output", name: "Pets" }, { id: "b".repeat(24), type: "input", name: "Bicos" }];
  assert.equal(categoryLabel("output", PETS, custom), "Pets");
  assert.equal(categoryLabel("input", PETS, custom), "Outros", "categoria de saída não rotula uma entrada");
  assert.equal(categoryLabel("output", "mercado", custom), "Supermercado");
  assert.equal(categoryLabel("output", "c".repeat(24), custom), "Outros");
  const out = categoryOptions("output", custom);
  assert.deepEqual(out.at(-1), { id: PETS, label: "Pets", custom: true });
  assert.ok(out.slice(0, -1).every((o) => o.custom === false));
  assert.ok(!out.some((o) => o.label === "Bicos"));
  assert.equal(categoryOptions("input", custom).at(-1).label, "Bicos");
});

test("lançamento aceita id de categoria própria (a API confere se existe), mas não lixo", () => {
  const base = { value: "10", description: "Ração" };
  assert.equal(transactionSchema.parse({ ...base, type: "output", category: PETS }).category, PETS);
  assert.equal(transactionUpdateSchema.parse({ ...base, category: PETS }).category, PETS);
  for (const category of ["nao-existe", PETS + "0", PETS.toUpperCase(), "", 5, null, { $ne: 1 }]) {
    assert.equal(transactionSchema.safeParse({ ...base, type: "output", category }).success, false, JSON.stringify(category));
    assert.equal(transactionUpdateSchema.safeParse({ ...base, category }).success, false, JSON.stringify(category));
  }
});

test("nome de categoria: limpa os espaços e recusa o que não é nome", () => {
  assert.equal(categoryNameSchema.parse("  Aulas   de  violão "), "Aulas de violão");
  assert.equal(categoryNameSchema.parse("Mãe & filhos"), "Mãe & filhos");
  assert.equal(categoryNameSchema.parse("Imposto 2026"), "Imposto 2026");
  assert.equal(categoryNameSchema.parse("linha\n\tnova"), "linha nova");
  assert.equal(categoryNameSchema.parse("ab"), "ab");
  assert.equal(categoryNameSchema.parse("x".repeat(30)).length, 30);
  for (const bad of ["a", "   ", "", "x".repeat(31), "<script>", "-começa", "😀😀", ".ponto", { $ne: 1 }, ["Pets"], null, undefined, 42]) {
    assert.equal(categoryNameSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  assert.match(categoryNameSchema.safeParse("a").error.issues[0].message, /mínimo 2/);
  assert.match(categoryNameSchema.safeParse("x".repeat(31)).error.issues[0].message, /máximo 30/);
});

test("nova categoria: tipo e nome obrigatórios, campos extras ignorados", () => {
  assert.deepEqual(newCategorySchema.parse({ type: "output", name: " Pets ", userId: "x" }), { type: "output", name: "Pets" });
  assert.equal(newCategorySchema.safeParse({ type: "transfer", name: "Pets" }).success, false);
  assert.equal(newCategorySchema.safeParse({ name: "Pets" }).success, false);
  assert.equal(newCategorySchema.safeParse({ type: "input" }).success, false);
});
