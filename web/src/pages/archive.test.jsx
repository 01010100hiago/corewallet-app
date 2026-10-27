import { describe, test, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { monthKeyOf } from "@corewallet/shared";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import Home from "./Home.jsx";
import History from "./History.jsx";

const current = monthKeyOf(new Date());
const at = "2026-10-27T13:40:00.000Z";
const tx = { id: "t1", type: "output", value: 4590, description: "Feira", category: "mercado", createdAt: at };
const home = (over = {}, monthOver = {}) => ({
  balance: -4590,
  totalIn: 0,
  totalOut: 4590,
  truncated: false,
  categories: [],
  transactions: [tx],
  month: { key: current, totalIn: 0, totalOut: 4590, count: 1, archivedCount: 0, categories: [], ...monthOver },
  ...over,
});
const archivedRow = (id, description, over = {}) => ({ id, type: "output", value: 8000, description, category: "lazer", createdAt: at, archivedAt: at, ...over });
const ev = (id, action, over = {}) => ({ id, transactionId: `t-${id}`, action, at, snapshot: { type: "output", value: 10000, description: "Feira", category: "lazer" }, changes: [], ...over });
const historyRoute = { path: "/history", route: "/history" };

describe("Home: arquivar", () => {
  test("arquivar chama a API, avisa que continua no saldo e Desfazer desarquiva", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: home() });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<Home />);
    get.mockResolvedValue({ data: home({ transactions: [] }, { count: 0, archivedCount: 1 }) });
    await userEvent.click(await screen.findByRole("button", { name: "Arquivar Feira" }));
    expect(post).toHaveBeenCalledWith("/transactions/t1/archive");
    expect(await screen.findByText("Lançamento arquivado.")).toBeInTheDocument();
    expect(screen.getByText(/continua contando no saldo/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Feira")).toBeNull());

    get.mockResolvedValue({ data: home() });
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(post).toHaveBeenCalledWith("/transactions/t1/unarchive");
    expect(await screen.findByText("Lançamento desarquivado.")).toBeInTheDocument();
    expect(await screen.findByText("Feira")).toBeInTheDocument();
  });

  test("arquivar não pede confirmação (é reversível) e o foco vai para o título da lista", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: home() });
    vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<Home />);
    get.mockResolvedValue({ data: home({ transactions: [] }, { count: 0, archivedCount: 1 }) });
    await userEvent.click(await screen.findByRole("button", { name: "Arquivar Feira" }));
    expect(screen.queryByRole("group", { name: /Excluir/ })).toBeNull();
    await screen.findByText("Lançamento arquivado.");
    expect(screen.getByRole("heading", { name: "Lançamentos", level: 2 })).toHaveFocus();
  });

  test("se arquivar falhar, o aviso explica e o lançamento continua na lista", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: home() });
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Arquivar Feira" }));
    expect(await screen.findByText(/Não foi possível arquivar: Erro interno/)).toBeInTheDocument();
    expect(screen.getByText("Feira")).toBeInTheDocument();
  });

  test("404 ao arquivar (já arquivado em outra aba) só recarrega; 401 encerra a sessão", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: home() });
    const post = vi.spyOn(api, "post").mockRejectedValueOnce({ response: { status: 404, data: {} } });
    const expire = vi.fn();
    renderPage(<Home />, { auth: fakeAuth({ expire }) });
    const calls = get.mock.calls.length;
    await userEvent.click(await screen.findByRole("button", { name: "Arquivar Feira" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
    expect(screen.queryByText(/Não foi possível/)).toBeNull();

    post.mockRejectedValueOnce({ response: { status: 401, data: {} } });
    await userEvent.click(screen.getByRole("button", { name: "Arquivar Feira" }));
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });

  test("o mês avisa quantos arquivados entram nos totais, com link para vê-los", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: home({}, { archivedCount: 2 }) });
    renderPage(<Home />);
    expect(await screen.findByText(/Os totais incluem 2 lançamentos arquivados/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver arquivados" })).toHaveAttribute("href", "/history");
  });

  test("no singular e sem arquivados não há aviso", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: home({}, { archivedCount: 1 }) });
    const first = renderPage(<Home />);
    expect(await screen.findByText(/Os totais incluem 1 lançamento arquivado,/)).toBeInTheDocument();
    first.unmount();
    get.mockResolvedValue({ data: home({}, { archivedCount: 0 }) });
    renderPage(<Home />);
    await screen.findByText("Feira");
    expect(screen.queryByText(/Os totais incluem/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver arquivados" })).toBeNull();
  });
});

