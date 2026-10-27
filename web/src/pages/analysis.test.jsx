import { describe, test, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import Analysis from "./Analysis.jsx";

const route = { path: "/analysis", route: "/analysis" };
const at = "2026-10-27T13:40:00.000Z";
const mk = (keys, values) => keys.map((key, i) => ({ key, totalIn: values[i][0], totalOut: values[i][1] }));
const KEYS6 = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

const data = (over = {}) => ({
  months: mk(KEYS6, [[0, 0], [100000, 20000], [100000, 30000], [100000, 40000], [120000, 60000], [0, 30000]]),
  openingBalance: 50000,
  previous: { totalIn: 200000, totalOut: 100000 },
  categories: [
    { type: "input", category: "salario", total: 420000, previousTotal: 200000 },
    { type: "output", category: "moradia", total: 90000, previousTotal: 60000 },
    { type: "output", category: "mercado", total: 60000, previousTotal: 40000 },
    { type: "output", category: "lazer", total: 30000, previousTotal: 0 },
  ],
  topExpenses: [
    { id: "a", value: 90000, description: "Aluguel de agosto", category: "moradia", createdAt: at },
    { id: "b", value: 30000, description: "Viagem", category: "lazer", createdAt: at },
  ],
  customCategories: [],
  ...over,
});
const stub = (d = data()) => vi.spyOn(api, "get").mockResolvedValue({ data: d });
const monthsOf = () => api.get.mock.calls.map((c) => c[1]?.params?.months);

describe("página de análise financeira", () => {
  test("pede 6 meses por padrão e mostra os indicadores do período", async () => {
    stub();
    renderPage(<Analysis />, route);
    const kpis = await screen.findByRole("region", { name: "Indicadores do período" });
    expect(monthsOf()).toEqual([6]);
    const item = (label) => within(kpis).getByText(label).closest("div");
    expect(item("Receitas")).toHaveTextContent("4.200,00");
    expect(item("Despesas")).toHaveTextContent("1.800,00");
    expect(item("Resultado")).toHaveTextContent("2.400,00");
    expect(item("Taxa de poupança")).toHaveTextContent("57,1%"); // 240000 de 420000
    expect(item("Despesa média por mês")).toHaveTextContent("300,00");
    expect(screen.getByText("Últimos 6 meses")).toBeInTheDocument();
  });

  test("a variação sobre o período anterior aparece com sinal e cor certos", async () => {
    stub();
    renderPage(<Analysis />, route);
    const kpis = await screen.findByRole("region", { name: "Indicadores do período" });
    const rec = within(kpis).getByText("Receitas").closest("div");
    const desp = within(kpis).getByText("Despesas").closest("div");
    expect(rec).toHaveTextContent("+110,0%"); // 420000 sobre 200000
    expect(rec.querySelector("p")).toHaveClass("text-positive");
    expect(desp).toHaveTextContent("+80,0%"); // 180000 sobre 100000: despesa subindo é ruim
    expect(desp.querySelector("p")).toHaveClass("text-negative");
  });

  test("os botões de período buscam de novo e ficam marcados; o período vai para a URL", async () => {
    stub();
    renderPage(<Analysis />, route);
    await screen.findByRole("region", { name: "Indicadores do período" });
    const group = screen.getByRole("group", { name: "Período" });
    expect(within(group).getByRole("button", { name: "6 meses" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "12 meses" })).toHaveAttribute("aria-pressed", "false");

    api.get.mockResolvedValue({ data: data({ months: mk(["2026-08", "2026-09", "2026-10"], [[1, 1], [1, 1], [1, 1]]) }) });
    await userEvent.click(within(group).getByRole("button", { name: "3 meses" }));
    await waitFor(() => expect(monthsOf()).toEqual([6, 3]));
    expect(await screen.findByText("Últimos 3 meses")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "3 meses" })).toHaveAttribute("aria-pressed", "true");
  });

  test("?periodo vale; valor inválido cai em 6", async () => {
    stub();
    const first = renderPage(<Analysis />, { path: "/analysis", route: "/analysis?periodo=12" });
    await screen.findByRole("region", { name: "Indicadores do período" });
    expect(monthsOf()).toEqual([12]);
    first.unmount();
    api.get.mockClear();
    for (const bad of ["7", "abc", "0", "-3"]) {
      const r = renderPage(<Analysis />, { path: "/analysis", route: `/analysis?periodo=${bad}` });
      await screen.findByRole("region", { name: "Indicadores do período" });
      r.unmount();
    }
    expect(monthsOf()).toEqual([6, 6, 6, 6]);
  });

  test("trocar de período com a resposta antiga atrasada não mistura os períodos", async () => {
    let release;
    vi.spyOn(api, "get").mockImplementation((url, { params }) =>
      params.months === 6
        ? new Promise((resolve) => (release = () => resolve({ data: data() })))
        : Promise.resolve({ data: data({ months: mk(["2026-08", "2026-09", "2026-10"], [[5, 5], [5, 5], [5, 5]]) }) })
    );
    renderPage(<Analysis />, route);
    await userEvent.click(screen.getByRole("button", { name: "3 meses" }));
    const kpis = await screen.findByRole("region", { name: "Indicadores do período" });
    expect(kpis).toHaveTextContent("R$ 0,15"); // receitas do período de 3 meses: 3 x 5 centavos
    release(); // chega a resposta antiga (6 meses, R$ 4.200,00 de receitas)
    await new Promise((r) => setTimeout(r, 20));
    // O texto do cabeçalho vem da URL; o que prova a proteção são os NÚMEROS, que vêm da resposta.
    expect(screen.getByRole("region", { name: "Indicadores do período" })).toHaveTextContent("R$ 0,15");
    expect(screen.getByRole("region", { name: "Indicadores do período" })).not.toHaveTextContent("4.200,00");
  });

  test("carregando, e ao trocar de período não mostra os números do período antigo", async () => {
    vi.spyOn(api, "get").mockImplementation((url, { params }) => (params.months === 6 ? Promise.resolve({ data: data() }) : new Promise(() => {})));
    renderPage(<Analysis />, route);
    await screen.findByRole("region", { name: "Indicadores do período" });
    await userEvent.click(screen.getByRole("button", { name: "12 meses" }));
    expect(screen.getByRole("status")).toHaveTextContent("Carregando análise");
    expect(screen.queryByRole("region", { name: "Indicadores do período" })).toBeNull();
  });

  test("evolução do saldo: gráfico com nome acessível e valores na tabela", async () => {
    stub();
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Evolução do saldo" });
    expect(within(section).getByRole("img", { name: /Gráfico de linha do saldo/ })).toBeInTheDocument();
    expect(section).toHaveTextContent("R$ 500,00 no início do período");
    const rows = within(section).getAllByRole("row");
    // cabeçalho + 6 meses; saldo acumulado: 500 + (0) = 500, +800 = 1.300, +700 = 2.000, +600 = 2.600, +600 = 3.200, −300 = 2.900
    expect(rows).toHaveLength(7);
    expect(rows[1]).toHaveTextContent("mai/26");
    expect(rows[1]).toHaveTextContent("500,00");
    expect(rows[6]).toHaveTextContent("out");
    expect(rows[6]).toHaveTextContent("2.900,00");
  });

  test("receitas e despesas por mês: gráfico e tabela com o resultado de cada mês", async () => {
    stub();
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Receitas e despesas por mês" });
    expect(within(section).getByRole("img", { name: /Gráfico de barras/ })).toBeInTheDocument();
    expect(within(section).getByText("Ver valores em tabela").closest("details")).not.toHaveAttribute("open");
    const rows = within(section).getAllByRole("row");
    expect(rows).toHaveLength(7);
    expect(rows[6]).toHaveTextContent("R$ 0,00");
    expect(rows[6]).toHaveTextContent("300,00");
    expect(rows[6]).toHaveTextContent("-R$ 300,00"); // resultado do mês atual (receita 0)
  });

  test("mês atual contra o anterior", async () => {
    stub();
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Mês atual e mês anterior" });
    expect(section).toHaveTextContent("outubro de 2026 (em andamento) comparado a setembro de 2026");
    const rows = within(section).getAllByRole("row");
    const despesas = rows.find((r) => r.textContent.startsWith("Despesas"));
    expect(despesas).toHaveTextContent("600,00"); // anterior
    expect(despesas).toHaveTextContent("300,00"); // atual
    expect(despesas).toHaveTextContent("−50,0%");
    expect(despesas.querySelector("td:last-child")).toHaveClass("text-positive"); // despesa caiu: bom
    const receitas = rows.find((r) => r.textContent.startsWith("Receitas"));
    expect(receitas).toHaveTextContent("−100,0%");
    expect(receitas.querySelector("td:last-child")).toHaveClass("text-negative");
  });

  test("despesas por categoria: total, participação e variação; 'novo no período' sem base", async () => {
    stub();
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Despesas por categoria" });
    const rows = within(section).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Moradia");
    expect(rows[0]).toHaveTextContent("900,00");
    expect(rows[0]).toHaveTextContent("50,0%"); // 90000 de 180000
    expect(rows[0]).toHaveTextContent("+50,0%");
    expect(rows[0].querySelector("td:last-child")).toHaveClass("text-negative");
    expect(rows[1]).toHaveTextContent("Supermercado");
    expect(rows[2]).toHaveTextContent("Lazer");
    expect(rows[2]).toHaveTextContent("novo no período");
  });

  test("receitas por categoria usam as cores ao contrário (aumento é bom)", async () => {
    stub();
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Receitas por categoria" });
    const row = within(section).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Salário");
    expect(row).toHaveTextContent("+110,0%");
    expect(row.querySelector("td:last-child")).toHaveClass("text-positive");
  });

  test("categorias criadas pela pessoa aparecem com o nome", async () => {
    const pets = { id: "a".repeat(24), type: "output", name: "Pets" };
    stub(data({ customCategories: [pets], categories: [{ type: "output", category: pets.id, total: 5000, previousTotal: 1000 }], topExpenses: [{ id: "x", value: 5000, description: "Ração", category: pets.id, createdAt: at }] }));
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Despesas por categoria" });
    expect(section).toHaveTextContent("Pets");
    expect(screen.getByRole("region", { name: "Maiores despesas do período" })).toHaveTextContent("Pets");
    expect(screen.queryByRole("region", { name: "Receitas por categoria" })).toBeNull();
  });

  test("maiores despesas: data de Brasília, descrição, categoria e valor", async () => {
    stub();
    renderPage(<Analysis />, route);
    const section = await screen.findByRole("region", { name: "Maiores despesas do período" });
    const rows = within(section).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("27/10/2026");
    expect(rows[0]).toHaveTextContent("Aluguel de agosto");
    expect(rows[0]).toHaveTextContent("Moradia");
    expect(rows[0]).toHaveTextContent("900,00");
  });

  test("sem lançamentos no período: aviso em vez de gráficos zerados", async () => {
    stub(data({ months: mk(KEYS6, Array(6).fill([0, 0])), categories: [], topExpenses: [], previous: { totalIn: 0, totalOut: 0 } }));
    renderPage(<Analysis />, route);
    expect(await screen.findByText("Nenhum lançamento nos últimos 6 meses")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Indicadores do período" })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  test("sem receitas a taxa de poupança mostra traço e explica", async () => {
    stub(data({ months: mk(KEYS6, Array(6).fill([0, 1000])), categories: [{ type: "output", category: "lazer", total: 6000, previousTotal: 0 }], previous: { totalIn: 0, totalOut: 0 } }));
    renderPage(<Analysis />, route);
    const kpis = await screen.findByRole("region", { name: "Indicadores do período" });
    const item = within(kpis).getByText("Taxa de poupança").closest("div");
    expect(item).toHaveTextContent("—");
    expect(item).toHaveTextContent("Sem receitas no período");
    expect(within(kpis).getByText("Receitas").closest("div")).toHaveTextContent("sem base de comparação");
  });

  test("resultado negativo aparece em vermelho", async () => {
    stub(data({ months: mk(KEYS6, Array(6).fill([1000, 3000])), openingBalance: 0, previous: { totalIn: 0, totalOut: 0 } }));
    renderPage(<Analysis />, route);
    const kpis = await screen.findByRole("region", { name: "Indicadores do período" });
    const dd = within(kpis).getByText("Resultado").closest("div").querySelector("dd");
    expect(dd).toHaveClass("text-negative");
    expect(dd).toHaveTextContent("-R$ 120,00"); // 6 x (1.000 - 3.000) centavos
  });

  test("erro de carregamento e 401", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network Error"));
    const first = renderPage(<Analysis />, route);
    expect(await screen.findByRole("alert")).toHaveTextContent(/conectar/);
    first.unmount();
    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 401, data: {} } });
    const expire = vi.fn();
    renderPage(<Analysis />, { ...route, auth: fakeAuth({ expire }) });
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });

  test("avisa que arquivados entram e excluídos não, e que o mês atual está em andamento", async () => {
    stub();
    renderPage(<Analysis />, route);
    await screen.findByRole("region", { name: "Indicadores do período" });
    expect(screen.getByText(/Inclui lançamentos arquivados e não inclui os excluídos/)).toBeInTheDocument();
    expect(screen.getByText(/O mês atual está em andamento/)).toBeInTheDocument();
  });
});
