import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createHash, webcrypto } from "node:crypto";
import { api } from "../lib/api.js";
import Captcha from "./Captcha.jsx";
import Signin from "../pages/Signin.jsx";
import Signup from "../pages/Signup.jsx";
import { renderPage, fakeAuth } from "../test/render.jsx";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const challenge = (number = 5, over = {}) => {
  const salt = `${"e".repeat(32)}?e=1800000000000`;
  return { algorithm: "SHA-256", salt, challenge: sha(salt + number), maxnumber: 300, signature: "f".repeat(64), ttl: 300, ...over };
};
const POW = { status: "ready", captcha: { provider: "pow" }, google: null };

// O componente usa crypto.subtle: no jsdom entra o do Node.
vi.stubGlobal("crypto", webcrypto);
afterEach(() => vi.useRealTimers());

describe("PowCaptcha", () => {
  test("trabalha sozinho: mostra 'Verificando', entrega o token e mostra 'Verificado'", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: challenge(5) });
    const onToken = vi.fn();
    render(<Captcha config={{ provider: "pow" }} onToken={onToken} resetKey={0} />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando que você é uma pessoa");
    expect(await screen.findByText(/Verificado: você é uma pessoa/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/auth/challenge");
    const token = onToken.mock.calls.at(-1)[0];
    expect(JSON.parse(atob(token)).number).toBe(5);
    // Enquanto trabalhava avisou que ainda não havia token.
    expect(onToken.mock.calls[0][0]).toBe("");
  });

  test("é pequeno e não pede clique nenhum", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: challenge(3) });
    render(<Captcha config={{ provider: "pow" }} onToken={() => {}} resetKey={0} />);
    await screen.findByText(/Verificado/);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("mudar resetKey pede um desafio novo e zera o token", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: challenge(4) }).mockResolvedValueOnce({ data: challenge(9) });
    const onToken = vi.fn();
    const { rerender } = render(<Captcha config={{ provider: "pow" }} onToken={onToken} resetKey={0} />);
    await screen.findByText(/Verificado/);
    rerender(<Captcha config={{ provider: "pow" }} onToken={onToken} resetKey={1} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(JSON.parse(atob(onToken.mock.calls.at(-1)[0])).number).toBe(9));
    expect(onToken.mock.calls.some(([t]) => t === "")).toBe(true);
  });

  test("erro de rede: avisa e deixa tentar de novo", async () => {
    const get = vi.spyOn(api, "get").mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ data: challenge(2) });
    const onToken = vi.fn();
    render(<Captcha config={{ provider: "pow" }} onToken={onToken} resetKey={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível verificar");
    expect(onToken).not.toHaveBeenCalledWith(expect.stringMatching(/.+/));
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText(/Verificado/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("desafio sem solução também cai no erro", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: challenge(9999, { maxnumber: 100 }) });
    render(<Captcha config={{ provider: "pow" }} onToken={() => {}} resetKey={0} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  test("antes de o desafio vencer pede outro sozinho", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const get = vi.spyOn(api, "get").mockImplementation(async () => ({ data: challenge(2, { ttl: 120 }) }));
    render(<Captcha config={{ provider: "pow" }} onToken={() => {}} resetKey={0} />);
    await screen.findByText(/Verificado/);
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(89_000); // 120 s menos a margem de 30 s: ainda não
    });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  test("desmontar cancela o trabalho (nada fica rodando nem chama onToken depois)", async () => {
    let release;
    vi.spyOn(api, "get").mockReturnValue(new Promise((resolve) => (release = () => resolve({ data: challenge(7) }))));
    const onToken = vi.fn();
    const { unmount } = render(<Captcha config={{ provider: "pow" }} onToken={onToken} resetKey={0} />);
    unmount();
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(onToken.mock.calls.filter(([t]) => t !== "")).toEqual([]);
  });

  test("com a config do Turnstile continua usando o Turnstile (nada de desafio próprio)", () => {
    const get = vi.spyOn(api, "get");
    render(<Captcha config={{ provider: "turnstile", siteKey: "k" }} onToken={() => {}} resetKey={0} />);
    expect(screen.getByLabelText("Verificação de segurança")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("cadastro e login com a verificação automática", () => {
  test("o login só envia depois de verificado, e leva o token", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: challenge(6) });
    const signin = vi.fn().mockResolvedValue();
    renderPage(<Signin />, { path: "/signin", route: "/signin", config: POW, auth: fakeAuth({ signin }) });
    await userEvent.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha"), "cavalo-azul-77");
    await screen.findByText(/Verificado/);
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signin).toHaveBeenCalled());
    const sent = signin.mock.calls[0][0];
    expect(sent).toMatchObject({ email: "ana@exemplo.com", password: "cavalo-azul-77" });
    expect(JSON.parse(atob(sent.captchaToken)).number).toBe(6);
  });

  test("clicar antes de terminar explica que é para esperar, sem enviar", async () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    const signin = vi.fn();
    renderPage(<Signin />, { path: "/signin", route: "/signin", config: POW, auth: fakeAuth({ signin }) });
    await userEvent.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha"), "cavalo-azul-77");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText(/Aguarde a verificação de segurança terminar/)).toBeInTheDocument();
    expect(signin).not.toHaveBeenCalled();
  });

  test("depois de enviar pede um desafio novo (cada token vale uma vez)", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: challenge(8) });
    const signin = vi.fn().mockRejectedValue({ response: { status: 401, data: { message: "Email ou senha incorretos" } } });
    renderPage(<Signin />, { path: "/signin", route: "/signin", config: POW, auth: fakeAuth({ signin }) });
    await userEvent.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha"), "errada-errada-1");
    await screen.findByText(/Verificado/);
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Email ou senha incorretos")).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  test("o cadastro também espera e envia o token", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: challenge(11) });
    const signup = vi.fn().mockResolvedValue();
    renderPage(<Signup />, { path: "/signup", route: "/signup", config: POW, auth: fakeAuth({ signup }) });
    await userEvent.type(screen.getByLabelText("Nome completo"), "Ana Lima");
    await userEvent.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha", { exact: true }), "cavalo-azul-77");
    await userEvent.type(screen.getByLabelText("Confirme a senha"), "cavalo-azul-77");
    await screen.findByText(/Verificado/);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await waitFor(() => expect(signup).toHaveBeenCalled());
    expect(JSON.parse(atob(signup.mock.calls[0][0].captchaToken)).number).toBe(11);
  });

  test("sem captcha na configuração nada disso aparece", async () => {
    renderPage(<Signin />, { path: "/signin", route: "/signin" });
    expect(screen.queryByText(/Verificando|Verificado/)).toBeNull();
  });
});
