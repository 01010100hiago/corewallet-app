import { describe, test, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import History from "./History.jsx";
import Home from "./Home.jsx";
import NewTransaction from "./NewTransaction.jsx";
import EditTransaction from "./EditTransaction.jsx";
import { monthKeyOf } from "@corewallet/shared";

const current = monthKeyOf(new Date());
const at = "2026-10-27T13:40:00.000Z"; // 10:40 em Brasília
const snap = (over = {}) => ({ type: "output", value: 10000, description: "Feira", category: "lazer", ...over });
const ev = (id, action, over = {}) => ({ id, transactionId: `t-${id}`, action, at, snapshot: snap(), changes: [], ...over });
const route = { path: "/history", route: "/history" };
const getsByUrl = (map) => vi.spyOn(api, "get").mockImplementation(async (url) => ({ data: map[url] ?? { categories: [] } }));

describe("página de histórico", () => {
  test("lista criado, editado, excluído e restaurado, com o que mudou e a hora de Brasília", async () => {
    getsByUrl({
      "/transactions/activity": {
        events: [
          ev("4", "restored", { snapshot: snap({ description: "Voltou" }) }),
          ev("3", "deleted", { snapshot: snap({ description: "Apagado", value: 4590 }) }),
          ev("2", "edited", {
            snapshot: snap({ description: "Feira grande" }),
            changes: [
              { field: "value", from: 12050, to: 10000 },
              { field: "category", from: "mercado", to: "lazer" },
              { field: "description", from: "Feira", to: "Feira grande" },
            ],
          }),
          ev("1", "created", { snapshot: snap({ description: "Salário", type: "input", category: "salario", value: 350000 }) }),
        ],
      },
      "/categories": { categories: [] },
    });
    renderPage(<History />, route);
    const list = await screen.findByRole("region", { name: "Alterações" });
    const items = within(list).getAllByRole("listitem").filter((li) => li.parentElement.tagName === "UL" && li.querySelector("time"));
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Restaurado");
    expect(items[1]).toHaveTextContent("Excluído");
    expect(items[1]).toHaveTextContent("45,90");
    expect(items[2]).toHaveTextContent("Editado");
    expect(items[2]).toHaveTextContent("Valor: R$ 120,50 → R$ 100,00");
    expect(items[2]).toHaveTextContent("Categoria: Supermercado → Lazer");
    expect(items[2]).toHaveTextContent("Descrição: “Feira” → “Feira grande”");
    expect(items[3]).toHaveTextContent("Criado");
    expect(items[3]).toHaveTextContent("Receita");
    expect(items[3]).toHaveTextContent("Salário");
    expect(within(items[0]).getByText(/27\/10 às 10:40/)).toBeInTheDocument();
  });

  const gone = (id, description, over = {}) => ({ id, type: "output", value: 4590, description, category: "mercado", createdAt: at, deletedAt: at, ...over });

  test("seção Excluídos lista o que está excluído, com valor, categoria e data, e o botão Restaurar", async () => {
    getsByUrl({
      "/transactions/activity": {
        events: [ev("1", "deleted", { snapshot: snap({ description: "Apagado" }) })],
        deleted: [gone("t-1", "Apagado"), gone("t-9", "Muito antigo", { type: "input", category: "salario", value: 350000 })],
        truncated: false,
      },
    });
    renderPage(<History />, route);
    const section = await screen.findByRole("region", { name: "Excluídos" });
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Apagado");
    expect(rows[0]).toHaveTextContent("Despesa · R$ 45,90 · Supermercado");
    expect(rows[0]).toHaveTextContent("27/10/2026 às 10:40");
    expect(rows[1]).toHaveTextContent("Receita");
    expect(rows[1]).toHaveTextContent("Salário");
    expect(within(section).getByRole("button", { name: "Restaurar Apagado" })).toBeInTheDocument();
    // O registro de alterações é só informação: o botão de restaurar não se repete lá.
    const log = screen.getByRole("region", { name: "Alterações" });
    expect(within(log).queryByRole("button", { name: /Restaurar/ })).toBeNull();
  });

  test("sem excluídos a seção nem aparece", async () => {
    getsByUrl({ "/transactions/activity": { events: [ev("1", "created")], deleted: [], truncated: false } });
    renderPage(<History />, route);
    await screen.findByRole("region", { name: "Alterações" });
    expect(screen.queryByRole("region", { name: "Excluídos" })).toBeNull();
  });

  test("um excluído antigo, que não está nos eventos mostrados, continua com o botão Restaurar", async () => {
    getsByUrl({ "/transactions/activity": { events: [ev("1", "created", { snapshot: snap({ description: "Recente" }) })], deleted: [gone("t-old", "Excluído faz meses")], truncated: true } });
    renderPage(<History />, route);
    expect(await screen.findByRole("button", { name: "Restaurar Excluído faz meses" })).toBeInTheDocument();
    expect(screen.getByText(/Mostrando as 100 alterações mais recentes/)).toBeInTheDocument();
  });

  test("avisa quando a lista de excluídos foi cortada", async () => {
    getsByUrl({ "/transactions/activity": { events: [ev("1", "created")], deleted: [gone("t-1", "Apagado")], truncated: false, deletedTruncated: true } });
    renderPage(<History />, route);
    expect(await screen.findByText(/Mostrando os 200 excluídos mais recentes/)).toBeInTheDocument();
  });

  test("sem corte não há aviso de limite", async () => {
    getsByUrl({ "/transactions/activity": { events: [ev("1", "created")], deleted: [], truncated: false } });
    renderPage(<History />, route);
    await screen.findByRole("region", { name: "Alterações" });
    expect(screen.queryByText(/100 alterações/)).toBeNull();
  });

  test("restaurar chama a API, avisa e recarrega a lista", async () => {
    const get = getsByUrl({ "/transactions/activity": { events: [ev("2", "deleted")], deleted: [gone("t-2", "Apagado")], truncated: false } });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<History />, route);
    get.mockImplementation(async (url) => ({ data: url === "/transactions/activity" ? { events: [ev("3", "restored"), ev("2", "deleted")], deleted: [], truncated: false } : { categories: [] } }));
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar Apagado" }));
    expect(post).toHaveBeenCalledWith("/transactions/t-2/restore");
    expect(await screen.findByText(/“Apagado” voltou para a lista e para o saldo/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Excluídos" })).toBeNull());
  });

  test("se restaurar falhar, mostra o erro e mantém o botão; 404 só recarrega", async () => {
    const get = getsByUrl({ "/transactions/activity": { events: [ev("2", "deleted")], deleted: [gone("t-2", "Apagado")], truncated: false } });
    const post = vi.spyOn(api, "post").mockRejectedValueOnce({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<History />, route);
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar Apagado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro interno");
    expect(screen.getByRole("button", { name: "Restaurar Apagado" })).toBeEnabled();

    post.mockRejectedValueOnce({ response: { status: 404, data: {} } });
    const calls = get.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Restaurar Apagado" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
  });

  test("histórico vazio e erro de carregamento", async () => {
    getsByUrl({ "/transactions/activity": { events: [] } });
    const first = renderPage(<History />, route);
    expect(await screen.findByText("Nada registrado ainda")).toBeInTheDocument();
    first.unmount();
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network Error"));
    renderPage(<History />, route);
    expect(await screen.findByRole("alert")).toHaveTextContent(/conectar/);
  });

  test("401 encerra a sessão", async () => {
    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 401, data: {} } });
    const expire = vi.fn();
    renderPage(<History />, { ...route, auth: fakeAuth({ expire }) });
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });
});

