import { describe, test, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import History from "./History.jsx";

const at = "2026-10-27T13:40:07.000Z"; // 10:40:07 em Brasília
const row = (id, over = {}) => ({ id, type: "output", value: 4590, description: `Item ${id}`, category: "mercado", createdAt: at, status: "active", archivedAt: null, deletedAt: null, ...over });
const totals = { count: 2, totalIn: 350000, totalOut: 4590 };
const route = { path: "/history", route: "/history" };

// Responde /transactions/search com o que `search(params)` devolver; o resto fica vazio.
function stub(search) {
  return vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    if (url === "/transactions/search") return { data: await search(config?.params ?? {}) };
    if (url === "/categories") return { data: { categories: [{ id: "a".repeat(24), type: "output", name: "Pets" }] } };
    if (url.endsWith("/history")) return { data: { deleted: false, events: [{ id: "e1", transactionId: "x", action: "created", at, snapshot: { type: "output", value: 4590, description: "Item x", category: "mercado" }, changes: [] }] } };
    return { data: {} };
  });
}
const searches = (spy) => spy.mock.calls.filter(([url]) => url === "/transactions/search").map(([, c]) => c.params);
const last = (spy) => searches(spy).at(-1);

describe("Histórico: extrato", () => {
  test("abre no Extrato, com totais do filtro, situação de cada lançamento e horário do servidor em Brasília", async () => {
    const get = stub(() => ({
      transactions: [row("1"), row("2", { type: "input", value: 350000, description: "Salário", category: "salario", status: "archived" }), row("3", { status: "deleted", description: "Apagado" })],
      totals: { count: 3, totalIn: 350000, totalOut: 9180 },
      nextCursor: null,
    }));
    renderPage(<History />, route);
    const list = await screen.findByRole("region", { name: "Extrato" });
    const items = await within(list).findAllByRole("listitem");
    expect(screen.getByRole("tab", { name: "Extrato" })).toHaveAttribute("aria-selected", "true");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Item 1");
    expect(items[0]).toHaveTextContent("Supermercado");
    expect(items[0]).toHaveTextContent("27/10/2026 às 10:40");
    expect(within(items[0]).getByText(/27\/10\/2026 às 10:40/)).toHaveAttribute("title", "Registrado em 27/10/2026 às 10:40:07 (horário de Brasília)");
    expect(items[0]).toHaveTextContent("Na lista");
    expect(items[1]).toHaveTextContent("Arquivado");
    expect(items[2]).toHaveTextContent("Excluído");
    const sum = screen.getByLabelText("Totais do filtro");
    expect(sum).toHaveTextContent("3 lançamentos");
    expect(sum).toHaveTextContent("Receitas R$ 3.500,00");
    expect(sum).toHaveTextContent("Despesas R$ 91,80");
    expect(last(get)).toEqual({ status: "all", limit: 30 });
  });

  test("busca espera a pessoa parar de digitar e manda o texto sem espaços nas pontas", async () => {
    const get = stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(<History />, route);
    await screen.findByText("Nenhum lançamento ainda");
    const before = searches(get).length;
    await userEvent.type(screen.getByLabelText("Buscar pela descrição"), " mercado ");
    expect(searches(get)).toHaveLength(before); // ainda não buscou a cada tecla
    await waitFor(() => expect(last(get)).toEqual({ status: "all", limit: 30, q: "mercado" }));
    expect(searches(get)).toHaveLength(before + 1);
    expect(await screen.findByText("Nenhum lançamento com esses filtros")).toBeInTheDocument();
  });

  test("tipo, categoria, situação e datas viram parâmetros; trocar o tipo limpa categoria que não combina; Limpar filtros volta ao início", async () => {
    const get = stub(() => ({ transactions: [row("1")], totals, nextCursor: null }));
    renderPage(<History />, route);
    await screen.findByText("Item 1");
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "output");
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "mercado");
    await userEvent.selectOptions(screen.getByLabelText("Situação"), "archived");
    await userEvent.type(screen.getByLabelText("De"), "2026-10-01");
    await userEvent.type(screen.getByLabelText("Até"), "2026-10-31");
    await waitFor(() => expect(last(get)).toEqual({ status: "archived", limit: 30, type: "output", category: "mercado", from: "2026-10-01", to: "2026-10-31" }));

    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "input"); // "mercado" não é de receita
    expect(screen.getByLabelText("Categoria")).toHaveValue("");
    await waitFor(() => expect(last(get).category).toBeUndefined());
    expect(last(get).type).toBe("input");

    await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByLabelText("Tipo")).toHaveValue("");
    expect(screen.getByLabelText("De")).toHaveValue("");
    await waitFor(() => expect(last(get)).toEqual({ status: "all", limit: 30 }));
  });

  test("a lista de categorias inclui as suas, e sem tipo não repete as comuns às duas", async () => {
    stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(<History />, route);
    await screen.findByText("Nenhum lançamento ainda");
    const labels = () => within(screen.getByLabelText("Categoria")).getAllByRole("option").map((o) => o.textContent);
    await waitFor(() => expect(labels()).toContain("Pets"));
    expect(labels().filter((l) => l === "Outros" || l === "Outras despesas" || l === "Outras receitas").length).toBe(1);
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "input");
    expect(labels()).not.toContain("Pets");
    expect(labels()).not.toContain("Supermercado");
  });

  test("Carregar mais usa o cursor e acrescenta; some quando acaba", async () => {
    const get = stub((p) =>
      p.cursor
        ? { transactions: [row("3")], totals: { count: 3, totalIn: 0, totalOut: 13770 }, nextCursor: null }
        : { transactions: [row("1"), row("2")], totals: { count: 3, totalIn: 0, totalOut: 13770 }, nextCursor: "123_abc" }
    );
    renderPage(<History />, route);
    await screen.findByText("Item 2");
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Item 3")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(searches(get).at(-1)).toMatchObject({ cursor: "123_abc", status: "all" });
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  test("erro ao carregar mais fica no fim da lista e mantém o que já estava", async () => {
    let n = 0;
    stub((p) => {
      if (p.cursor) throw { response: { status: 500, data: { message: "Falha ao buscar" } } };
      n++;
      return { transactions: [row("1")], totals, nextCursor: "c1" };
    });
    renderPage(<History />, route);
    await screen.findByText("Item 1");
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeEnabled();
    expect(n).toBe(1);
  });

  test("os campos de data aceitam só o período que a API entende e um erro da API aparece", async () => {
    stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(<History />, route);
    await screen.findByText("Nenhum lançamento ainda");
    expect(screen.getByLabelText("De")).toHaveAttribute("min", "2000-01-01");
    expect(screen.getByLabelText("Até")).toHaveAttribute("max", "2100-12-31");
    await userEvent.type(screen.getByLabelText("De"), "2026-10-05");
    expect(screen.getByLabelText("Até")).toHaveAttribute("min", "2026-10-05");
    await userEvent.type(screen.getByLabelText("Até"), "2026-10-20");
    expect(screen.getByLabelText("De")).toHaveAttribute("max", "2026-10-20");
  });

  test("cada situação tem a sua ação: Editar, Desarquivar ou Restaurar", async () => {
    stub(() => ({ transactions: [row("1"), row("2", { status: "archived" }), row("3", { status: "deleted" })], totals, nextCursor: null }));
    renderPage(<History />, route);
    await screen.findByText("Item 1");
    expect(screen.getByRole("link", { name: "Editar Item 1" })).toHaveAttribute("href", "/transaction/1/edit");
    expect(screen.queryByRole("link", { name: "Editar Item 2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desarquivar Item 1" })).toBeNull();
    expect(screen.getByRole("button", { name: "Desarquivar Item 2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Editar Item 3" })).toBeNull();
    expect(screen.getByRole("button", { name: "Restaurar Item 3" })).toBeInTheDocument();
  });

  test("restaurar e desarquivar chamam a API certa, avisam e recarregam o extrato", async () => {
    const get = stub(() => ({ transactions: [row("2", { status: "archived" }), row("3", { status: "deleted" })], totals, nextCursor: null }));
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<History />, route);
    await screen.findByText("Item 2");
    const calls = searches(get).length;
    await userEvent.click(screen.getByRole("button", { name: "Desarquivar Item 2" }));
    expect(post).toHaveBeenCalledWith("/transactions/2/unarchive");
    expect(await screen.findByText("“Item 2” voltou para a lista.")).toBeInTheDocument();
    await waitFor(() => expect(searches(get).length).toBe(calls + 1));
    await userEvent.click(screen.getByRole("button", { name: "Restaurar Item 3" }));
    expect(post).toHaveBeenCalledWith("/transactions/3/restore");
    expect(await screen.findByText("“Item 3” voltou para a lista e para o saldo.")).toBeInTheDocument();
  });

  test("falha na ação mostra o erro; 404 só recarrega; 401 expira a sessão", async () => {
    const get = stub(() => ({ transactions: [row("2", { status: "archived" })], totals, nextCursor: null }));
    const post = vi.spyOn(api, "post").mockRejectedValueOnce({ response: { status: 500, data: { message: "Não foi possível" } } });
    const expire = vi.fn();
    renderPage(<History />, { ...route, auth: fakeAuth({ expire }) });
    await screen.findByText("Item 2");
    await userEvent.click(screen.getByRole("button", { name: "Desarquivar Item 2" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desarquivar Item 2" })).toBeEnabled();

    const calls = searches(get).length;
    post.mockRejectedValueOnce({ response: { status: 404, data: {} } });
    await userEvent.click(screen.getByRole("button", { name: "Desarquivar Item 2" }));
    await waitFor(() => expect(searches(get).length).toBe(calls + 1));

    post.mockRejectedValueOnce({ response: { status: 401, data: {} } });
    await userEvent.click(screen.getByRole("button", { name: "Desarquivar Item 2" }));
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });

  test("Alterações do lançamento abre e fecha o histórico dele dentro do extrato", async () => {
    stub(() => ({ transactions: [row("1")], totals, nextCursor: null }));
    renderPage(<History />, route);
    await screen.findByText("Item 1");
    const btn = screen.getByRole("button", { name: "Alterações de Item 1" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Criado")).toBeInTheDocument();
    await userEvent.click(btn);
    expect(screen.queryByText("Criado")).toBeNull();
  });

  test("erro de carregamento tem 'Tentar de novo'; 401 expira", async () => {
    let fail = true;
    const get = stub(() => {
      if (fail) throw new Error("Network Error");
      return { transactions: [row("1")], totals, nextCursor: null };
    });
    renderPage(<History />, route);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Item 1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    get.mockRestore();

    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 401, data: {} } });
    const expire = vi.fn();
    renderPage(<History />, { ...route, auth: fakeAuth({ expire }) });
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });

  test("resposta de uma busca antiga não sobrescreve a mais nova", async () => {
    let releaseOld;
    stub((p) =>
      p.type === "input"
        ? { transactions: [row("new")], totals, nextCursor: null }
        : new Promise((resolve) => {
            releaseOld = () => resolve({ transactions: [row("old")], totals, nextCursor: null });
          })
    );
    renderPage(<History />, route);
    await waitFor(() => expect(releaseOld).toBeDefined());
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "input");
    expect(await screen.findByText("Item new")).toBeInTheDocument();
    releaseOld();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Item old")).toBeNull();
    expect(screen.getByText("Item new")).toBeInTheDocument();
  });

  test("enquanto a busca nova não chega, a lista antiga fica marcada como ocupada e sem cliques", async () => {
    let release;
    stub((p) =>
      p.type === "input"
        ? new Promise((resolve) => { release = () => resolve({ transactions: [row("new")], totals, nextCursor: null }); })
        : { transactions: [row("old", { status: "archived" })], totals, nextCursor: null }
    );
    renderPage(<History />, route);
    const list = await screen.findByRole("region", { name: "Extrato" });
    await screen.findByText("Item old");
    expect(list).toHaveAttribute("aria-busy", "false");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "input");
    await waitFor(() => expect(list).toHaveAttribute("aria-busy", "true"));
    expect(list).toHaveClass("pointer-events-none");
    release();
    expect(await screen.findByText("Item new")).toBeInTheDocument();
    expect(list).toHaveAttribute("aria-busy", "false");
  });

  test("o foco não se perde: Limpar filtros leva à busca; restaurar leva ao extrato", async () => {
    stub(() => ({ transactions: [row("3", { status: "deleted" })], totals, nextCursor: null }));
    vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<History />, route);
    await screen.findByText("Item 3");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "output");
    await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByLabelText("Buscar pela descrição")).toHaveFocus();
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar Item 3" }));
    await screen.findByText(/voltou para a lista e para o saldo/);
    expect(screen.getByRole("region", { name: "Extrato" })).toHaveFocus();
  });

  test("com valores ocultos, totais e valores das linhas ficam mascarados", async () => {
    stub(() => ({ transactions: [row("1", { value: 123456 })], totals: { count: 1, totalIn: 777700, totalOut: 123456 }, nextCursor: null }));
    renderPage(<History />, { ...route, privacy: { hidden: true, toggle: () => {} } });
    await screen.findByText("Item 1");
    expect(document.body.textContent).not.toMatch(/1\.234,56|7\.777,00/);
    expect(screen.getByLabelText("Totais do filtro")).toHaveTextContent("R$ ••••");
  });

  test("as abas trocam o painel e a aba fica na URL; teclado com setas", async () => {
    stub(() => ({ transactions: [row("1")], totals, nextCursor: null, events: [], deleted: [], archived: [] }));
    renderPage(<History />, route);
    await screen.findByText("Item 1");
    await userEvent.click(screen.getByRole("tab", { name: "Alterações" }));
    expect(screen.getByRole("tab", { name: "Alterações" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: "Alterações" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Extrato" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Extrato" })).toHaveAttribute("tabindex", "-1");
    screen.getByRole("tab", { name: "Alterações" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Extrato" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: "Extrato" })).toBeInTheDocument();
  });

  test("?situacao=archived abre o extrato já filtrado; valor desconhecido é ignorado", async () => {
    const get = stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    const first = renderPage(<History />, { path: "/history", route: "/history?situacao=archived" });
    await screen.findByText("Nenhum lançamento com esses filtros");
    expect(screen.getByLabelText("Situação")).toHaveValue("archived");
    expect(searches(get)[0]).toEqual({ status: "archived", limit: 30 });
    first.unmount();
    vi.restoreAllMocks();
    const get2 = stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(<History />, { path: "/history", route: "/history?situacao=%24ne" });
    await screen.findByText("Nenhum lançamento ainda");
    expect(searches(get2)[0]).toEqual({ status: "all", limit: 30 });
  });

  test("mudar ?situacao na URL com o extrato aberto (link, voltar, avançar) atualiza o filtro", async () => {
    const get = stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(
      <>
        <Link to="/history?situacao=archived">Ver arquivados</Link>
        <Link to="/history">Ver tudo</Link>
        <History />
      </>,
      { path: "/history", route: "/history" }
    );
    await screen.findByText("Nenhum lançamento ainda");
    expect(screen.getByLabelText("Situação")).toHaveValue("all");

    await userEvent.click(screen.getByRole("link", { name: "Ver arquivados" }));
    await waitFor(() => expect(screen.getByLabelText("Situação")).toHaveValue("archived"));
    await waitFor(() => expect(last(get)).toEqual({ status: "archived", limit: 30 }));

    await userEvent.click(screen.getByRole("link", { name: "Ver tudo" }));
    await waitFor(() => expect(screen.getByLabelText("Situação")).toHaveValue("all"));
    await waitFor(() => expect(last(get)).toEqual({ status: "all", limit: 30 }));
  });

  test("escolher a situação na tela não é desfeito por um novo render (a URL não manda depois de aberta)", async () => {
    const get = stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(<History />, { path: "/history", route: "/history?situacao=archived" });
    await screen.findByText("Nenhum lançamento com esses filtros");
    await userEvent.selectOptions(screen.getByLabelText("Situação"), "deleted");
    await waitFor(() => expect(last(get)).toEqual({ status: "deleted", limit: 30 }));
    expect(screen.getByLabelText("Situação")).toHaveValue("deleted");
  });

  test("aba desconhecida na URL cai no Extrato", async () => {
    stub(() => ({ transactions: [], totals: { count: 0, totalIn: 0, totalOut: 0 }, nextCursor: null }));
    renderPage(<History />, { path: "/history", route: "/history?aba=qualquer" });
    expect(await screen.findByRole("region", { name: "Extrato" })).toBeInTheDocument();
  });
});
