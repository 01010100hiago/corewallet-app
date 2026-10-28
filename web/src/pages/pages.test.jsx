import { describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage, fakeAuth } from "../test/render.jsx";
import { api } from "../lib/api.js";
import Signin from "./Signin.jsx";
import Signup from "./Signup.jsx";
import Home from "./Home.jsx";
import NewTransaction from "./NewTransaction.jsx";

describe("Signin", () => {
  test("mostra os erros de validação sem chamar a API", async () => {
    const signin = vi.fn();
    renderPage(<Signin />, { auth: fakeAuth({ status: "anonymous", user: null, signin }) });
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Email inválido")).toBeInTheDocument();
    expect(screen.getByText("A senha é obrigatória")).toBeInTheDocument();
    expect(signin).not.toHaveBeenCalled();
  });

  test("entra e vai para a página inicial", async () => {
    const signin = vi.fn().mockResolvedValue();
    renderPage(<Signin />, { path: "/signin", auth: fakeAuth({ status: "anonymous", user: null, signin }) });
    await userEvent.type(screen.getByLabelText("Email"), "  Maria@Exemplo.com ");
    await userEvent.type(screen.getByLabelText("Senha"), "senha-segura-123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signin).toHaveBeenCalledOnce());
    // O campo type="email" já tira os espaços das pontas; as minúsculas ficam por conta da API.
    expect(signin).toHaveBeenCalledWith({ email: "Maria@Exemplo.com", password: "senha-segura-123" });
    expect(await screen.findByText("página inicial")).toBeInTheDocument();
  });

  test("avisa quando a sessão venceu sozinha", () => {
    renderPage(<Signin />, { auth: fakeAuth({ status: "anonymous", user: null, notice: "expired" }) });
    expect(screen.getByRole("status")).toHaveTextContent(/Sua sessão venceu/);
  });

  test("não mostra aviso de sessão vencida num login normal", () => {
    renderPage(<Signin />, { auth: fakeAuth({ status: "anonymous", user: null }) });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("o título da aba é o da tela", () => {
    renderPage(<Signin />, { auth: fakeAuth({ status: "anonymous", user: null }) });
    expect(document.title).toBe("Entrar · CoreWallet");
  });

  test("mostra a mensagem que a API devolveu quando o login falha", async () => {
    const signin = vi.fn().mockRejectedValue({ response: { data: { message: "Email ou senha incorretos" } } });
    renderPage(<Signin />, { auth: fakeAuth({ status: "anonymous", user: null, signin }) });
    await userEvent.type(screen.getByLabelText("Email"), "maria@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha"), "errada");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Email ou senha incorretos")).toBeInTheDocument();
  });
});

describe("Signup", () => {
  async function fill({ password = "senha-segura-123", confirm = "senha-segura-123" } = {}) {
    await userEvent.type(screen.getByLabelText("Nome completo"), "maria silva");
    await userEvent.type(screen.getByLabelText("Email"), "maria@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha"), password);
    await userEvent.type(screen.getByLabelText("Confirme a senha"), confirm);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  }

  test("o campo de senha aponta para as regras (aria-describedby)", () => {
    renderPage(<Signup />, { auth: fakeAuth() });
    expect(screen.getByLabelText("Senha")).toHaveAttribute("aria-describedby", "password-rules");
    expect(document.getElementById("password-rules")).toBeInTheDocument();
  });

  test("recusa senhas diferentes e senha curta", async () => {
    const signup = vi.fn();
    renderPage(<Signup />, { auth: fakeAuth({ signup }) });
    await fill({ password: "curta", confirm: "outra" });
    expect(await screen.findByText(/no mínimo 8 caracteres/)).toBeInTheDocument();
    expect(screen.getByText("As senhas não correspondem")).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  test("manda só nome, email e senha (sem a confirmação) e vai para o login", async () => {
    const signup = vi.fn().mockResolvedValue();
    renderPage(<Signup />, { path: "/signup", auth: fakeAuth({ signup }) });
    await fill();
    await waitFor(() => expect(signup).toHaveBeenCalledOnce());
    expect(signup.mock.calls[0][0]).toEqual({ name: "maria silva", email: "maria@exemplo.com", password: "senha-segura-123" });
    expect(await screen.findByText("página de login")).toBeInTheDocument();
  });

  test("mostra erro de email já cadastrado", async () => {
    const signup = vi.fn().mockRejectedValue({ response: { data: { message: "Este email já está cadastrado" } } });
    renderPage(<Signup />, { auth: fakeAuth({ signup }) });
    await fill();
    expect(await screen.findByText("Este email já está cadastrado")).toBeInTheDocument();
  });
});

describe("Home", () => {
  const list = [
    { id: "2", type: "output", value: 2550, description: "Almoço", createdAt: "2026-10-26T12:00:00.000Z" },
    { id: "1", type: "input", value: 100000, description: "Salário", createdAt: "2026-10-25T12:00:00.000Z" },
  ];

  test("lista os lançamentos e calcula o saldo", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { transactions: list, balance: 97450, truncated: false } });
    renderPage(<Home />);
    expect(await screen.findByText("Salário")).toBeInTheDocument();
    expect(screen.getByText("Almoço")).toBeInTheDocument();
    expect(screen.getByTestId("balance").textContent).toMatch(/974,50/);
    expect(screen.getByText("Olá, Maria Silva")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nova receita/ })).toHaveAttribute("href", "/transaction/input");
    expect(screen.getByRole("link", { name: /Nova despesa/ })).toHaveAttribute("href", "/transaction/output");
  });

  test("avisa que a lista foi cortada, e o saldo vem da API (não da soma da lista)", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { transactions: list, balance: 555555, truncated: true } });
    renderPage(<Home />);
    expect(await screen.findByText(/Mostrando os 2 lançamentos mais recentes/)).toBeInTheDocument();
    expect(screen.getByTestId("balance").textContent).toMatch(/5\.555,55/);
  });

  test("mostra aviso quando não há lançamentos", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { transactions: [], balance: 0, truncated: false } });
    renderPage(<Home />);
    expect(await screen.findByText(/Nenhum lançamento registrado/)).toBeInTheDocument();
  });

  test("mostra o erro quando a API cai", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network Error"));
    renderPage(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/conectar ao servidor/);
    expect(screen.queryByText(/Ainda não há entradas/)).not.toBeInTheDocument();
    // Sem resposta da API o saldo não pode virar R$ 0,00: seria um número inventado.
    expect(screen.getByTestId("balance")).toHaveTextContent("—");
  });

  test("sessão vencida (401) chama expire", async () => {
    const expire = vi.fn();
    vi.spyOn(api, "get").mockRejectedValue({ response: { status: 401, data: {} } });
    renderPage(<Home />, { auth: fakeAuth({ expire }) });
    await waitFor(() => expect(expire).toHaveBeenCalled());
  });
});

