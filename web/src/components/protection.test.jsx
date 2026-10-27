import { describe, test, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../context/configContext.js";
import ProtectionDetails from "./ProtectionDetails.jsx";
import Signin from "../pages/Signin.jsx";
import { renderPage } from "../test/render.jsx";

const mount = (captcha = null) =>
  render(
    <ConfigContext.Provider value={{ status: "ready", captcha, google: null }}>
      <ProtectionDetails />
    </ConfigContext.Provider>
  );

describe("Como protegemos seus dados", () => {
  test("o título fica centralizado, com o ícone e a seta", () => {
    mount();
    const summary = screen.getByText("Como protegemos seus dados").closest("summary");
    expect(summary).toHaveClass("justify-center", "text-center");
  });

  test("cinco frases curtas, em linguagem simples, cada uma com um destaque", () => {
    mount();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const li of items) {
      expect(li.querySelector("strong")).not.toBeNull();
      expect(li.textContent.length).toBeLessThanOrEqual(75);
    }
    expect(items[0]).toHaveTextContent("Senha embaralhada. Nem nós conseguimos ler a sua.");
    expect(items[1]).toHaveTextContent("Conexão criptografada. O que você envia viaja por HTTPS.");
  });

  test("não promete o que o sistema não faz nem usa jargão", () => {
    const { container } = mount({ provider: "pow" });
    const text = container.textContent;
    // O servidor lê os lançamentos para calcular o saldo: não é criptografia de ponta a ponta.
    expect(text).not.toMatch(/ponta a ponta/i);
    // A sessão não vence mais em 1 hora (o acesso renova sozinho; a sessão dura até 30 dias).
    expect(text).not.toMatch(/1 hora|uma hora/i);
    expect(text).not.toMatch(/bcrypt|httpOnly|cookie|JavaScript/i);
  });

  test("a linha sobre robôs só aparece quando há verificação ligada", () => {
    const sem = mount(null);
    expect(screen.getByText("Limite de tentativas.")).toBeInTheDocument();
    expect(screen.queryByText("Contra robôs.")).toBeNull();
    sem.unmount();
    mount({ provider: "pow" });
    expect(screen.getByText("Contra robôs.")).toBeInTheDocument();
    expect(screen.queryByText("Limite de tentativas.")).toBeNull();
  });

  test("aparece no login e no cadastro", () => {
    renderPage(<Signin />, { path: "/signin", route: "/signin" });
    expect(within(document.body).getByText("Como protegemos seus dados")).toBeInTheDocument();
  });
});