describe("Histórico: arquivados", () => {
  const activity = (over = {}) => ({ events: [ev("1", "created")], deleted: [], archived: [], truncated: false, ...over });
  const stub = (data) => vi.spyOn(api, "get").mockImplementation(async (url) => ({ data: url === "/transactions/activity" ? data : { categories: [] } }));

  test("seção Arquivados lista o que está arquivado, com valor, categoria e data", async () => {
    stub(activity({ archived: [archivedRow("a1", "Curso antigo"), archivedRow("a2", "Viagem", { type: "input", category: "salario", value: 350000 })] }));
    renderPage(<History />, historyRoute);
    const section = await screen.findByRole("region", { name: "Arquivados" });
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Curso antigo");
    expect(rows[0]).toHaveTextContent("Despesa · R$ 80,00 · Lazer");
    expect(rows[0]).toHaveTextContent("27/10/2026 às 10:40");
    expect(rows[1]).toHaveTextContent("Receita");
    expect(within(section).getByText(/continuam no saldo|ainda contam no saldo/)).toBeInTheDocument();
  });

  test("sem arquivados a seção nem aparece", async () => {
    stub(activity());
    renderPage(<History />, historyRoute);
    await screen.findByRole("region", { name: "Alterações" });
    expect(screen.queryByRole("region", { name: "Arquivados" })).toBeNull();
  });

  test("desarquivar chama a API, avisa e recarrega a lista", async () => {
    const get = stub(activity({ archived: [archivedRow("a1", "Curso antigo")] }));
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<History />, historyRoute);
    get.mockImplementation(async (url) => ({ data: url === "/transactions/activity" ? activity({ events: [ev("2", "unarchived")] }) : { categories: [] } }));
    await userEvent.click(await screen.findByRole("button", { name: "Desarquivar Curso antigo" }));
    expect(post).toHaveBeenCalledWith("/transactions/a1/unarchive");
    expect(await screen.findByText(/“Curso antigo” voltou para a lista/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Arquivados" })).toBeNull());
  });

  test("se desarquivar falhar mostra o erro e mantém o botão; 404 só recarrega", async () => {
    const get = stub(activity({ archived: [archivedRow("a1", "Curso antigo")] }));
    const post = vi.spyOn(api, "post").mockRejectedValueOnce({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<History />, historyRoute);
    await userEvent.click(await screen.findByRole("button", { name: "Desarquivar Curso antigo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro interno");
    expect(screen.getByRole("button", { name: "Desarquivar Curso antigo" })).toBeEnabled();
    post.mockRejectedValueOnce({ response: { status: 404, data: {} } });
    const calls = get.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Desarquivar Curso antigo" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
  });

  test("avisa quando a lista de arquivados foi cortada, e só então", async () => {
    stub(activity({ archived: [archivedRow("a1", "Curso antigo")], archivedTruncated: true }));
    const first = renderPage(<History />, historyRoute);
    expect(await screen.findByText(/Mostrando os 200 arquivados mais recentes/)).toBeInTheDocument();
    first.unmount();
    stub(activity({ archived: [archivedRow("a1", "Curso antigo")], archivedTruncated: false }));
    renderPage(<History />, historyRoute);
    await screen.findByRole("region", { name: "Arquivados" });
    expect(screen.queryByText(/200 arquivados/)).toBeNull();
  });

  test("o registro mostra Arquivado e Desarquivado", async () => {
    stub(activity({ events: [ev("3", "unarchived"), ev("2", "archived"), ev("1", "created")] }));
    renderPage(<History />, historyRoute);
    const log = await screen.findByRole("region", { name: "Alterações" });
    expect(within(log).getByText("Arquivado")).toBeInTheDocument();
    expect(within(log).getByText("Desarquivado")).toBeInTheDocument();
  });
});
