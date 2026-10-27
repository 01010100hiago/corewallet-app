import { describe, test, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import Categories from "./Categories.jsx";

const PETS = { id: "a".repeat(24), type: "output", name: "Pets" };
const VIAGENS = { id: "b".repeat(24), type: "output", name: "Viagens" };
const BICOS = { id: "c".repeat(24), type: "input", name: "Bicos" };
const route = { path: "/categories", route: "/categories" };

function stub({ custom = [PETS, BICOS], usage = [] } = {}) {
  return vi.spyOn(api, "get").mockImplementation(async (url) => ({ data: url === "/categories/usage" ? { usage } : { categories: custom } }));
}
const group = (name) => screen.findByRole("region", { name });

describe("página de categorias", () => {
  test("lista as padrão (com a marca 'Padrão') e as suas, separadas em despesas e receitas", async () => {
    stub();
    renderPage(<Categories />, route);
    const despesas = await group("Categorias de despesas");
    expect(within(despesas).getByText("Supermercado")).toBeInTheDocument();
    expect(within(despesas).getByText("Pets")).toBeInTheDocument();
    expect(within(despesas).queryByText("Bicos")).toBeNull();
    expect(within(despesas).getAllByText("Padrão")).toHaveLength(8);
    const receitas = await group("Categorias de receitas");
    expect(within(receitas).getByText("Bicos")).toBeInTheDocument();
    expect(within(receitas).getByText("Renda extra")).toBeInTheDocument();
    expect(within(receitas).getAllByText("Padrão")).toHaveLength(5);
    expect(within(despesas).getByText("1 de 30 categorias suas")).toBeInTheDocument();
  });

  test("mostra quantos lançamentos usam cada uma", async () => {
    stub({
      usage: [
        { type: "output", category: PETS.id, count: 12 },
        { type: "output", category: "mercado", count: 1 },
        { type: "input", category: "salario", count: 40 },
      ],
    });
    renderPage(<Categories />, route);
    const despesas = await group("Categorias de despesas");
    expect(within(despesas.querySelector("li:has(button)")).getByText("12 lançamentos")).toBeInTheDocument();
    expect(within(despesas).getByText("Supermercado").closest("li")).toHaveTextContent("1 lançamento");
    expect(within(despesas).getByText("Lazer").closest("li")).toHaveTextContent("sem lançamentos");
    expect((await group("Categorias de receitas")).textContent).toContain("40 lançamentos");
  });

  test("as padrão não têm Renomear nem Apagar", async () => {
    stub({ custom: [] });
    renderPage(<Categories />, route);
    const despesas = await group("Categorias de despesas");
    expect(within(despesas).queryByRole("button", { name: /Renomear|Apagar/ })).toBeNull();
    expect(within(despesas).getByText("Você ainda não criou categorias de despesa.")).toBeInTheDocument();
  });

  describe("adicionar", () => {
    test("cria, avisa e recarrega a lista", async () => {
      const get = stub({ custom: [] });
      const post = vi.spyOn(api, "post").mockResolvedValue({ status: 201, data: { id: "d".repeat(24), type: "output", name: "Academia" } });
      renderPage(<Categories />, route);
      const despesas = await group("Categorias de despesas");
      get.mockImplementation(async (url) => ({ data: url === "/categories/usage" ? { usage: [] } : { categories: [{ id: "d".repeat(24), type: "output", name: "Academia" }] } }));
      await userEvent.type(within(despesas).getByLabelText("Nova categoria de despesa"), "  Academia ");
      await userEvent.click(within(despesas).getByRole("button", { name: "Adicionar" }));
      expect(post).toHaveBeenCalledWith("/categories", { type: "output", name: "Academia" });
      expect(await screen.findByText("Categoria “Academia” criada.")).toBeInTheDocument();
      expect(await within(await group("Categorias de despesas")).findByText("Academia")).toBeInTheDocument();
      expect(within(despesas).getByLabelText("Nova categoria de despesa")).toHaveValue("");
    });

    test("a de receitas manda o tipo certo", async () => {
      stub({ custom: [] });
      const post = vi.spyOn(api, "post").mockResolvedValue({ status: 201, data: { id: "e".repeat(24), type: "input", name: "Dividendos" } });
      renderPage(<Categories />, route);
      const receitas = await group("Categorias de receitas");
      await userEvent.type(within(receitas).getByLabelText("Nova categoria de receita"), "Dividendos{Enter}");
      expect(post).toHaveBeenCalledWith("/categories", { type: "input", name: "Dividendos" });
    });

    test("nome inválido não chama a API e explica", async () => {
      stub({ custom: [] });
      const post = vi.spyOn(api, "post");
      renderPage(<Categories />, route);
      const despesas = await group("Categorias de despesas");
      await userEvent.type(within(despesas).getByLabelText("Nova categoria de despesa"), "a");
      await userEvent.click(within(despesas).getByRole("button", { name: "Adicionar" }));
      expect(await within(despesas).findByRole("alert")).toHaveTextContent(/mínimo 2/);
      expect(post).not.toHaveBeenCalled();
    });

    test("se já existia (200), avisa em vez de dizer que criou", async () => {
      stub({ custom: [] });
      vi.spyOn(api, "post").mockResolvedValue({ status: 200, data: { id: "mercado", type: "output", name: "Supermercado" } });
      renderPage(<Categories />, route);
      const despesas = await group("Categorias de despesas");
      await userEvent.type(within(despesas).getByLabelText("Nova categoria de despesa"), "mercado{Enter}");
      expect(await screen.findByText("A categoria “Supermercado” já existia.")).toBeInTheDocument();
    });

    test("erro da API aparece junto do campo", async () => {
      stub({ custom: [] });
      vi.spyOn(api, "post").mockRejectedValue({ response: { status: 422, data: { errors: { name: "Você já tem 30 categorias deste tipo" } } } });
      renderPage(<Categories />, route);
      const despesas = await group("Categorias de despesas");
      await userEvent.type(within(despesas).getByLabelText("Nova categoria de despesa"), "Outra{Enter}");
      expect(await within(despesas).findByRole("alert")).toHaveTextContent("30 categorias");
    });

    test("com 30 categorias o campo fica desligado e explica", async () => {
      const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i).padStart(24, "0"), type: "output", name: `Cat ${i}` }));
      stub({ custom: many });
      renderPage(<Categories />, route);
      const despesas = await group("Categorias de despesas");
      expect(within(despesas).getByLabelText("Nova categoria de despesa")).toBeDisabled();
      expect(within(despesas).getByRole("button", { name: "Adicionar" })).toBeDisabled();
      expect(within(despesas).getByText(/limite de 30 categorias/)).toBeInTheDocument();
      expect(within(despesas).getByText("30 de 30 categorias suas")).toBeInTheDocument();
    });
  });

  describe("renomear", () => {
    test("abre com o nome atual, salva com PATCH e avisa", async () => {
      stub();
      const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { ...PETS, name: "Animais" } });
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Renomear Pets" }));
      const input = screen.getByLabelText("Novo nome de Pets");
      expect(input).toHaveValue("Pets");
      expect(input).toHaveFocus();
      await userEvent.clear(input);
      await userEvent.type(input, "  Animais ");
      await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
      expect(patch).toHaveBeenCalledWith(`/categories/${PETS.id}`, { name: "Animais" });
      expect(await screen.findByText("Categoria renomeada para “Animais”.")).toBeInTheDocument();
    });

    test("sem mudar o nome, fecha sem chamar a API", async () => {
      stub();
      const patch = vi.spyOn(api, "patch");
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Renomear Pets" }));
      await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
      expect(patch).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Novo nome de Pets")).toBeNull();
    });

    test("nome inválido, conflito (409) e cancelar", async () => {
      stub();
      const patch = vi.spyOn(api, "patch").mockRejectedValue({ response: { status: 409, data: { errors: { name: "Você já tem uma categoria com esse nome." } } } });
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Renomear Pets" }));
      const input = screen.getByLabelText("Novo nome de Pets");
      await userEvent.clear(input);
      await userEvent.type(input, "a");
      await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/mínimo 2/);
      expect(patch).not.toHaveBeenCalled();

      await userEvent.clear(input);
      await userEvent.type(input, "Viagens");
      await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
      expect(await screen.findByText("Você já tem uma categoria com esse nome.")).toBeInTheDocument();
      expect(screen.getByLabelText("Novo nome de Pets")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByLabelText("Novo nome de Pets")).toBeNull();
      expect(screen.getByText("Pets")).toBeInTheDocument();
    });
  });

  describe("apagar", () => {
    test("sem lançamentos: confirma e apaga sem pedir destino", async () => {
      stub();
      const del = vi.spyOn(api, "delete").mockResolvedValue({ data: { moved: 0 } });
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Apagar Pets" }));
      const box = screen.getByRole("group", { name: "Apagar Pets" });
      expect(box).toHaveTextContent("Nenhum lançamento usa esta categoria");
      expect(within(box).queryByRole("combobox")).toBeNull();
      await userEvent.click(within(box).getByRole("button", { name: "Apagar" }));
      expect(del).toHaveBeenCalledWith(`/categories/${PETS.id}`, { params: {} });
      expect(await screen.findByText("Categoria “Pets” apagada.")).toBeInTheDocument();
    });

    test("com lançamentos: pede o destino (padrão e outras suas, sem a própria) e move", async () => {
      stub({ custom: [PETS, VIAGENS, BICOS], usage: [{ type: "output", category: PETS.id, count: 3 }] });
      const del = vi.spyOn(api, "delete").mockResolvedValue({ data: { moved: 3 } });
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Apagar Pets" }));
      const box = screen.getByRole("group", { name: "Apagar Pets" });
      expect(box).toHaveTextContent("“Pets” tem 3 lançamentos");
      const select = within(box).getByLabelText("Mover para");
      const options = within(select).getAllByRole("option").map((o) => o.textContent);
      expect(options).toContain("Outras despesas");
      expect(options).toContain("Viagens");
      expect(options).toContain("Supermercado");
      expect(options).not.toContain("Pets");
      expect(options).not.toContain("Bicos"); // categoria de receita não serve para despesa
      expect(select).toHaveValue("outros");
      await userEvent.selectOptions(select, VIAGENS.id);
      await userEvent.click(within(box).getByRole("button", { name: "Mover e apagar" }));
      expect(del).toHaveBeenCalledWith(`/categories/${PETS.id}`, { params: { moveTo: VIAGENS.id } });
      expect(await screen.findByText(/3 lançamentos foram movidos para “Viagens”/)).toBeInTheDocument();
    });

    test("um único lançamento usa o singular", async () => {
      stub({ usage: [{ type: "output", category: PETS.id, count: 1 }] });
      vi.spyOn(api, "delete").mockResolvedValue({ data: { moved: 1 } });
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Apagar Pets" }));
      const box = screen.getByRole("group", { name: "Apagar Pets" });
      expect(box).toHaveTextContent("tem 1 lançamento. Para onde movê-lo?");
      await userEvent.click(within(box).getByRole("button", { name: "Mover e apagar" }));
      expect(await screen.findByText(/1 lançamento foi movido para “Outras despesas”/)).toBeInTheDocument();
    });

    test("erro da API fica na caixa e a categoria continua; cancelar fecha", async () => {
      stub({ usage: [{ type: "output", category: PETS.id, count: 2 }] });
      vi.spyOn(api, "delete").mockRejectedValue({ response: { status: 422, data: { errors: { moveTo: "Categoria de destino inválida" } } } });
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Apagar Pets" }));
      const box = screen.getByRole("group", { name: "Apagar Pets" });
      await userEvent.click(within(box).getByRole("button", { name: "Mover e apagar" }));
      expect(await within(box).findByRole("alert")).toHaveTextContent("Categoria de destino inválida");
      expect(within(box).getByRole("button", { name: "Mover e apagar" })).toBeEnabled();
      await userEvent.click(within(box).getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("group", { name: "Apagar Pets" })).toBeNull();
      expect(screen.getByText("Pets")).toBeInTheDocument();
    });

    test("renomear e apagar não ficam abertos ao mesmo tempo", async () => {
      stub();
      renderPage(<Categories />, route);
      await userEvent.click(await screen.findByRole("button", { name: "Apagar Pets" }));
      expect(screen.getByRole("group", { name: "Apagar Pets" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Renomear Pets" }));
      expect(screen.queryByRole("group", { name: "Apagar Pets" })).toBeNull();
      expect(screen.getByLabelText("Novo nome de Pets")).toBeInTheDocument();
    });
  });

  test("o foco volta para onde estava: cancelar devolve ao botão; concluir leva ao aviso; o painel de apagar recebe o foco", async () => {
    stub();
    vi.spyOn(api, "patch").mockResolvedValue({ data: { ...PETS, name: "Animais" } });
    renderPage(<Categories />, route);
    await userEvent.click(await screen.findByRole("button", { name: "Renomear Pets" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Renomear Pets" })).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "Apagar Pets" }));
    expect(screen.getByRole("group", { name: "Apagar Pets" })).toHaveFocus();
    await userEvent.click(within(screen.getByRole("group", { name: "Apagar Pets" })).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apagar Pets" })).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "Renomear Pets" }));
    await userEvent.clear(screen.getByLabelText("Novo nome de Pets"));
    await userEvent.type(screen.getByLabelText("Novo nome de Pets"), "Animais");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByText("Categoria renomeada para “Animais”.").closest("p")).toHaveFocus());
  });

  test("carregando, erro com nova tentativa e 401", async () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    const first = renderPage(<Categories />, route);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando categorias");
    first.unmount();

    const get = vi.spyOn(api, "get").mockRejectedValueOnce(new Error("Network Error")).mockRejectedValueOnce(new Error("Network Error"));
    const second = renderPage(<Categories />, route);
    expect(await screen.findByRole("alert")).toHaveTextContent(/conectar/);
    get.mockImplementation(async (url) => ({ data: url === "/categories/usage" ? { usage: [] } : { categories: [] } }));
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("region", { name: "Categorias de despesas" })).toBeInTheDocument();
    second.unmount();

    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 401, data: {} } });
    const expire = vi.fn();
    renderPage(<Categories />, { ...route, auth: fakeAuth({ expire }) });
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });
});
