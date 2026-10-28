import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routes } from "./router.jsx";
import { api } from "./lib/api.js";

function open(path, { logged, down = false }) {
  vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/auth/me") {
      if (down) throw new Error("Network Error");
      if (!logged) throw { response: { status: 401, data: {} } };
      return { data: { id: "1", name: "Maria Silva", email: "m@e.com", provider: "password", profileComplete: true, createdAt: "2026-10-25T12:00:00.000Z" } };
    }
    if (url === "/auth/config") {
      return { data: { captcha: null, google: null } };
    }
    return { data: { transactions: [], balance: 0, truncated: false } };
  });
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe("rotas", () => {
  test("endereço inexistente mostra 404", async () => {
    open("/nao-existe", { logged: true });
    expect(await screen.findByText("Página não encontrada")).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  test("quem não está logado é mandado para o login", async () => {
    open("/", { logged: false });
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  test("quem já está logado não vê o login", async () => {
    open("/signin", { logged: true });
    expect(await screen.findByText("Olá, Maria Silva")).toBeInTheDocument();
  });

  test("servidor fora do ar não manda para o login: oferece tentar de novo", async () => {
    open("/", { down: true });
    expect(await screen.findByText("Não foi possível conectar ao servidor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
  });

  test("ao trocar de página o foco vai para o título", async () => {
    open("/signin", { logged: false });
    const heading = await screen.findByRole("heading", { name: "Que bom te ver" });
    await userEvent.click(screen.getByRole("link", { name: "Criar conta grátis" }));
    const next = await screen.findByRole("heading", { name: "Criar sua conta" });
    await waitFor(() => expect(next).toHaveFocus());
    expect(heading).not.toBeInTheDocument();
  });
});
