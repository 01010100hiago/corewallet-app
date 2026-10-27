import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Shortcuts from "./Shortcuts.jsx";

const at = (path) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Shortcuts />
    </MemoryRouter>
  );
  return screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent);
};

describe("botões de navegação", () => {
  test.each([
    ["/", ["Início"]],
    ["/analysis", ["Análise"]],
    ["/history", ["Histórico"]],
    ["/history?aba=alteracoes", ["Histórico"]],
    ["/account", ["Conta"]],
    ["/categories", ["Conta"]], // Categorias é parte da Conta
    ["/transaction/input", ["Início"]],
    ["/transaction/abc/edit", ["Início"]],
  ])("em %s marca só %j", (path, expected) => {
    expect(at(path)).toEqual(expected);
  });

  test("são sempre os mesmos quatro destinos, na mesma ordem, em qualquer página", () => {
    for (const path of ["/", "/analysis", "/account"]) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <Shortcuts />
        </MemoryRouter>
      );
      expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Início", "Análise", "Histórico", "Conta"]);
      expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
      unmount();
    }
  });
});