describe("histórico dentro da lista", () => {
  const tx = { id: "t1", type: "output", value: 4590, description: "Feira", category: "mercado", createdAt: at };
  const home = { balance: 0, totalIn: 0, totalOut: 4590, truncated: false, categories: [], transactions: [tx], month: { key: current, totalIn: 0, totalOut: 4590, count: 1, categories: [] } };

  test("o botão Histórico abre os eventos do lançamento e fecha de novo", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) =>
      url === "/transactions/t1/history"
        ? { data: { deleted: false, events: [ev("2", "edited", { changes: [{ field: "value", from: 5000, to: 4590 }] }), ev("1", "created")] } }
        : { data: home }
    );
    renderPage(<Home />);
    const button = await screen.findByRole("button", { name: "Histórico de Feira" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Valor: R$ 50,00 → R$ 45,90")).toBeInTheDocument();
    expect(screen.getByText("Criado")).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.queryByText("Valor: R$ 50,00 → R$ 45,90")).toBeNull();
  });

  test("lançamento de antes do histórico abre com uma explicação em vez de uma lista vazia", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) => (url === "/transactions/t1/history" ? { data: { deleted: false, events: [] } } : { data: home }));
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Histórico de Feira" }));
    expect(await screen.findByText(/de antes do histórico existir/)).toBeInTheDocument();
  });

  test("depois de excluir aparece 'Ele continua no histórico' e Desfazer restaura", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: home });
    vi.spyOn(api, "delete").mockResolvedValue({ status: 204 });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    get.mockResolvedValue({ data: { ...home, transactions: [], totalOut: 0, month: { ...home.month, totalOut: 0, count: 0 } } });
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    expect(await screen.findByText("Lançamento excluído.")).toBeInTheDocument();
    expect(screen.getByText(/Ele continua no histórico/)).toBeInTheDocument();

    get.mockResolvedValue({ data: home });
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(post).toHaveBeenCalledWith("/transactions/t1/restore");
    expect(await screen.findByText("Lançamento restaurado.")).toBeInTheDocument();
    expect(await screen.findByText("Feira")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
  });

  test("se o Desfazer falhar, o aviso explica", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: home });
    vi.spyOn(api, "delete").mockResolvedValue({ status: 204 });
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "Excluir Feira" }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, excluir" }));
    await userEvent.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText(/Não foi possível restaurar: Erro interno/)).toBeInTheDocument();
  });

  test("a linha mostra o nome da categoria criada pela pessoa", async () => {
    const pets = { id: "b".repeat(24), type: "output", name: "Pets" };
    vi.spyOn(api, "get").mockResolvedValue({ data: { ...home, categories: [pets], transactions: [{ ...tx, category: pets.id }] } });
    renderPage(<Home />);
    expect(await screen.findByText(/Pets ·/)).toBeInTheDocument();
  });
});

