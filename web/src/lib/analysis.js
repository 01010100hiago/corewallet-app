import { variation } from "./format.js";

// Tudo o que a página de análise calcula a partir da resposta da API, sem tocar na tela:
// totais do período, resultado, taxa de poupança, saldo no fim de cada mês e as comparações.
export function summarize(data) {
  const { months, previous, openingBalance } = data;
  const totalIn = months.reduce((n, m) => n + m.totalIn, 0);
  const totalOut = months.reduce((n, m) => n + m.totalOut, 0);
  const result = totalIn - totalOut;

  let running = openingBalance;
  const balances = months.map((m) => {
    running += m.totalIn - m.totalOut;
    return { key: m.key, balance: running };
  });

  const last = months.at(-1);
  const before = months.at(-2);
  return {
    totalIn,
    totalOut,
    result,
    hasData: totalIn + totalOut > 0,
    // Quanto da receita sobrou. Sem receita no período, a taxa não existe.
    savingsRate: totalIn > 0 ? (result / totalIn) * 100 : null,
    averageOut: Math.round(totalOut / months.length),
    balances,
    changes: {
      totalIn: variation(totalIn, previous.totalIn),
      totalOut: variation(totalOut, previous.totalOut),
      result: variation(result, previous.totalIn - previous.totalOut),
    },
    // Mês atual (ainda em andamento) contra o anterior.
    monthly: before && {
      current: last,
      previous: before,
      rows: [
        { label: "Receitas", current: last.totalIn, previous: before.totalIn, good: "up" },
        { label: "Despesas", current: last.totalOut, previous: before.totalOut, good: "down" },
        { label: "Resultado", current: last.totalIn - last.totalOut, previous: before.totalIn - before.totalOut, good: "up" },
      ].map((r) => ({ ...r, change: variation(r.current, r.previous) })),
    },
  };
}

// Cor da variação: aumento de receita é bom; aumento de despesa é ruim (good = "up" | "down").
export function toneOf(change, good) {
  if (change === null || Math.abs(change) < 0.05) return "text-muted";
  const improved = good === "up" ? change > 0 : change < 0;
  return improved ? "text-positive" : "text-negative";
}
