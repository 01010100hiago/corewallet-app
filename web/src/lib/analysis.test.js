import { describe, test, expect } from "vitest";
import { summarize, toneOf } from "./analysis.js";
import { variation, formatVariation, formatPercent, niceMax, formatCompact, monthShort, monthShortWithYear } from "./format.js";

const months = (rows) => rows.map(([key, totalIn, totalOut]) => ({ key, totalIn, totalOut }));

describe("summarize", () => {
  const data = {
    months: months([["2026-08", 100000, 40000], ["2026-09", 120000, 60000], ["2026-10", 0, 30000]]),
    openingBalance: 50000,
    previous: { totalIn: 200000, totalOut: 100000 },
  };

  test("totais, resultado, taxa de poupança e média", () => {
    const s = summarize(data);
    expect(s.totalIn).toBe(220000);
    expect(s.totalOut).toBe(130000);
    expect(s.result).toBe(90000);
    expect(s.hasData).toBe(true);
    expect(s.savingsRate).toBeCloseTo((90000 / 220000) * 100, 6);
    expect(s.averageOut).toBe(43333);
  });

  test("saldo no fim de cada mês parte do saldo inicial e acumula o resultado", () => {
    expect(summarize(data).balances).toEqual([
      { key: "2026-08", balance: 50000 + 60000 },
      { key: "2026-09", balance: 110000 + 60000 },
      { key: "2026-10", balance: 170000 - 30000 },
    ]);
  });

  test("variações sobre o período anterior", () => {
    const { changes } = summarize(data);
    expect(changes.totalIn).toBeCloseTo(10, 6);
    expect(changes.totalOut).toBeCloseTo(30, 6);
    expect(changes.result).toBeCloseTo(((90000 - 100000) / 100000) * 100, 6);
  });

  test("mês atual contra o anterior, com receita, despesa e resultado", () => {
    const { monthly } = summarize(data);
    expect(monthly.current.key).toBe("2026-10");
    expect(monthly.previous.key).toBe("2026-09");
    const by = Object.fromEntries(monthly.rows.map((r) => [r.label, r]));
    expect(by.Receitas.change).toBeCloseTo(-100, 6);
    expect(by.Despesas.change).toBeCloseTo(-50, 6);
    expect(by.Resultado.current).toBe(-30000);
    expect(by.Resultado.previous).toBe(60000);
    expect(by.Resultado.change).toBeCloseTo(-150, 6); // sobre o valor absoluto do anterior
  });

  test("resultado anterior negativo: melhorar aparece como aumento (e a cor certa)", () => {
    const s = summarize({
      months: months([["2026-09", 20000, 10000], ["2026-10", 20000, 10000]]),
      openingBalance: 0,
      previous: { totalIn: 10000, totalOut: 30000 }, // resultado anterior: −20000
    });
    expect(s.result).toBe(20000);
    expect(s.changes.result).toBeCloseTo(200, 6); // de −20000 para +20000: +200%, não −200%
    expect(toneOf(s.changes.result, "up")).toBe("text-positive");
  });

  test("resultado do mês anterior negativo também compara pelo valor absoluto", () => {
    const { monthly } = summarize({ months: months([["2026-09", 10000, 30000], ["2026-10", 20000, 10000]]), openingBalance: 0, previous: { totalIn: 0, totalOut: 0 } });
    const result = monthly.rows.find((r) => r.label === "Resultado");
    expect(result.previous).toBe(-20000);
    expect(result.current).toBe(10000);
    expect(result.change).toBeCloseTo(150, 6);
  });

  test("sem receita a taxa de poupança não existe; sem base, a variação é null", () => {
    const s = summarize({ months: months([["2026-09", 0, 5000], ["2026-10", 0, 7000]]), openingBalance: 0, previous: { totalIn: 0, totalOut: 0 } });
    expect(s.savingsRate).toBeNull();
    expect(s.changes.totalOut).toBeNull();
    expect(s.changes.totalIn).toBeNull();
    expect(s.monthly.rows.find((r) => r.label === "Receitas").change).toBeNull();
  });

  test("resultado negativo dá taxa de poupança negativa", () => {
    const s = summarize({ months: months([["2026-09", 1000, 3000], ["2026-10", 1000, 3000]]), openingBalance: 0, previous: { totalIn: 0, totalOut: 0 } });
    expect(s.result).toBe(-4000);
    expect(s.savingsRate).toBeCloseTo(-200, 6);
  });

  test("sem lançamentos: hasData falso e nada de NaN", () => {
    const s = summarize({ months: months([["2026-09", 0, 0], ["2026-10", 0, 0]]), openingBalance: 0, previous: { totalIn: 0, totalOut: 0 } });
    expect(s.hasData).toBe(false);
    expect(s.averageOut).toBe(0);
    expect(s.balances.map((b) => b.balance)).toEqual([0, 0]);
  });

  test("um único mês não tem comparação mensal", () => {
    expect(summarize({ months: months([["2026-10", 1, 1]]), openingBalance: 0, previous: { totalIn: 0, totalOut: 0 } }).monthly).toBeUndefined();
  });
});

describe("toneOf", () => {
  test("aumento de receita é bom; aumento de despesa é ruim", () => {
    expect(toneOf(10, "up")).toBe("text-positive");
    expect(toneOf(-10, "up")).toBe("text-negative");
    expect(toneOf(10, "down")).toBe("text-negative");
    expect(toneOf(-10, "down")).toBe("text-positive");
  });
  test("sem base ou praticamente estável fica neutro", () => {
    expect(toneOf(null, "up")).toBe("text-muted");
    expect(toneOf(0.01, "down")).toBe("text-muted");
    expect(toneOf(0, "up")).toBe("text-muted");
  });
});

describe("format", () => {
  test("variation e formatVariation", () => {
    expect(variation(150, 100)).toBe(50);
    expect(variation(50, 100)).toBe(-50);
    expect(variation(10, 0)).toBeNull();
    expect(variation(100, -200)).toBe(150); // base negativa: pelo valor absoluto
    expect(variation(-300, -200)).toBe(-50);
    expect(variation(-100, -200)).toBe(50);
    expect(formatVariation(12.34)).toBe("+12,3%");
    expect(formatVariation(-8)).toBe("−8,0%");
    expect(formatVariation(0)).toBe("estável (0,0%)");
    expect(formatVariation(null)).toBe("sem base de comparação");
    expect(formatVariation(Infinity)).toBe("sem base de comparação");
    expect(formatPercent(12.345)).toBe("12,3%");
  });
  test("niceMax arredonda para um teto limpo", () => {
    expect(niceMax(0)).toBe(100);
    expect(niceMax(-5)).toBe(100);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(480)).toBe(500);
    expect(niceMax(510)).toBe(1000);
    expect(niceMax(123456)).toBe(200000);
    expect(niceMax(99999999)).toBe(100000000);
  });
  test("valores compactos e meses curtos", () => {
    expect(formatCompact(123456)).toMatch(/R\$\s?1,2\smil/);
    expect(monthShort("2026-01")).toBe("jan");
    expect(monthShort("2026-12")).toBe("dez");
    expect(monthShortWithYear("2027-01")).toBe("jan/27");
  });
});
