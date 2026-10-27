import { describe, expect, test, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../context/authContext.js";
import { AuthProvider } from "../context/AuthProvider.jsx";
import { useAuth } from "../context/authContext.js";
import { api } from "../lib/api.js";
import { connectionState } from "../lib/connection.js";
import { timeLeftLabel } from "../lib/time.js";
import SessionChip from "./SessionChip.jsx";
import PasswordStrength from "./PasswordStrength.jsx";

afterEach(() => vi.useRealTimers());

const NOW = new Date("2026-10-27T15:00:00.000Z").getTime();
const session = { startedAt: "2026-10-27T14:32:00.000Z", expiresAt: "2026-10-27T15:47:00.000Z" };

function renderChip(auth = {}) {
  const value = {
    user: { id: "1", name: "Maria Silva", email: "maria@exemplo.com" },
    session,
    status: "authenticated",
    logout: vi.fn().mockResolvedValue(),
    now: () => Date.now(),
    ...auth,
  };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <SessionChip />
                <button>depois do selo</button>
              </>
            }
          />
          <Route path="/signin" element={<p>página de login</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return value;
}

describe("SessionChip", () => {
  test("começa fechado e abre com os dados reais da sessão", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    renderChip();
    expect(screen.queryByRole("group", { name: "Detalhes da sessão" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Sessão protegida/ }));
    const dialog = screen.getByRole("group", { name: "Detalhes da sessão" });
    expect(dialog).toHaveTextContent("Maria Silva");
    expect(dialog).toHaveTextContent("maria@exemplo.com");
    expect(dialog).toHaveTextContent("Vence em47 min");
    expect(dialog).toHaveTextContent("Neste computador");
  });

  test("Esc fecha e devolve o foco ao botão", async () => {
    renderChip();
    const button = screen.getByRole("button", { name: /Sessão protegida/ });
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Detalhes da sessão" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("clicar fora fecha", async () => {
    renderChip();
    await userEvent.click(screen.getByRole("button", { name: /Sessão protegida/ }));
    await userEvent.click(document.body);
    expect(screen.queryByRole("group", { name: "Detalhes da sessão" })).not.toBeInTheDocument();
  });

  test("o botão só aponta para o painel enquanto ele existe", async () => {
    renderChip();
    const button = screen.getByRole("button", { name: /Sessão protegida/ });
    expect(button).not.toHaveAttribute("aria-controls");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-controls", "session-details");
    expect(document.getElementById("session-details")).toBeInTheDocument();
  });

  test("sair do painel com Tab fecha", async () => {
    renderChip();
    const button = screen.getByRole("button", { name: /Sessão protegida/ });
    await userEvent.click(button);
    await userEvent.tab(); // botão Sair
    expect(screen.getByRole("group", { name: "Detalhes da sessão" })).toBeInTheDocument();
    await userEvent.tab(); // sai do painel
    expect(screen.queryByRole("group", { name: "Detalhes da sessão" })).not.toBeInTheDocument();
  });

  test("usa a hora do servidor, não a do aparelho, para dizer quanto falta", async () => {
    // O relógio do aparelho está 3 h adiantado, mas now() corrige pela hora do servidor.
    vi.spyOn(Date, "now").mockReturnValue(NOW + 3 * 3600 * 1000);
    renderChip({ now: () => NOW });
    await userEvent.click(screen.getByRole("button", { name: /Sessão protegida/ }));
    expect(screen.getByRole("group")).toHaveTextContent("Vence em47 min");
  });

  test("se o logout falhar, a sessão continua e a tela avisa", async () => {
    const auth = renderChip({ logout: vi.fn().mockRejectedValue(new Error("rede")) });
    await userEvent.click(screen.getByRole("button", { name: /Sessão protegida/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Sua sessão continua aberta/);
    expect(screen.queryByText("página de login")).not.toBeInTheDocument();
    expect(auth.logout).toHaveBeenCalled();
  });

  test("sair chama logout e volta ao login", async () => {
    const auth = renderChip();
    await userEvent.click(screen.getByRole("button", { name: /Sessão protegida/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(auth.logout).toHaveBeenCalled();
    expect(await screen.findByText("página de login")).toBeInTheDocument();
  });
});

describe("AuthProvider", () => {
  function Probe() {
    const { status } = useAuth();
    return <p>estado: {status}</p>;
  }

  test("a sessão vence sozinha e a tela volta para anônimo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(api, "get").mockResolvedValue({ data: { id: "1", name: "Maria", email: "m@e.com", session } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("estado: authenticated")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(46 * 60 * 1000);
    });
    expect(screen.getByText("estado: authenticated")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(screen.getByText("estado: anonymous")).toBeInTheDocument();
  });
});

describe("AuthProvider: erros e relógio", () => {
  function Probe() {
    const { status, notice, logout, expire } = useAuth();
    return (
      <div>
        <p>estado: {status}</p>
        <p>aviso: {notice ?? "nenhum"}</p>
        <button onClick={() => logout().catch(() => {})}>sair</button>
        <button onClick={expire}>expirar</button>
      </div>
    );
  }
  const me = { id: "1", name: "Maria", email: "m@e.com", session };

  test("401 em /auth/me é anônimo; erro de rede não é", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce({ response: { status: 401 } });
    const first = render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("estado: anonymous")).toBeInTheDocument();
    first.unmount();

    vi.spyOn(api, "get").mockRejectedValueOnce(new Error("Network Error"));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("estado: error")).toBeInTheDocument();
  });

  test("logout que falha mantém a sessão; 401 no logout encerra", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: me });
    const post = vi.spyOn(api, "post").mockRejectedValueOnce(new Error("rede"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("estado: authenticated");
    await userEvent.click(screen.getByText("sair"));
    await act(async () => {});
    expect(screen.getByText("estado: authenticated")).toBeInTheDocument();

    post.mockRejectedValueOnce({ response: { status: 401 } });
    await userEvent.click(screen.getByText("sair"));
    expect(await screen.findByText("estado: anonymous")).toBeInTheDocument();
  });

  test("expirar deixa o aviso de sessão vencida", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: me });
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText("estado: authenticated");
    await userEvent.click(screen.getByText("expirar"));
    expect(await screen.findByText("aviso: expired")).toBeInTheDocument();
  });

  test("relógio do aparelho adiantado não derruba a sessão (usa a hora do servidor)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    // Aparelho 2 h à frente do servidor: sem a correção, a sessão já nasceria vencida.
    vi.setSystemTime(NOW + 2 * 3600 * 1000);
    vi.spyOn(api, "get").mockResolvedValue({ data: { ...me, session: { ...session, serverTime: new Date(NOW).toISOString() } } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("estado: authenticated")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(46 * 60 * 1000);
    });
    expect(screen.getByText("estado: authenticated")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(screen.getByText("estado: anonymous")).toBeInTheDocument();
    expect(screen.getByText("aviso: expired")).toBeInTheDocument();
  });

  test("ao voltar para a aba depois de dormir, confere o vencimento", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(api, "get").mockResolvedValue({ data: { ...me, session: { ...session, serverTime: new Date(NOW).toISOString() } } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => {
      await Promise.resolve();
    });
    // O computador dormiu: o relógio andou 2 h, mas o timer não disparou.
    vi.setSystemTime(NOW + 2 * 3600 * 1000);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("estado: anonymous")).toBeInTheDocument();
  });
});

