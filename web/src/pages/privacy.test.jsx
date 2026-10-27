import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { monthKeyOf } from "@corewallet/shared";
import { api } from "../lib/api.js";
import { PrivacyProvider } from "../context/PrivacyProvider.jsx";
import { usePrivacy } from "../context/privacyContext.js";
import Money from "../components/Money.jsx";
import PrivacyToggle from "../components/PrivacyToggle.jsx";
import SpendingChart from "../components/SpendingChart.jsx";
import { renderPage } from "../test/render.jsx";
import Home from "./Home.jsx";
import History from "./History.jsx";
import Analysis from "./Analysis.jsx";

const KEY = "cw_privacidade";
const HIDDEN = { hidden: true, toggle: () => {} };
const current = monthKeyOf(new Date());
const at = "2026-10-27T13:40:00.000Z";
// Nenhum número em reais pode aparecer com o modo "esconder valores": "R$ 12,34", "R$ 1.234,56", "-R$ 5,00".
const REAIS = /R\$\s?\d|\d[\d.]*,\d{2}/;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("PrivacyProvider e o olhinho", () => {
  function Probe() {
    const { hidden } = usePrivacy();
    return (
      <>
        <p>estado: {hidden ? "oculto" : "visível"}</p>
        <Money cents={123456} />
        <PrivacyToggle />
      </>
    );
  }
  const mount = () =>
    render(
      <PrivacyProvider>
        <Probe />
      </PrivacyProvider>
    );

  test("começa mostrando os valores; o botão esconde e mostra de novo", async () => {
    mount();
    expect(screen.getByText("estado: visível")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("1.234,56");
    const eye = screen.getByRole("button", { name: "Ocultar valores" });
    expect(eye).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(eye);
    expect(screen.getByText("estado: oculto")).toBeInTheDocument();
    expect(eye).toHaveAttribute("aria-pressed", "true");
    expect(document.body.textContent).not.toMatch(REAIS);
    expect(document.body).toHaveTextContent("R$ ••••");

    await userEvent.click(eye);
    expect(document.body).toHaveTextContent("1.234,56");
    expect(eye).toHaveAttribute("aria-pressed", "false");
  });

  test("a escolha fica salva neste navegador e vale na próxima visita", async () => {
    const first = mount();
    await userEvent.click(screen.getByRole("button", { name: "Ocultar valores" }));
    expect(localStorage.getItem(KEY)).toBe("ocultar");
    first.unmount();
    mount();
    expect(screen.getByText("estado: oculto")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(REAIS);
    await userEvent.click(screen.getByRole("button", { name: "Ocultar valores" }));
    expect(localStorage.getItem(KEY)).toBe("mostrar");
  });

  test("o leitor de tela lê 'valor oculto' e não os pontinhos", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Ocultar valores" }));
    const text = screen.getByText("R$ ••••");
    expect(text).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("valor oculto")).toHaveClass("sr-only");
  });

  test("com o armazenamento bloqueado o botão funciona na página e nada quebra", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    mount();
    expect(screen.getByText("estado: visível")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ocultar valores" }));
    expect(screen.getByText("estado: oculto")).toBeInTheDocument();
  });

  test("valor guardado desconhecido é ignorado", () => {
    localStorage.setItem(KEY, "qualquer-coisa");
    mount();
    expect(screen.getByText("estado: visível")).toBeInTheDocument();
  });

  test("sem o provider (testes isolados) os valores aparecem", () => {
    render(<Money cents={5000} />);
    expect(document.body).toHaveTextContent("50,00");
  });
});

