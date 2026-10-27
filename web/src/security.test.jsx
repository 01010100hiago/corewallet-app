import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter } from "react-router-dom";
import dayjs from "dayjs";
import { renderPage, fakeAuth, noConfig } from "./test/render.jsx";
import { AuthContext } from "./context/authContext.js";
import { ConfigContext } from "./context/configContext.js";
import { api } from "./lib/api.js";
import { dayLabel } from "./lib/days.js";
import * as loader from "./lib/loadScript.js";
import SecuritySplash from "./components/SecuritySplash.jsx";
import AppGate from "./components/AppGate.jsx";
import Turnstile from "./components/Turnstile.jsx";
import GoogleButton from "./components/GoogleButton.jsx";
import GoogleSection from "./components/GoogleSection.jsx";
import Signin from "./pages/Signin.jsx";
import Welcome from "./pages/Welcome.jsx";
import Account from "./pages/Account.jsx";
import Home from "./pages/Home.jsx";
import { RequireAuth } from "./components/RouteGuards.jsx";
import { ConfigProvider } from "./context/ConfigProvider.jsx";
import { useConfig } from "./context/configContext.js";
import { connectionStep } from "./lib/connection.js";

beforeEach(() => {
  vi.spyOn(loader, "loadScript").mockResolvedValue();
});
afterEach(() => {
  delete window.turnstile;
  delete window.google;
});

const withCaptcha = { status: "ready", captcha: { provider: "turnstile", siteKey: "site-pub" }, google: null };
const withGoogle = { status: "ready", captcha: null, google: { clientId: "cid.apps.googleusercontent.com" } };

