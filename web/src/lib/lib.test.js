import { describe, expect, test } from "vitest";
import { getErrorMessage } from "./api.js";

describe("getErrorMessage", () => {
  test("usa o erro do primeiro campo, depois a mensagem geral", () => {
    expect(getErrorMessage({ response: { data: { message: "Dados inválidos", errors: { email: "Email inválido" } } } })).toBe("Email inválido");
    expect(getErrorMessage({ response: { data: { message: "Email ou senha incorretos" } } })).toBe("Email ou senha incorretos");
  });

  test("trata resposta sem corpo, timeout e falta de rede", () => {
    expect(getErrorMessage({ response: { data: undefined } })).toMatch(/Algo deu errado/);
    expect(getErrorMessage({ code: "ECONNABORTED" })).toMatch(/demorou/);
    expect(getErrorMessage(new Error("Network Error"))).toMatch(/conectar/);
  });
});