describe("categoria nova no formulário", () => {
  const newRoute = { path: "/transaction/:type", route: "/transaction/output" };
  const fillBase = async () => {
    await userEvent.type(screen.getByLabelText("Valor (R$)"), "80");
    await userEvent.type(screen.getByLabelText("Descrição"), "Ração");
  };

  test("oferece as categorias da pessoa junto das padrão e a opção de criar", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [{ id: "c".repeat(24), type: "output", name: "Pets" }, { id: "d".repeat(24), type: "input", name: "Bicos" }] } });
    renderPage(<NewTransaction />, newRoute);
    await waitFor(() => expect(within(screen.getByLabelText("Categoria")).getByRole("option", { name: "Pets" })).toBeInTheDocument());
    const names = within(screen.getByLabelText("Categoria")).getAllByRole("option").map((o) => o.textContent);
    expect(names).toContain("Supermercado");
    expect(names).not.toContain("Bicos");
    expect(names.at(-1)).toBe("+ Nova categoria…");
  });

  test("cria a categoria ali mesmo, seleciona e envia o lançamento com ela", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [] } });
    const id = "e".repeat(24);
    const post = vi.spyOn(api, "post").mockImplementation(async (url) => ({ data: url === "/categories" ? { id, type: "output", name: "Pets" } : {} }));
    renderPage(<NewTransaction />, newRoute);
    await fillBase();
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    const group = screen.getByRole("group", { name: "Nova categoria" });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await userEvent.type(within(group).getByLabelText("Nome da nova categoria"), "  Pets ");
    await userEvent.click(within(group).getByRole("button", { name: "Criar categoria" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/categories", { type: "output", name: "Pets" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Nova categoria" })).toBeNull());
    expect(screen.getByLabelText("Categoria")).toHaveValue(id);
    expect(within(screen.getByLabelText("Categoria")).getByRole("option", { name: "Pets" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/transactions", { value: "80", description: "Ração", category: id, type: "output" }));
  });

  test("Enter no nome cria a categoria sem enviar o lançamento", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [] } });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { id: "f".repeat(24), type: "output", name: "Pets" } });
    renderPage(<NewTransaction />, newRoute);
    await fillBase();
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    await userEvent.type(screen.getByLabelText("Nome da nova categoria"), "Pets{Enter}");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/categories", { type: "output", name: "Pets" }));
    expect(post).not.toHaveBeenCalledWith("/transactions", expect.anything());
  });

  test("nome inválido não chama a API; erro da API aparece no grupo", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [] } });
    const post = vi.spyOn(api, "post").mockRejectedValue({ response: { status: 422, data: { errors: { name: "Você já tem 30 categorias deste tipo" } } } });
    renderPage(<NewTransaction />, newRoute);
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    const group = screen.getByRole("group", { name: "Nova categoria" });
    await userEvent.type(within(group).getByLabelText("Nome da nova categoria"), "a");
    await userEvent.click(within(group).getByRole("button", { name: "Criar categoria" }));
    expect(await within(group).findByRole("alert")).toHaveTextContent(/mínimo 2/);
    expect(post).not.toHaveBeenCalled();
    await userEvent.type(within(group).getByLabelText("Nome da nova categoria"), "bc");
    await userEvent.click(within(group).getByRole("button", { name: "Criar categoria" }));
    expect(await within(group).findByRole("alert")).toHaveTextContent(/30 categorias/);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  test("cancelar volta para a categoria que estava escolhida (não para Outros) e devolve o foco ao campo", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [] } });
    renderPage(<NewTransaction />, newRoute);
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "transporte");
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    const group = screen.getByRole("group", { name: "Nova categoria" });
    await userEvent.click(within(group).getAllByRole("button")[0]); // Cancelar
    expect(screen.getByLabelText("Categoria")).toHaveValue("transporte");
    expect(screen.getByLabelText("Categoria")).toHaveFocus();
  });

  test("depois de criar a categoria o foco volta para o campo Categoria", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [] } });
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: "7".repeat(24), type: "output", name: "Pets" } });
    renderPage(<NewTransaction />, newRoute);
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    await userEvent.type(screen.getByLabelText("Nome da nova categoria"), "Pets{Enter}");
    await waitFor(() => expect(screen.getByLabelText("Categoria")).toHaveFocus());
    expect(screen.getByLabelText("Categoria")).toHaveValue("7".repeat(24));
  });

  test("na edição, cancelar a nova categoria mantém a categoria que o lançamento já tinha", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url === "/categories" ? { categories: [] } : { id: "t1", type: "output", value: 4590, description: "Feira", category: "mercado", createdAt: at },
    }));
    renderPage(<EditTransaction />, { path: "/transaction/:id/edit", route: "/transaction/t1/edit" });
    await screen.findByRole("heading", { name: "Editar despesa" });
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    await userEvent.click(within(screen.getByRole("group", { name: "Nova categoria" })).getAllByRole("button")[0]);
    expect(screen.getByLabelText("Categoria")).toHaveValue("mercado");
  });

  test("cancelar volta para 'Outros'; nome igual a uma padrão usa a padrão sem duplicar", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { categories: [] } });
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: "mercado", type: "output", name: "Mercado" } });
    renderPage(<NewTransaction />, newRoute);
    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar", description: "" }).closest("div").querySelector("button"));
    expect(screen.getByLabelText("Categoria")).toHaveValue("outros");

    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "+ Nova categoria…");
    await userEvent.type(screen.getByLabelText("Nome da nova categoria"), "mercado");
    await userEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    await waitFor(() => expect(screen.getByLabelText("Categoria")).toHaveValue("mercado"));
    expect(within(screen.getByLabelText("Categoria")).getAllByRole("option", { name: "Supermercado" })).toHaveLength(1);
  });

  test("se as categorias não carregarem, avisa e continua com as padrão", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("rede"));
    renderPage(<NewTransaction />, newRoute);
    expect(await screen.findByText(/Só as padrão aparecem/)).toBeInTheDocument();
    expect(within(screen.getByLabelText("Categoria")).getByRole("option", { name: "Supermercado" })).toBeInTheDocument();
  });

  test("na edição, uma categoria própria já escolhida continua selecionada", async () => {
    const pets = { id: "9".repeat(24), type: "output", name: "Pets" };
    vi.spyOn(api, "get").mockImplementation(async (url) => ({
      data: url === "/categories" ? { categories: [pets] } : { id: "t1", type: "output", value: 8000, description: "Ração", category: pets.id, createdAt: at },
    }));
    renderPage(<EditTransaction />, { path: "/transaction/:id/edit", route: "/transaction/t1/edit" });
    await screen.findByRole("heading", { name: "Editar despesa" });
    await waitFor(() => expect(within(screen.getByLabelText("Categoria")).getByRole("option", { name: "Pets" })).toBeInTheDocument());
    expect(screen.getByLabelText("Categoria")).toHaveValue(pets.id);
    expect(screen.getByText(/fica registrada no histórico|registrada no histórico/)).toBeInTheDocument();
  });
});