describe("NewTransaction", () => {
  test("tipo desconhecido na URL volta para a página inicial", () => {
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/transferencia" });
    expect(screen.getByText("página inicial")).toBeInTheDocument();
  });

  test("valida valor e descrição", async () => {
    const post = vi.spyOn(api, "post");
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/input" });
    await userEvent.type(screen.getByLabelText("Valor (R$)"), "abc");
    await userEvent.type(screen.getByLabelText("Descrição"), "ab");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Valor inválido/)).toBeInTheDocument();
    expect(screen.getByText(/no mínimo 3 caracteres/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("envia o valor como digitado, com o tipo da URL, e volta para a home", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/output" });
    expect(screen.getByRole("heading", { name: "Nova despesa" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Valor (R$)"), "19,90");
    await userEvent.type(screen.getByLabelText("Descrição"), "  Mercado ");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith("/transactions", { value: "19,90", description: "  Mercado ", category: "outros", type: "output" });
    expect(await screen.findByText("página inicial")).toBeInTheDocument();
  });

  test("se a rede cair, avisa que pode ter sido salvo", async () => {
    vi.spyOn(api, "post").mockRejectedValue({ code: "ECONNABORTED" });
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/output" });
    await userEvent.type(screen.getByLabelText("Valor (R$)"), "10");
    await userEvent.type(screen.getByLabelText("Descrição"), "Teste");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Não conseguimos confirmar se o lançamento foi salvo/)).toBeInTheDocument();
  });

  test("mostra o erro da API sem sair da tela", async () => {
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<NewTransaction />, { path: "/transaction/:type", route: "/transaction/input" });
    await userEvent.type(screen.getByLabelText("Valor (R$)"), "10");
    await userEvent.type(screen.getByLabelText("Descrição"), "Teste");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Erro interno")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nova receita" })).toBeInTheDocument();
  });
});