describe("connectionState", () => {
  test("separa https, local e inseguro", () => {
    expect(connectionState({ protocol: "https:", hostname: "carteira.exemplo.com" })).toBe("https");
    expect(connectionState({ protocol: "http:", hostname: "localhost" })).toBe("local");
    expect(connectionState({ protocol: "http:", hostname: "127.0.0.1" })).toBe("local");
    expect(connectionState({ protocol: "http:", hostname: "192.168.1.20" })).toBe("insecure");
    expect(connectionState({ protocol: "http:", hostname: "localhost.evil.com" })).toBe("insecure");
  });
});

describe("timeLeftLabel", () => {
  const at = (ms) => new Date(NOW + ms).toISOString();
  test("formata o que falta", () => {
    expect(timeLeftLabel(at(47 * 60000), NOW)).toBe("47 min");
    expect(timeLeftLabel(at(30000), NOW)).toBe("menos de 1 min");
    expect(timeLeftLabel(at(65 * 60000), NOW)).toBe("1 h 5 min");
    expect(timeLeftLabel(at(120 * 60000), NOW)).toBe("2 h");
    expect(timeLeftLabel(at(-1), NOW)).toBe("venceu");
    expect(timeLeftLabel("lixo", NOW)).toBe("venceu");
  });
});

describe("PasswordStrength", () => {
  test("marca o que falta e a nota muda com a senha", () => {
    const { rerender } = render(<PasswordStrength password="12345678" />);
    expect(screen.getByRole("progressbar", { name: "Força da senha" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("Fraca")).toBeInTheDocument();
    rerender(<PasswordStrength password="cavalo-azul-77-bravo" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByText("Forte")).toBeInTheDocument();
    expect(screen.getByText("Não é uma senha comum")).toBeInTheDocument();
  });

  test("diz em texto se cada regra foi atendida, e anuncia só a nota", () => {
    render(<PasswordStrength password="12345678" />);
    const item = screen.getByText("Não é uma senha comum").closest("li");
    expect(item).toHaveTextContent("pendente");
    expect(screen.getByText("8 ou mais caracteres").closest("li")).toHaveTextContent("atendido");
    expect(screen.getByRole("status")).toHaveTextContent("Força da senha: Fraca");
  });

  test("senha acima de 72 bytes aparece como reprovada, igual à API", () => {
    render(<PasswordStrength password={"a1".repeat(40)} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/No máximo 72 bytes/).closest("li")).toHaveTextContent("pendente");
  });
});