describe("SecuritySplash", () => {
  test("mostra cada passo com o estado dito em texto", () => {
    render(
      <SecuritySplash
        steps={[
          { label: "Conexão criptografada (HTTPS)", state: "done" },
          { label: "Verificando sua sessão…", state: "active" },
          { label: "Proteções", state: "pending" },
          { label: "Sem HTTPS", state: "warn" },
        ]}
      />
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Conexão criptografada (HTTPS)").closest("li")).toHaveTextContent("concluído");
    expect(screen.getByText("Verificando sua sessão…").closest("li")).toHaveTextContent("em andamento");
    expect(screen.getByText("Proteções").closest("li")).toHaveTextContent("aguardando");
    expect(screen.getByText("Sem HTTPS").closest("li")).toHaveTextContent("atenção");
  });
});

describe("AppGate", () => {
  function gate(auth, config) {
    return render(
      <ConfigContext.Provider value={config}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <Routes>
              <Route element={<AppGate />}>
                <Route path="/" element={<p>conteúdo do app</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ConfigContext.Provider>
    );
  }

  test("enquanto a sessão carrega, mostra o splash com o passo da sessão em andamento", () => {
    gate(fakeAuth({ status: "loading", user: null }), noConfig);
    expect(screen.getByText("Verificando sua sessão…")).toBeInTheDocument();
    expect(screen.queryByText("conteúdo do app")).not.toBeInTheDocument();
  });

  test("enquanto as proteções carregam, também fica no splash", () => {
    gate(fakeAuth(), { status: "loading", captcha: null, google: null });
    expect(screen.getByText("Carregando proteções…")).toBeInTheDocument();
  });

  test("mesmo com tudo pronto, o splash dura o mínimo para não piscar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    gate(fakeAuth(), noConfig);
    expect(screen.getByText("Sessão verificada")).toBeInTheDocument();
    expect(screen.queryByText("conteúdo do app")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText("conteúdo do app")).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("Turnstile", () => {
  function fakeTurnstile() {
    const t = { render: vi.fn(() => "w1"), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = t;
    return t;
  }

  test("desenha o widget com a chave pública e repassa o token; expirar limpa o token", async () => {
    const t = fakeTurnstile();
    const onToken = vi.fn();
    render(<Turnstile siteKey="site-pub" onToken={onToken} />);
    await waitFor(() => expect(t.render).toHaveBeenCalledOnce());
    const options = t.render.mock.calls[0][1];
    expect(options.sitekey).toBe("site-pub");
    expect(options.language).toBe("pt-br");
    options.callback("tok-1");
    expect(onToken).toHaveBeenLastCalledWith("tok-1");
    options["expired-callback"]();
    expect(onToken).toHaveBeenLastCalledWith("");
    options["error-callback"]();
    expect(onToken).toHaveBeenLastCalledWith("");
  });

  test("mudar resetKey limpa o token e pede um novo (o token vale uma vez)", async () => {
    const t = fakeTurnstile();
    const onToken = vi.fn();
    const { rerender } = render(<Turnstile siteKey="site-pub" onToken={onToken} resetKey={0} />);
    await waitFor(() => expect(t.render).toHaveBeenCalled());
    rerender(<Turnstile siteKey="site-pub" onToken={onToken} resetKey={1} />);
    expect(t.reset).toHaveBeenCalledWith("w1");
    expect(onToken).toHaveBeenLastCalledWith("");
  });

  test("remove o widget ao sair da tela", async () => {
    const t = fakeTurnstile();
    const { unmount } = render(<Turnstile siteKey="site-pub" onToken={() => {}} />);
    await waitFor(() => expect(t.render).toHaveBeenCalled());
    unmount();
    expect(t.remove).toHaveBeenCalledWith("w1");
  });

  test("se o script não carregar, avisa o que fazer", async () => {
    loader.loadScript.mockRejectedValue(new Error("bloqueado"));
    render(<Turnstile siteKey="site-pub" onToken={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/verificação de segurança/);
  });
});

describe("Signin com captcha", () => {
  function setup(signin = vi.fn().mockResolvedValue()) {
    const t = { render: vi.fn(() => "w1"), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = t;
    renderPage(<Signin />, { path: "/signin", config: withCaptcha, auth: fakeAuth({ status: "anonymous", user: null, signin }) });
    return { t, signin };
  }
  const fill = async () => {
    await userEvent.type(screen.getByLabelText("Email"), "maria@exemplo.com");
    await userEvent.type(screen.getByLabelText("Senha"), "cavalo-azul-77");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
  };

  test("sem passar pelo captcha não envia", async () => {
    const { signin } = setup();
    await fill();
    expect(await screen.findByText("Confirme que você não é um robô.")).toBeInTheDocument();
    expect(signin).not.toHaveBeenCalled();
  });

  test("com o token, envia captchaToken junto", async () => {
    const { t, signin } = setup();
    await waitFor(() => expect(t.render).toHaveBeenCalled());
    act(() => t.render.mock.calls[0][1].callback("tok-ok"));
    await fill();
    await waitFor(() => expect(signin).toHaveBeenCalledOnce());
    expect(signin).toHaveBeenCalledWith({ email: "maria@exemplo.com", password: "cavalo-azul-77", captchaToken: "tok-ok" });
  });

  test("se o login falhar, o captcha é renovado", async () => {
    const { t } = setup(vi.fn().mockRejectedValue({ response: { data: { message: "Email ou senha incorretos" } } }));
    await waitFor(() => expect(t.render).toHaveBeenCalled());
    act(() => t.render.mock.calls[0][1].callback("tok-ok"));
    await fill();
    expect(await screen.findByText("Email ou senha incorretos")).toBeInTheDocument();
    expect(t.reset).toHaveBeenCalled();
  });

  test("sem captcha configurado a tela não mostra nada e envia normalmente", async () => {
    const signin = vi.fn().mockResolvedValue();
    renderPage(<Signin />, { path: "/signin", auth: fakeAuth({ status: "anonymous", user: null, signin }) });
    await fill();
    await waitFor(() => expect(signin).toHaveBeenCalledWith({ email: "maria@exemplo.com", password: "cavalo-azul-77" }));
  });
});

describe("GoogleButton e GoogleSection", () => {
  function fakeGoogle() {
    const gid = { initialize: vi.fn(), renderButton: vi.fn() };
    window.google = { accounts: { id: gid } };
    return gid;
  }

  test("pede um nonce, inicializa com o client id e o nonce e desenha o botão", async () => {
    const gid = fakeGoogle();
    vi.spyOn(api, "get").mockResolvedValue({ data: { nonce: "abc123" } });
    render(<GoogleButton clientId="cid" onCredential={() => {}} />);
    await waitFor(() => expect(gid.renderButton).toHaveBeenCalled());
    const init = gid.initialize.mock.calls[0][0];
    expect(init.client_id).toBe("cid");
    expect(init.nonce).toBe("abc123");
    expect(init.auto_select).toBe(false);
    expect(gid.renderButton.mock.calls[0][1]).toMatchObject({ locale: "pt-BR", text: "continue_with" });
  });

  test("a cada uso entrega o token e renova o nonce", async () => {
    const gid = fakeGoogle();
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: { nonce: "n1" } }).mockResolvedValueOnce({ data: { nonce: "n2" } });
    const onCredential = vi.fn().mockRejectedValue(new Error("falhou"));
    render(<GoogleButton clientId="cid" onCredential={onCredential} />);
    await waitFor(() => expect(gid.initialize).toHaveBeenCalledOnce());
    await act(async () => {
      await gid.initialize.mock.calls[0][0].callback({ credential: "jwt-do-google" });
    });
    expect(onCredential).toHaveBeenCalledWith("jwt-do-google");
    await waitFor(() => expect(gid.initialize).toHaveBeenCalledTimes(2));
    expect(gid.initialize.mock.calls[1][0].nonce).toBe("n2");
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("se o script do Google não carregar, avisa e sugere email e senha", async () => {
    loader.loadScript.mockRejectedValue(new Error("bloqueado"));
    vi.spyOn(api, "get").mockResolvedValue({ data: { nonce: "n" } });
    render(<GoogleButton clientId="cid" onCredential={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/email e a senha/);
  });

  test("sem Google configurado a seção não aparece", () => {
    const { container } = render(
      <ConfigContext.Provider value={noConfig}>
        <AuthContext.Provider value={fakeAuth()}>
          <MemoryRouter>
            <GoogleSection onError={() => {}} />
          </MemoryRouter>
        </AuthContext.Provider>
      </ConfigContext.Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("entrar com o Google mostra o splash, abre a sessão e leva para a home", async () => {
    const gid = fakeGoogle();
    vi.spyOn(api, "get").mockResolvedValue({ data: { nonce: "n1" } });
    let finish;
    const googleSignin = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    renderPage(<GoogleSection onError={() => {}} />, { path: "/signin", config: withGoogle, auth: fakeAuth({ status: "anonymous", user: null, googleSignin }) });
    await waitFor(() => expect(gid.initialize).toHaveBeenCalled());
    act(() => {
      gid.initialize.mock.calls[0][0].callback({ credential: "jwt" });
    });
    expect(await screen.findByText("Confirmando sua conta com o Google…")).toBeInTheDocument();
    await act(async () => finish());
    expect(await screen.findByText("página inicial")).toBeInTheDocument();
    expect(googleSignin).toHaveBeenCalledWith("jwt");
  });

  test("se o Google falhar, mostra o motivo da API e tira o splash", async () => {
    const gid = fakeGoogle();
    vi.spyOn(api, "get").mockResolvedValue({ data: { nonce: "n1" } });
    const onError = vi.fn();
    const googleSignin = vi.fn().mockRejectedValue({ response: { data: { message: "Já existe uma conta com este email. Entre com o email e a senha." } } });
    renderPage(<GoogleSection onError={onError} />, { path: "/signin", config: withGoogle, auth: fakeAuth({ status: "anonymous", user: null, googleSignin }) });
    await waitFor(() => expect(gid.initialize).toHaveBeenCalled());
    await act(async () => {
      await gid.initialize.mock.calls[0][0].callback({ credential: "jwt" }).catch(() => {});
    });
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("Já existe uma conta com este email. Entre com o email e a senha."));
    expect(screen.queryByText("Confirmando sua conta com o Google…")).not.toBeInTheDocument();
  });
});

describe("Complete seu perfil", () => {
  const google = { id: "1", name: "ana souza", email: "ana@gmail.com", provider: "google", profileComplete: false, createdAt: "2026-10-27T12:00:00.000Z" };

  test("mostra o email verificado e o nome vindo do Google, editável", () => {
    renderPage(<Welcome />, { path: "/welcome", auth: fakeAuth({ user: google }) });
    expect(screen.getByText("ana@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("Verificado pelo Google")).toBeInTheDocument();
    expect(screen.getByLabelText("Como podemos te chamar?")).toHaveValue("ana souza");
    expect(document.title).toBe("Complete seu perfil · CoreWallet");
  });

  test("valida o nome e só então salva e segue para a home", async () => {
    const updateProfile = vi.fn().mockResolvedValue();
    renderPage(<Welcome />, { path: "/welcome", auth: fakeAuth({ user: google, updateProfile }) });
    const field = screen.getByLabelText("Como podemos te chamar?");
    await userEvent.clear(field);
    await userEvent.type(field, "Al");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/no mínimo 3 caracteres/)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "Ana Souza");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: "Ana Souza" }));
    expect(await screen.findByText("página inicial")).toBeInTheDocument();
  });

  test("diz o que é guardado e permite sair se a conta não for a certa", async () => {
    const logout = vi.fn().mockResolvedValue();
    renderPage(<Welcome />, { path: "/welcome", auth: fakeAuth({ user: google, logout }) });
    expect(screen.getByText(/Para você pedimos só o nome/)).toBeInTheDocument();
    expect(screen.getByText(/identificador da sua conta Google/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(logout).toHaveBeenCalled();
    expect(await screen.findByText("página de login")).toBeInTheDocument();
  });
});

describe("guarda de rota do perfil", () => {
  function guarded(user, path) {
    const router = createMemoryRouter(
      [
        {
          element: <RequireAuth />,
          children: [
            { path: "/", element: <p>home</p> },
            { path: "/welcome", element: <p>boas-vindas</p> },
          ],
        },
        { path: "/signin", element: <p>login</p> },
      ],
      { initialEntries: [path] }
    );
    render(
      <AuthContext.Provider value={fakeAuth({ user })}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    );
  }
  const base = fakeAuth().user;

  test("perfil incompleto é levado para completar, em qualquer rota", () => {
    guarded({ ...base, profileComplete: false }, "/");
    expect(screen.getByText("boas-vindas")).toBeInTheDocument();
  });
  test("perfil completo não volta para a tela de completar", () => {
    guarded({ ...base, profileComplete: true }, "/welcome");
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});

describe("Seus dados", () => {
  test("mostra os dados da conta e o que é guardado", () => {
    renderPage(<Account />, { auth: fakeAuth({ user: { ...fakeAuth().user, provider: "google", name: "Ana Souza", email: "ana@gmail.com" } }) });
    expect(screen.getByRole("heading", { name: "Seus dados" })).toBeInTheDocument();
    const account = screen.getByRole("region", { name: "Dados da conta" });
    expect(account).toHaveTextContent("Ana Souza");
    expect(account).toHaveTextContent("ana@gmail.com");
    expect(account).toHaveTextContent("Google");
    expect(account).toHaveTextContent("25/10/2026");
    expect(screen.getByText("O que guardamos")).toBeInTheDocument();
    expect(screen.getByText("O que não guardamos")).toBeInTheDocument();
    expect(screen.getByText(/ainda não estão disponíveis/)).toBeInTheDocument();
  });
});

describe("Home refinada", () => {
  const today = dayjs();
  const mk = (id, type, value, description, when) => ({ id, type, value, description, createdAt: when.toISOString() });

  test("dayLabel usa Hoje, Ontem e a data", () => {
    expect(dayLabel(today.toISOString(), today)).toBe("Hoje");
    expect(dayLabel(today.subtract(1, "day").toISOString(), today)).toBe("Ontem");
    expect(dayLabel("2026-01-05T12:00:00.000Z", today)).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  test("agrupa por dia e mostra entradas e saídas totais", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        balance: 7000,
        totalIn: 10000,
        totalOut: 3000,
        truncated: false,
        transactions: [mk("3", "output", 1000, "Mercado", today), mk("2", "input", 2000, "Freela", today), mk("1", "input", 8000, "Salário", today.subtract(1, "day"))],
      },
    });
    renderPage(<Home />);
    expect(await screen.findByText("Mercado")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hoje", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ontem", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Entradas").closest("div")).toHaveTextContent("100,00");
    expect(screen.getByText("Saídas").closest("div")).toHaveTextContent("30,00");
  });

  test("enquanto carrega mostra o esqueleto, e o saldo fica em traço", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    renderPage(<Home />);
    expect(screen.getByRole("status", { name: "Carregando lançamentos" })).toBeInTheDocument();
    expect(screen.getByTestId("balance")).toHaveTextContent("—");
  });

  test("avisa que o lançamento foi salvo e o aviso pode ser fechado", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { balance: 0, totalIn: 0, totalOut: 0, truncated: false, transactions: [] } });
    renderPage(<Home />, { route: { pathname: "/", state: { saved: true } } });
    expect(await screen.findByText("Lançamento salvo.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Lançamento salvo.")).not.toBeInTheDocument();
  });
});

describe("falhas de configuração e de sessão no AppGate", () => {
  function gate(auth, config) {
    return render(
      <ConfigContext.Provider value={config}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <Routes>
              <Route element={<AppGate />}>
                <Route path="/" element={<p>conteúdo do app</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ConfigContext.Provider>
    );
  }
  const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  test("o splash não diz 'verificada' nem 'carregadas' quando falhou", () => {
    gate(fakeAuth({ status: "error", user: null }), { status: "error", captcha: null, google: null, retry: () => {} });
    expect(screen.getByText("Não foi possível verificar a sessão").closest("li")).toHaveTextContent("atenção");
    expect(screen.getByText("Proteções indisponíveis").closest("li")).toHaveTextContent("atenção");
    expect(screen.queryByText("Sessão verificada")).not.toBeInTheDocument();
    expect(screen.queryByText("Proteções carregadas")).not.toBeInTheDocument();
  });

  test("falha só na configuração: oferece tentar de novo em vez de abrir o formulário sem captcha", async () => {
    fakeTimers();
    const retry = vi.fn();
    gate(fakeAuth({ status: "anonymous", user: null }), { status: "error", captcha: null, google: null, retry });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    vi.useRealTimers();
    expect(screen.getByText("Não foi possível conectar ao servidor")).toBeInTheDocument();
    expect(screen.queryByText("conteúdo do app")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  test("tentar de novo refaz só o que falhou", async () => {
    fakeTimers();
    const retryAuth = vi.fn();
    const retryConfig = vi.fn();
    gate(fakeAuth({ status: "error", user: null, retry: retryAuth }), { status: "ready", captcha: null, google: null, retry: retryConfig });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(retryAuth).toHaveBeenCalledOnce();
    expect(retryConfig).not.toHaveBeenCalled();
  });
});

describe("ConfigProvider", () => {
  function Probe() {
    const { status, captcha, retry } = useConfig();
    return (
      <div>
        <p>config: {status}</p>
        <p>captcha: {captcha ? captcha.siteKey : "nenhum"}</p>
        <button onClick={retry}>de novo</button>
      </div>
    );
  }

  test("falha vira erro (não 'sem proteções') e tentar de novo busca outra vez", async () => {
    const get = vi.spyOn(api, "get").mockRejectedValueOnce(new Error("rede"));
    render(<ConfigProvider><Probe /></ConfigProvider>);
    expect(await screen.findByText("config: error")).toBeInTheDocument();
    get.mockResolvedValueOnce({ data: { captcha: { provider: "turnstile", siteKey: "chave" }, google: null } });
    await userEvent.click(screen.getByText("de novo"));
    expect(await screen.findByText("config: ready")).toBeInTheDocument();
    expect(screen.getByText("captcha: chave")).toBeInTheDocument();
  });
});

describe("SecuritySplash: demora e overlay modal", () => {
  test("depois de uns segundos avisa que está demorando", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<SecuritySplash steps={[{ label: "Passo", state: "active" }]} />);
    expect(screen.getByText("Isso leva só um instante.")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.getByText("Está demorando mais que o normal…")).toBeInTheDocument();
    vi.useRealTimers();
  });

  test("em tela cheia é um aviso de status; por cima da página é um diálogo modal", () => {
    const full = render(<SecuritySplash steps={[]} />);
    expect(full.getByRole("status")).toBeInTheDocument();
    full.unmount();
    render(<SecuritySplash fullScreen={false} title="Entrando com o Google" steps={[]} />);
    const dialog = screen.getByRole("dialog", { name: "Entrando com o Google" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("o overlay leva o foco para si, prende o Tab e devolve o foco ao sair", async () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>abrir</button>
          <button onClick={() => setOpen(false)}>fechar</button>
          {open && <SecuritySplash fullScreen={false} title="Aguarde" steps={[]} />}
        </div>
      );
    }
    render(<Page />);
    const opener = screen.getByRole("button", { name: "abrir" });
    opener.focus();
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Aguarde" });
    expect(dialog).toHaveFocus();
    const tabbed = fireEvent.keyDown(document, { key: "Tab" });
    expect(tabbed).toBe(false); // preventDefault: o Tab não sai do overlay
  });
});

describe("GoogleButton: nonce", () => {
  function fakeGoogle() {
    const gid = { initialize: vi.fn(), renderButton: vi.fn() };
    window.google = { accounts: { id: gid } };
    return gid;
  }

  test("dois pedidos ao mesmo tempo (StrictMode) viram um só", async () => {
    const gid = fakeGoogle();
    let resolve;
    const get = vi.spyOn(api, "get").mockReturnValue(new Promise((r) => (resolve = r)));
    const a = render(<GoogleButton clientId="cid" onCredential={() => {}} />);
    const b = render(<GoogleButton clientId="cid" onCredential={() => {}} />);
    resolve({ data: { nonce: "unico" } });
    await waitFor(() => expect(gid.initialize).toHaveBeenCalled());
    expect(get).toHaveBeenCalledTimes(1);
    expect(gid.initialize.mock.calls.every(([o]) => o.nonce === "unico")).toBe(true);
    a.unmount();
    b.unmount();
  });

  test("renova o nonce antes de vencer quando a aba volta a ficar visível", async () => {
    const gid = fakeGoogle();
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: { nonce: "n1" } }).mockResolvedValueOnce({ data: { nonce: "n2" } });
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    render(<GoogleButton clientId="cid" onCredential={() => {}} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(gid.initialize).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-27T12:04:30Z")); // passaram 4 min 30 s
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();
    await waitFor(() => expect(gid.initialize).toHaveBeenCalledTimes(2));
    expect(gid.initialize.mock.calls[1][0].nonce).toBe("n2");
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("antes dos 4 minutos não renova à toa", async () => {
    const gid = fakeGoogle();
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { nonce: "n1" } });
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    render(<GoogleButton clientId="cid" onCredential={() => {}} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.setSystemTime(new Date("2026-10-27T12:02:00Z"));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vi.useRealTimers();
    expect(gid.initialize).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("connectionStep e dados guardados", () => {
  test("cada tipo de conexão tem o passo certo", () => {
    expect(connectionStep({ protocol: "https:", hostname: "x.com" })).toMatchObject({ state: "done", label: expect.stringContaining("HTTPS") });
    expect(connectionStep({ protocol: "http:", hostname: "localhost" })).toMatchObject({ state: "done" });
    expect(connectionStep({ protocol: "http:", hostname: "192.168.1.20" })).toMatchObject({ state: "warn", label: "Conexão sem HTTPS" });
  });

  test("a tela Seus dados lista também o identificador do Google e o método de entrada", () => {
    renderPage(<Account />);
    expect(screen.getByText("O identificador da sua conta Google")).toBeInTheDocument();
    expect(screen.getByText("Como e quando você entrou")).toBeInTheDocument();
  });
});
