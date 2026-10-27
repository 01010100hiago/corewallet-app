import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import Icon from "./Icon.jsx";

describe("Icon", () => {
  test("desenha o ícone e o esconde de leitores de tela por padrão", () => {
    const { container } = render(<Icon name="escudo" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("ic", "size-6");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  test("com title vira imagem com nome acessível", () => {
    const { getByRole } = render(<Icon name="cadeado" title="Protegido" />);
    expect(getByRole("img", { name: "Protegido" })).toBeInTheDocument();
  });

  test("nome desconhecido dá erro claro", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Icon name="nao-existe" />)).toThrow(/Ícone desconhecido/);
  });
});
