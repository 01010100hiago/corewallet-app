import { describe, test, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render } from "@testing-library/react";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import Signin from "./Signin.jsx";
import Signup from "./Signup.jsx";
import VerifyEmail from "./VerifyEmail.jsx";
import Account from "./Account.jsx";

const signinRoute = { path: "/signin", route: "/signin" };
const fill = async (email = "ana@exemplo.com", password = "cavalo-azul-77") => {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Senha"), password);
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
};

describe("login em duas etapas", () => {
  test("a senha só leva ao segundo passo; o código abre a sessão e a tela vai para o início", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    const signinTwoFactor = vi.fn().mockResolvedValue();
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin, signinTwoFactor }) });
    await fill();
    expect(await screen.findByRole("heading", { name: "Verificação em duas etapas" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Senha")).toBeNull();
    const input = screen.getByLabelText("Código do aplicativo");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveFocus();
    await userEvent.type(input, "12a3 45-6789");
    expect(input).toHaveValue("123456"); // só dígitos, no máximo 6
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(signinTwoFactor).toHaveBeenCalledWith("desafio-assinado-123", "123456");
    expect(await screen.findByText("página inicial")).toBeInTheDocument();
  });

  test("código incompleto não chama a API; código errado mostra o erro e limpa o campo", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    const signinTwoFactor = vi.fn().mockRejectedValue({ response: { status: 401, data: { message: "Código incorreto", code: "wrong_code" } } });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin, signinTwoFactor }) });
    await fill();
    const input = await screen.findByLabelText("Código do aplicativo");
    await userEvent.type(input, "123");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("6 dígitos");
    expect(signinTwoFactor).not.toHaveBeenCalled();
    await userEvent.type(input, "456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Código incorreto")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });

  test("código de recuperação: troca o campo, aceita letras e manda como foi digitado", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    const signinTwoFactor = vi.fn().mockResolvedValue();
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin, signinTwoFactor }) });
    await fill();
    await userEvent.click(await screen.findByRole("button", { name: "Perdi o acesso ao aplicativo" }));
    const input = screen.getByLabelText("Código de recuperação");
    expect(input).toHaveAttribute("inputmode", "text");
    await userEvent.type(input, "abcde-23456");
    expect(input).toHaveValue("ABCDE-23456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(signinTwoFactor).toHaveBeenCalledWith("desafio-assinado-123", "ABCDE-23456");
    await screen.findByText("página inicial");
  });

  test("desafio vencido ou excesso de tentativas volta para a senha, com a mensagem", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    const signinTwoFactor = vi.fn().mockRejectedValue({ response: { status: 429, data: { message: "Muitas tentativas com este desafio. Entre de novo." } } });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin, signinTwoFactor }) });
    await fill();
    await userEvent.type(await screen.findByLabelText("Código do aplicativo"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/Muitas tentativas com este desafio/)).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  test("colar o código com espaço ('123 456') funciona e o foco volta ao campo depois do erro", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    const signinTwoFactor = vi.fn().mockRejectedValue({ response: { status: 401, data: { message: "Código incorreto", code: "wrong_code" } } });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin, signinTwoFactor }) });
    await fill();
    const input = await screen.findByLabelText("Código do aplicativo");
    await userEvent.click(input);
    await userEvent.paste("123 456");
    expect(input).toHaveValue("123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Código incorreto")).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
  });

  test("desafio vencido (401 sem ser código errado) volta para a senha", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    const signinTwoFactor = vi.fn().mockRejectedValue({ response: { status: 401, data: { message: "Desafio inválido ou vencido. Entre de novo.", code: "challenge_invalid" } } });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin, signinTwoFactor }) });
    await fill();
    await userEvent.type(await screen.findByLabelText("Código do aplicativo"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/Desafio inválido ou vencido/)).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  test("Voltar leva de novo à senha", async () => {
    const signin = vi.fn().mockResolvedValue({ twoFactorRequired: true, challenge: "desafio-assinado-123" });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin }) });
    await fill();
    await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  test("email ainda não confirmado: mostra o aviso e deixa reenviar o link", async () => {
    const signin = vi.fn().mockRejectedValue({ response: { status: 403, data: { message: "Confirme seu email para entrar.", code: "email_not_verified" } } });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { message: "Se existir uma conta com este email que ainda não foi confirmada, enviamos um novo link." } });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin }) });
    await fill("ana@exemplo.com");
    expect(await screen.findByText(/Confirme seu email para entrar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reenviar o email de confirmação" }));
    expect(post).toHaveBeenCalledWith("/auth/email/resend", { email: "ana@exemplo.com" });
    expect(await screen.findByText(/enviamos um novo link/)).toBeInTheDocument();
  });

  test("erro comum de login não oferece o reenvio", async () => {
    const signin = vi.fn().mockRejectedValue({ response: { status: 401, data: { message: "Email ou senha incorretos" } } });
    renderPage(<Signin />, { ...signinRoute, auth: fakeAuth({ signin }) });
    await fill();
    expect(await screen.findByText("Email ou senha incorretos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reenviar/ })).toBeNull();
  });
});

