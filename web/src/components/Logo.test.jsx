import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo from "./Logo.jsx";

describe("Logo", () => {
  test("mostra o nome e esconde a marca de leitores de tela", () => {
    const { container } = render(<Logo />);
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Wallet")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("a versão para fundo verde inverte as cores da marca", () => {
    const dark = render(<Logo tone="dark" />).container.querySelector("rect");
    const light = render(<Logo tone="light" />).container.querySelector("rect");
    expect(dark).toHaveClass("fill-pine-900");
    expect(light).toHaveClass("fill-mint-50");
  });
});
