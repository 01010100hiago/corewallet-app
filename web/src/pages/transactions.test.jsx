import { describe, test, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext } from "../context/authContext.js";
import { ConfigContext } from "../context/configContext.js";
import userEvent from "@testing-library/user-event";
import { monthKeyOf, shiftMonth } from "@corewallet/shared";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth, noConfig } from "../test/render.jsx";
import Home from "./Home.jsx";
import NewTransaction from "./NewTransaction.jsx";
import EditTransaction from "./EditTransaction.jsx";

const current = monthKeyOf(new Date());
const previous = shiftMonth(current, -1);
const now = new Date().toISOString();

const tx = (id, type, value, description, category = "outros") => ({ id, type, value, description, category, createdAt: now });
const month = (key, over = {}) => ({ key, totalIn: 0, totalOut: 0, count: 0, categories: [], ...over });
const payload = (over = {}) => ({ balance: 0, totalIn: 0, totalOut: 0, truncated: false, transactions: [], month: month(current), ...over });
const getsMonths = () => api.get.mock.calls.map((c) => c[1]?.params?.month);

describe("Home: mês, resumo e gráfico", () => {
  test("começa no mês atual, pede só aquele mês e mostra o resumo do mês", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: payload({
        balance: 5000,
        transactions: [tx("1", "output", 3000, "Mercado", "mercado")],
        month: month(current, { totalIn: 12345, totalOut: 3000, count: 2 }),
      }),
    });
    renderPage(<Home />);
    expect(await screen.findByText("Mercado")).toBeInTheDocument();
    expect(getsMonths()).toEqual([current]);
    expect(screen.getByText("Entradas do mês").closest("div")).toHaveTextContent("123,45");
    expect(screen.getByText("Saídas do mês").closest("div")).toHaveTextContent("30,00");
    expect(screen.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Ir para o mês atual" })).toBeNull();
  });

  test("mês anterior busca de novo, mostra o atalho para o atual e o saldo continua o geral", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (url, { params }) => ({
      data: payload({ balance: 77700, transactions: [tx(params.month, "input", 100, `do mês ${params.month}`)], month: month(params.month) }),
    }));
    renderPage(<Home />);
    expect(await screen.findByText(`do mês ${current}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(await screen.findByText(`do mês ${previous}`)).toBeInTheDocument();
    expect(getsMonths()).toEqual([current, previous]);
    expect(screen.queryByText(`do mês ${current}`)).toBeNull();
    expect(screen.getByTestId("balance").textContent).toMatch(/777,00/);
    expect(screen.getByRole("button", { name: "Próximo mês" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Ir para o mês atual" }));
    expect(await screen.findByText(`do mês ${current}`)).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(3);
  });

  test("?mes na URL vale; mês inválido ou futuro cai no atual", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: payload() });
    const first = renderPage(<Home />, { route: `/?mes=${previous}` });
    await screen.findByText(/Nenhum lançamento em/);
    expect(getsMonths()).toEqual([previous]);
    first.unmount();

    api.get.mockClear();
    for (const bad of ["lixo", "2026-13", shiftMonth(current, 1)]) {
      const r = renderPage(<Home />, { route: `/?mes=${bad}` });
      await screen.findByText(/Nenhum lançamento em/);
      r.unmount();
    }
    expect(getsMonths()).toEqual([current, current, current]);
  });

  test("gráfico: saídas por categoria, da maior para a menor, com a parte de cada uma", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: payload({
        transactions: [tx("1", "output", 1, "x")],
        month: month(current, {
          totalOut: 10000,
          categories: [
            { type: "output", category: "mercado", total: 7500 },
            { type: "input", category: "salario", total: 99999 },
            { type: "output", category: "lazer", total: 2500 },
          ],
        }),
      }),
    });
    renderPage(<Home />);
    const chart = await screen.findByRole("region", { name: "Para onde foi o dinheiro" });
    const rows = within(chart).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Mercado");
    expect(rows[0]).toHaveTextContent("75,00");
    expect(rows[0]).toHaveTextContent("75%");
    expect(rows[1]).toHaveTextContent("Lazer");
    expect(rows[1]).toHaveTextContent("25%");
    expect(within(chart).queryByText(/Salário/)).toBeNull();
    expect(chart.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("sem saídas no mês não há gráfico", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: payload({ month: month(current, { totalIn: 100, categories: [{ type: "input", category: "salario", total: 100 }] }) }) });
    renderPage(<Home />);
    await screen.findByText(/Nenhum lançamento em/);
    expect(screen.queryByRole("region", { name: "Para onde foi o dinheiro" })).toBeNull();
  });

  test("ao trocar de mês, os dados do mês antigo somem enquanto o novo carrega", async () => {
    vi.spyOn(api, "get").mockImplementation((url, { params }) =>
      params.month === current
        ? Promise.resolve({ data: payload({ transactions: [tx("a", "input", 1, "do mês atual")], month: month(current, { totalIn: 100 }) }) })
        : new Promise(() => {})
    );
    renderPage(<Home />);
    expect(await screen.findByText("do mês atual")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.queryByText("do mês atual")).toBeNull();
    expect(screen.getByRole("status", { name: "Carregando lançamentos" })).toBeInTheDocument();
    expect(screen.getByText("Entradas do mês").closest("div")).toHaveTextContent("—");
  });

  test("troca de mês com a resposta antiga atrasada não mistura os meses", async () => {
    let releaseFirst;
    vi.spyOn(api, "get").mockImplementation((url, { params }) =>
      params.month === current
        ? new Promise((resolve) => (releaseFirst = () => resolve({ data: payload({ transactions: [tx("a", "input", 1, "do mês atual")] }) })))
        : Promise.resolve({ data: payload({ transactions: [tx("b", "input", 1, "do mês anterior")], month: month(previous) }) })
    );
    renderPage(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(await screen.findByText("do mês anterior")).toBeInTheDocument();
    releaseFirst();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("do mês atual")).toBeNull();
    expect(screen.getByText("do mês anterior")).toBeInTheDocument();
  });
});

describe("Home: editar e excluir", () => {
  const withOne = () =>
    vi.spyOn(api, "get").mockResolvedValue({ data: payload({ transactions: [tx("t1", "output", 4590, "Feira", "mercado")], month: month(current, { count: 1 }) }) });

  test("mostra a categoria e o link de editar de cada lançamento", async () => {
    withOne();
    renderPage(<Home />);
    expect(await screen.findByText("Feira")).toBeInTheDocument();
    expect(screen.getByText(/Mercado ·/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar Feira" })).toHaveAttribute("href", "/transaction/t1/edit");
  });

  test("excluir pede confirmação, dá para cancelar, e confirmar chama a API e recarrega", async () => {
    const get = withOne();
    const del = vi.spyOn(api, "delete").mockResolvedValue({ status: 204 });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    const group = screen.getByRole("group", { name: "Excluir Feira" });
    expect(group).toHaveTextContent(/45,90/);
    expect(group).toHaveTextContent(/não dá para desfazer/);
    expect(del).not.toHaveBeenCalled();

    await userEvent.click(within(group).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Excluir Feira" })).toBeNull();
    expect(del).not.toHaveBeenCalled();

    get.mockResolvedValue({ data: payload() });
    await userEvent.click(screen.getByRole("button", { name: "Excluir Feira" }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/transactions/t1"));
    expect(await screen.findByText("Lançamento excluído.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Feira")).toBeNull());
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("se a exclusão falhar, o lançamento continua e o erro aparece na linha", async () => {
    withOne();
    vi.spyOn(api, "delete").mockRejectedValue({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    const group = screen.getByRole("group", { name: "Excluir Feira" });
    expect(await within(group).findByRole("alert")).toHaveTextContent(/Erro interno/);
    expect(screen.getByText("Feira")).toBeInTheDocument();
    expect(screen.queryByText("Lançamento excluído.")).toBeNull();
    expect(within(group).getByRole("button", { name: "Sim, excluir" })).toBeEnabled();
  });

  test("404 ao excluir (já apagado em outra aba) conta como excluído", async () => {
    const get = withOne();
    vi.spyOn(api, "delete").mockRejectedValue({ response: { status: 404, data: {} } });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    get.mockResolvedValue({ data: payload() });
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    expect(await screen.findByText("Lançamento excluído.")).toBeInTheDocument();
  });

  test("401 ao excluir encerra a sessão em vez de mostrar erro", async () => {
    withOne();
    vi.spyOn(api, "delete").mockRejectedValue({ response: { status: 401, data: {} } });
    const expire = vi.fn();
    renderPage(<Home />, { auth: fakeAuth({ expire }) });
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });
});

describe("formulário de lançamento: categoria", () => {
  test("a saída só oferece categorias de saída, a entrada só as de entrada", async () => {
    const out = renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/output" });
    const opts = () => within(screen.getByLabelText("Categoria")).getAllByRole("option").map((o) => o.textContent);
    expect(opts()).toContain("Mercado");
    expect(opts()).not.toContain("Salário");
    out.unmount();
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/input" });
    expect(opts()).toContain("Salário");
    expect(opts()).not.toContain("Mercado");
  });

  test("envia a categoria escolhida", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/output" });
    await userEvent.type(screen.getByLabelText("Valor (R$)"), "10");
    await userEvent.type(screen.getByLabelText("Descrição"), "Ônibus");
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "transporte");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith("/transactions", { value: "10", description: "Ônibus", category: "transporte", type: "output" });
  });
});

describe("EditTransaction", () => {
  const route = { path: "/transaction/:id/edit", route: "/transaction/t1/edit" };
  const existing = tx("t1", "output", 4590, "Feira", "mercado");

  test("carrega o lançamento, preenche o formulário e não deixa trocar o tipo", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: existing });
    renderPage(<EditTransaction />, route);
    expect(await screen.findByRole("heading", { name: "Editar saída" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/transactions/t1");
    expect(screen.getByLabelText("Valor (R$)")).toHaveValue("45,90");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Feira");
    expect(screen.getByLabelText("Categoria")).toHaveValue("mercado");
    expect(screen.getByText(/não mudam/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  test("salva com PUT, sem o tipo, e volta para a home com o aviso", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: existing });
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} });
    renderPage(<EditTransaction />, route);
    const value = await screen.findByLabelText("Valor (R$)");
    await userEvent.clear(value);
    await userEvent.type(value, "50");
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "lazer");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(put).toHaveBeenCalledWith("/transactions/t1", { value: "50", description: "Feira", category: "lazer" });
    expect(await screen.findByText("página inicial")).toBeInTheDocument();
  });

  test("valida antes de enviar", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: existing });
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} });
    renderPage(<EditTransaction />, route);
    const description = await screen.findByLabelText("Descrição");
    await userEvent.clear(description);
    await userEvent.type(description, "ab");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/no mínimo 3 caracteres/)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  test("lançamento que não existe mostra aviso claro", async () => {
    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 404, data: { message: "Lançamento não encontrado" } } });
    renderPage(<EditTransaction />, route);
    expect(await screen.findByRole("alert")).toHaveTextContent(/pode ter sido excluído/);
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
  });

  test("erro da API ao salvar fica na tela; rede caída avisa que pode ter salvo", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: existing });
    const put = vi.spyOn(api, "put").mockRejectedValueOnce({ response: { status: 422, data: { errors: { category: "Categoria não combina com o tipo do lançamento" } } } });
    renderPage(<EditTransaction />, route);
    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/não combina com o tipo/)).toBeInTheDocument();

    put.mockRejectedValueOnce({ code: "ECONNABORTED" });
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Não conseguimos confirmar se a alteração foi salva/)).toBeInTheDocument();
  });
});

describe("Home: foco, aviso e contadores", () => {
  const withOne = () =>
    vi.spyOn(api, "get").mockResolvedValue({ data: payload({ transactions: [tx("t1", "output", 4590, "Feira", "mercado")], month: month(current, { count: 1 }) }) });

  test("o foco acompanha a confirmação: vai para ela e volta ao Excluir ao cancelar", async () => {
    withOne();
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    expect(screen.getByRole("group", { name: "Excluir Feira" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Excluir Feira" })).toHaveFocus();
  });

  test("depois de excluir, o foco vai para o título da lista (a linha some)", async () => {
    const get = withOne();
    vi.spyOn(api, "delete").mockResolvedValue({ status: 204 });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    get.mockResolvedValue({ data: payload() });
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    await screen.findByText("Lançamento excluído.");
    expect(screen.getByRole("heading", { name: "Lançamentos", level: 2 })).toHaveFocus();
  });

  test("o aviso vem da navegação e é apagado do histórico, para não voltar ao recarregar", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: payload() });
    let seen;
    function Probe() {
      seen = useLocation();
      return null;
    }
    render(
      <ConfigContext.Provider value={noConfig}>
        <AuthContext.Provider value={fakeAuth()}>
          <MemoryRouter initialEntries={[{ pathname: "/", search: "?mes=" + previous, state: { notice: "Lançamento atualizado." } }]}>
            <Probe />
            <Routes>
              <Route path="/" element={<Home />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ConfigContext.Provider>
    );
    expect(await screen.findByText("Lançamento atualizado.")).toBeInTheDocument();
    await waitFor(() => expect(seen.state).toBeNull());
    expect(seen.search).toBe("?mes=" + previous);
    expect(screen.getByText("Lançamento atualizado.")).toBeInTheDocument();
  });

  test("lista cortada mostra 'n de total' no cabeçalho, não só o tamanho da página", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: payload({ truncated: true, transactions: [tx("1", "input", 1, "a"), tx("2", "input", 1, "b")], month: month(current, { count: 731 }) }),
    });
    renderPage(<Home />);
    expect(await screen.findByText("2 de 731")).toBeInTheDocument();
    expect(screen.queryByText("2 no mês")).toBeNull();
  });

  test("o horário de cada linha é o de Brasília", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: payload({ transactions: [{ id: "1", type: "input", value: 100, description: "Noite", category: "outros", createdAt: "2026-10-15T01:30:00.000Z" }] }),
    });
    renderPage(<Home />);
    const row = (await screen.findByText("Noite")).closest("li");
    expect(within(row).getByText("22:30")).toBeInTheDocument();
  });
});