describe("cadastro com confirmação de email", () => {
  const typeSignup = async () => {
    await userEvent.type(screen.getByLabelText("Nome completo"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha", { exact: true }), "cavalo-azul-77");
    await userEvent.type(screen.getByLabelText("Confirme a senha"), "cavalo-azul-77");
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  };

  test("com o link enviado, mostra 'Confirme seu email' em vez de ir para o login", async () => {
    const signup = vi.fn().mockResolvedValue({ verificationRequired: true, verificationSent: true });
    renderPage(<Signup />, { path: "/signup", route: "/signup", auth: fakeAuth({ signup }) });
    await typeSignup();
    expect(await screen.findByRole("heading", { name: "Confirme seu email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ana@exemplo.com");
    expect(screen.getByRole("button", { name: "Reenviar o email de confirmação" })).toBeInTheDocument();
    expect(screen.queryByText("página de login")).toBeNull();
  });

  test("se o envio falhou, diz isso e oferece reenviar", async () => {
    const signup = vi.fn().mockResolvedValue({ verificationRequired: true, verificationSent: false });
    renderPage(<Signup />, { path: "/signup", route: "/signup", auth: fakeAuth({ signup }) });
    await typeSignup();
    expect(await screen.findByText(/não conseguimos enviar o email agora/)).toBeInTheDocument();
  });

  test("sem a exigência, continua indo para o login", async () => {
    const signup = vi.fn().mockResolvedValue({ id: "1" });
    renderPage(<Signup />, { path: "/signup", route: "/signup", auth: fakeAuth({ signup }) });
    await typeSignup();
    expect(await screen.findByText("página de login")).toBeInTheDocument();
  });
});

describe("página do link de confirmação", () => {
  const open = (search) =>
    render(
      <MemoryRouter initialEntries={[`/verify-email${search}`]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/signin" element={<p>página de login</p>} />
        </Routes>
      </MemoryRouter>
    );

  const confirm = async (password = "cavalo-azul-77") => {
    await userEvent.type(await screen.findByLabelText("Senha da conta"), password);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar email" }));
  };

  test("o link só abre o formulário: nada é enviado até a pessoa digitar a senha da conta", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { verified: true } });
    open("?token=abcdefghijklmnopqrstuvwxyz-ok1");
    expect(await screen.findByLabelText("Senha da conta")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await confirm();
    expect(await screen.findByText(/Email confirmado/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/auth/email/verify", { token: "abcdefghijklmnopqrstuvwxyz-ok1", password: "cavalo-azul-77" });
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/signin");
  });

  test("senha errada mostra o motivo e deixa tentar de novo com o mesmo link", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValueOnce({ response: { status: 403, data: { code: "wrong_password", message: "Senha incorreta. Use a senha que foi escolhida ao criar a conta." } } })
      .mockResolvedValueOnce({ data: { verified: true } });
    open("?token=abcdefghijklmnopqrstuvwxyz-ok1");
    await confirm("senha-errada-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Senha incorreta");
    expect(screen.getByLabelText("Senha da conta")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Senha da conta"));
    await confirm();
    expect(await screen.findByText(/Email confirmado/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith("/auth/email/verify", { token: "abcdefghijklmnopqrstuvwxyz-ok1", password: "cavalo-azul-77" });
  });

  test("senha vazia não chama a API", async () => {
    const post = vi.spyOn(api, "post");
    open("?token=abcdefghijklmnopqrstuvwxyz-ok1");
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar email" }));
    expect(await screen.findByText("A senha é obrigatória")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  test("link vencido ou já usado mostra o motivo e o caminho para pedir outro (sem formulário)", async () => {
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 400, data: { message: "Link inválido ou vencido. Peça um novo email de confirmação." } } });
    open("?token=abcdefghijklmnopqrstuvwxyz-bad");
    await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("inválido ou vencido");
    expect(screen.queryByLabelText("Senha da conta")).toBeNull();
    expect(screen.getByRole("link", { name: "Ir para o login" })).toBeInTheDocument();
  });

  test("o token sai da barra de endereço assim que a página abre", async () => {
    vi.spyOn(api, "post");
    const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
    render(
      <MemoryRouter initialEntries={["/verify-email?token=abcdefghijklmnopqrstuvwxyz-ok1"]}>
        <Where />
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByLabelText("Senha da conta")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/verify-email$/));
  });

  test.each([
    ["limite de pedidos (429)", { response: { status: 429, data: { message: "Muitas tentativas. Tente de novo mais tarde." } } }, "Muitas tentativas"],
    ["falha de rede", { message: "Network Error" }, "conectar"],
  ])("%s não gasta o link: o formulário continua para tentar de novo", async (_name, failure, text) => {
    vi.spyOn(api, "post").mockRejectedValue(failure);
    open("?token=abcdefghijklmnopqrstuvwxyz-ok1");
    await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(new RegExp(text));
    expect(screen.getByLabelText("Senha da conta")).toBeInTheDocument();
  });

  test("sem token na URL não chama a API", async () => {
    const post = vi.spyOn(api, "post");
    open("");
    expect(await screen.findByRole("alert")).toHaveTextContent("incompleto");
    expect(post).not.toHaveBeenCalled();
  });
});

describe("tela da conta: verificação em duas etapas", () => {
  const stubApi = ({ enabled = false, left = 10 } = {}) => {
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/auth/2fa") return { data: { enabled, recoveryCodesLeft: left } };
      if (url === "/auth/sessions") return { data: [] };
      return { data: {} };
    });
  };
  const route = { path: "/account", route: "/account" };
  const card = () => screen.findByRole("region", { name: "Verificação em duas etapas" });
  // Ativar agora começa pela senha; depois vem o QR code.
  const startSetup = async () => {
    await userEvent.click(within(await card()).getByRole("button", { name: "Ativar" }));
    await userEvent.type(await screen.findByLabelText("Senha"), "cavalo-azul-77");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
  };

  test("desativada: botão Ativar mostra QR code, chave em grupos e pede o código", async () => {
    stubApi();
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", uri: "otpauth://totp/x", qr: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } });
    renderPage(<Account />, route);
    await startSetup();
    expect(post).toHaveBeenCalledWith("/auth/2fa/setup", { password: "cavalo-azul-77" });
    const c = await card();
    expect(within(c).getByAltText("QR code para o aplicativo autenticador")).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(within(c).getByLabelText("Chave de configuração")).toHaveTextContent("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(within(c).getByLabelText("Código do aplicativo")).toBeInTheDocument();
  });

  test("confirmar com o código mostra os códigos de recuperação uma vez; Concluir só depois de marcar que guardou", async () => {
    stubApi();
    const codes = ["AAAAA-22222", "BBBBB-33333", "CCCCC-44444", "DDDDD-55555", "EEEEE-66666", "FFFFF-77777", "GGGGG-22333", "HHHHH-33444", "IIIII-44555", "JJJJJ-55666"];
    const post = vi.spyOn(api, "post").mockImplementation(async (url) => (url === "/auth/2fa/setup" ? { data: { secret: "JBSWY3DPEHPK3PXP", uri: "u", qr: "data:image/svg+xml;base64,AA==" } } : { data: { recoveryCodes: codes } }));
    renderPage(<Account />, route);
    await startSetup();
    await userEvent.type(await screen.findByLabelText("Código do aplicativo"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e ativar" }));
    expect(post).toHaveBeenCalledWith("/auth/2fa/enable", { code: "654321" });
    const list = await screen.findByRole("list", { name: "Códigos de recuperação" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(codes);
    expect(screen.getByRole("alert")).toHaveTextContent("Guarde estes 10 códigos");
    const done = screen.getByRole("button", { name: "Concluir" });
    expect(done).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Guardei os códigos/ }));
    await userEvent.click(done);
    expect(await screen.findByText("Verificação em duas etapas ativada.")).toBeInTheDocument();
    expect(screen.queryByText("AAAAA-22222")).toBeNull(); // não aparecem de novo
  });

  test("código errado na ativação mostra o erro da API e continua na tela", async () => {
    stubApi();
    vi.spyOn(api, "post").mockImplementation(async (url) => {
      if (url === "/auth/2fa/setup") return { data: { secret: "JBSWY3DPEHPK3PXP", uri: "u", qr: "data:image/svg+xml;base64,AA==" } };
      throw { response: { status: 422, data: { message: "Dados inválidos", errors: { code: "Código incorreto. Confira o horário do celular e tente o código novo." } } } };
    });
    renderPage(<Account />, route);
    await startSetup();
    await userEvent.type(await screen.findByLabelText("Código do aplicativo"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e ativar" }));
    expect(await screen.findByText(/Código incorreto\. Confira o horário/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar e ativar" })).toBeEnabled();
  });

  test("ativa: mostra o estado, quantos códigos restam e avisa quando são poucos", async () => {
    stubApi({ enabled: true, left: 2 });
    renderPage(<Account />, route);
    const c = await card();
    expect(await within(c).findByText(/Ativa\. Códigos de recuperação restantes: 2/)).toBeInTheDocument();
    expect(within(c).getByText(/Poucos códigos de recuperação sobrando/)).toBeInTheDocument();
    expect(within(c).queryByRole("button", { name: "Ativar" })).toBeNull();
  });

  test("desativar pede senha e código e avisa", async () => {
    stubApi({ enabled: true });
    const post = vi.spyOn(api, "post").mockResolvedValue({ status: 204, data: "" });
    renderPage(<Account />, route);
    await userEvent.click(await within(await card()).findByRole("button", { name: "Desativar" }));
    await userEvent.type(screen.getByLabelText("Senha"), "cavalo-azul-77");
    await userEvent.type(screen.getByLabelText("Código do aplicativo"), "123456");
    await userEvent.click(within(await card()).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/2fa/disable", { password: "cavalo-azul-77", code: "123456" }));
    expect(await screen.findByText("Verificação em duas etapas desativada.")).toBeInTheDocument();
  });

  test("desativar com senha errada mostra o erro no campo da senha", async () => {
    stubApi({ enabled: true });
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 422, data: { message: "Dados inválidos", errors: { password: "Senha incorreta" } } } });
    renderPage(<Account />, route);
    await userEvent.click(await within(await card()).findByRole("button", { name: "Desativar" }));
    await userEvent.type(screen.getByLabelText("Senha"), "errada-errada");
    await userEvent.type(screen.getByLabelText("Código do aplicativo"), "123456");
    await userEvent.click(within(await card()).getByRole("button", { name: "Desativar" }));
    expect(await screen.findByText("Senha incorreta")).toBeInTheDocument();
  });

  test("os códigos de recuperação não somem nem se recarregar o estado falhar (aparecem uma vez só)", async () => {
    let fail = false;
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/auth/2fa") {
        if (fail) throw new Error("Network Error");
        return { data: { enabled: false, recoveryCodesLeft: 0 } };
      }
      return { data: [] };
    });
    vi.spyOn(api, "post").mockImplementation(async (url) =>
      url === "/auth/2fa/setup" ? { data: { secret: "JBSWY3DPEHPK3PXP", uri: "u", qr: "data:image/svg+xml;base64,AA==" } } : (fail = true, { data: { recoveryCodes: ["AAAAA-22222", "BBBBB-33333"] } })
    );
    renderPage(<Account />, route);
    await startSetup();
    await userEvent.type(await screen.findByLabelText("Código do aplicativo"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e ativar" }));
    expect(await screen.findByRole("list", { name: "Códigos de recuperação" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole("list", { name: "Códigos de recuperação" })).toHaveTextContent("AAAAA-22222");
  });

  test("senha errada ao começar mostra o erro no campo; falha ao gerar não inutiliza o cartão", async () => {
    stubApi();
    const post = vi.spyOn(api, "post").mockRejectedValueOnce({ response: { status: 422, data: { message: "Dados inválidos", errors: { password: "Senha incorreta" } } } }).mockRejectedValueOnce({ response: { status: 500, data: { message: "Erro interno" } } });
    renderPage(<Account />, route);
    await startSetup();
    expect(await screen.findByText("Senha incorreta")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Erro interno")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(within(await card()).getByRole("button", { name: "Ativar" })).toBeInTheDocument(); // o cartão continua usável
  });

  test("quem entra pelo Google é orientado a usar o 2FA do Google, sem botão de ativar", async () => {
    stubApi();
    const auth = fakeAuth();
    auth.user = { ...auth.user, provider: "google" };
    renderPage(<Account />, { ...route, auth });
    const c = await card();
    expect(within(c).getByText(/Você entra pelo Google/)).toBeInTheDocument();
    expect(within(c).queryByRole("button", { name: "Ativar" })).toBeNull();
  });
});