describe("com os valores escondidos nada vaza", () => {
  const tx = (id, type, value, description) => ({ id, type, value, description, category: "mercado", createdAt: at });
  const home = {
    balance: 777700,
    totalIn: 888800,
    totalOut: 111100,
    truncated: false,
    categories: [],
    transactions: [tx("1", "output", 123456, "Feira"), tx("2", "input", 987654, "Salário")],
    month: {
      key: current,
      totalIn: 987654,
      totalOut: 123456,
      count: 2,
      archivedCount: 1,
      categories: [{ type: "output", category: "mercado", total: 123456 }, { type: "output", category: "lazer", total: 4321 }],
    },
  };

  test("Home: saldo, totais, mês, gráfico e linhas", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: home });
    renderPage(<Home />, { privacy: HIDDEN });
    await screen.findByText("Feira");
    expect(document.body.textContent).not.toMatch(REAIS);
    expect(screen.getByTestId("balance")).toHaveTextContent("R$ ••••");
    expect(screen.getAllByText("R$ ••••").length).toBeGreaterThanOrEqual(8);
    // Descrições e categorias continuam visíveis: só o dinheiro some.
    expect(screen.getByText("Salário")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Despesas por categoria" })).toHaveTextContent("Supermercado");
  });

  test("Home: a pergunta de excluir não mostra o valor", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: home });
    renderPage(<Home />, { privacy: HIDDEN });
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    const group = screen.getByRole("group", { name: "Excluir Feira" });
    expect(group).toHaveTextContent("de R$ ••••?");
    expect(group.textContent).not.toMatch(REAIS);
  });

  test("Home: o histórico da linha (de → para) também fica oculto", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) =>
      url === "/transactions/1/history"
        ? { data: { deleted: false, events: [{ id: "e", transactionId: "1", action: "edited", at, snapshot: { type: "output", value: 100000, description: "Feira", category: "mercado" }, changes: [{ field: "value", from: 120050, to: 100000 }] }] } }
        : { data: home }
    );
    renderPage(<Home />, { privacy: HIDDEN });
    await userEvent.click(await screen.findByRole("button", { name: "Histórico de Feira" }));
    expect(await screen.findByText("Valor: R$ •••• → R$ ••••")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(REAIS);
  });

  test("Gráfico de despesas: total no meio, legenda", () => {
    render(<SpendingChart categories={[{ type: "output", category: "mercado", total: 123456 }]} />, {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <PrivacyProviderStub>{children}</PrivacyProviderStub>
        </MemoryRouter>
      ),
    });
    expect(document.body.textContent).not.toMatch(REAIS);
    expect(document.body).toHaveTextContent("R$ ••••");
  });

  test("Histórico: excluídos, arquivados e registro", async () => {
    const snap = { type: "output", value: 45900, description: "Feira", category: "mercado" };
    vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data:
        url === "/transactions/activity"
          ? {
              events: [
                { id: "1", transactionId: "t1", action: "edited", at, snapshot: snap, changes: [{ field: "value", from: 120050, to: 45900 }] },
                { id: "2", transactionId: "t2", action: "created", at, snapshot: { ...snap, description: "Outra" }, changes: [] },
              ],
              deleted: [{ id: "t1", type: "output", value: 45900, description: "Feira", category: "mercado", createdAt: at, deletedAt: at }],
              archived: [{ id: "t3", type: "input", value: 350000, description: "Bônus", category: "salario", createdAt: at, archivedAt: at }],
              truncated: false,
            }
          : { categories: [] },
    }));
    renderPage(<History />, { path: "/history", route: "/history", privacy: HIDDEN });
    await screen.findByRole("region", { name: "Arquivados" });
    expect(document.body.textContent).not.toMatch(REAIS);
    expect(screen.getByRole("region", { name: "Alterações" })).toHaveTextContent("Valor: R$ •••• → R$ ••••");
  });

  test("Análise: indicadores, tabelas, saldo inicial e os eixos dos gráficos", async () => {
    const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((key, i) => ({ key, totalIn: 400000 + i * 1111, totalOut: 150000 + i * 777 }));
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        months,
        openingBalance: 543210,
        previous: { totalIn: 100000, totalOut: 90000 },
        categories: [
          { type: "input", category: "salario", total: 2400000, previousTotal: 1000000 },
          { type: "output", category: "moradia", total: 900000, previousTotal: 800000 },
        ],
        topExpenses: [{ id: "a", value: 321098, description: "Aluguel", category: "moradia", createdAt: at }],
        customCategories: [],
      },
    });
    renderPage(<Analysis />, { path: "/analysis", route: "/analysis", privacy: HIDDEN });
    await screen.findByRole("region", { name: "Indicadores do período" });
    expect(document.body.textContent).not.toMatch(REAIS);
    // Eixos verticais: os números da escala também revelariam os valores.
    for (const svg of document.querySelectorAll("svg[role=img]")) {
      const labels = [...svg.querySelectorAll("text")].map((t) => t.textContent);
      expect(labels.filter((t) => /\d.*mil|R\$/.test(t))).toEqual([]);
      expect(labels).toContain("•••");
    }
    // Percentuais não são valores em dinheiro e continuam à mostra.
    expect(within(screen.getByRole("region", { name: "Indicadores do período" })).getByText("Taxa de poupança").closest("div")).toHaveTextContent("%");
  });

  test("com os valores visíveis, os mesmos lugares mostram os números", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: home });
    renderPage(<Home />);
    await screen.findByText("Feira");
    expect(screen.getByTestId("balance")).toHaveTextContent("7.777,00");
    expect(document.body.textContent).toMatch(REAIS);
    expect(document.body.textContent).not.toContain("••••");
  });
});

// Provider fixo no modo oculto, para componentes montados fora do renderPage.
function PrivacyProviderStub({ children }) {
  localStorage.setItem(KEY, "ocultar");
  return <PrivacyProvider>{children}</PrivacyProvider>;
}
