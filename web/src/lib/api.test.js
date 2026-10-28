import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { AxiosError } from "axios";
import Cookies from "js-cookie";
import { api, refreshSession, onSessionRefreshed } from "./api.js";

// Troca a rede por uma função: cada chamada devolve o próximo status da fila daquela rota.
function fakeServer(routes) {
  const calls = [];
  const original = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, csrf: config.headers.get("X-CSRF-Token") });
    const queue = routes[`${config.method} ${config.url}`];
    const [status, data = {}] = queue.length > 1 ? queue.shift() : queue[0];
    const response = { data, status, statusText: "", headers: {}, config };
    if (status >= 400) throw new AxiosError(`status ${status}`, "ERR_BAD_REQUEST", config, null, response);
    return response;
  };
  return { calls, restore: () => (api.defaults.adapter = original) };
}

let server;
afterEach(() => {
  server?.restore();
  Cookies.remove("cw_csrf");
  Cookies.remove("__Host-cw_csrf");
  vi.useRealTimers();
});

describe("CSRF", () => {
  test("em HTTPS o token vem do cookie com prefixo __Host-, que vale mais que o antigo", async () => {
    // O jsdom roda em http e recusa cookies __Host-; o navegador em HTTPS entrega os dois nomes.
    const jar = { "cw_csrf": "token-antigo", "__Host-cw_csrf": "token-novo" };
    vi.spyOn(Cookies, "get").mockImplementation((name) => jar[name]);
    server = fakeServer({ "post /x": [[200]] });
    await api.post("/x");
    expect(server.calls.at(-1).csrf).toBe("token-novo");
    delete jar["__Host-cw_csrf"];
    await api.post("/x");
    expect(server.calls.at(-1).csrf).toBe("token-antigo");
    vi.restoreAllMocks();
  });

  test("requisições que mudam dados levam o cookie no cabeçalho; leituras não", async () => {
    Cookies.set("cw_csrf", "token-abc");
    server = fakeServer({ "get /x": [[200]], "post /x": [[200]], "delete /x": [[200]], "patch /x": [[200]] });
    await api.get("/x");
    await api.post("/x");
    await api.delete("/x");
    await api.patch("/x");
    expect(server.calls.map((c) => [c.method, c.csrf])).toEqual([
      ["get", undefined],
      ["post", "token-abc"],
      ["delete", "token-abc"],
      ["patch", "token-abc"],
    ]);
  });

  test("sem o cookie, não inventa o cabeçalho", async () => {
    server = fakeServer({ "post /x": [[200]] });
    await api.post("/x");
    expect(server.calls[0].csrf).toBeUndefined();
  });
});

describe("renovação automática", () => {
  beforeEach(() => {
    server = undefined;
  });

  test("401 renova a sessão e repete a requisição uma vez", async () => {
    server = fakeServer({
      "get /transactions": [[401], [200, { ok: true }]],
      "post /auth/refresh": [[200, { id: "1", session: {} }]],
    });
    const seen = vi.fn();
    const off = onSessionRefreshed(seen);
    const res = await api.get("/transactions");
    off();
    expect(res.data).toEqual({ ok: true });
    expect(server.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["get /transactions", "post /auth/refresh", "get /transactions"]);
    expect(seen).toHaveBeenCalledWith({ id: "1", session: {} });
  });

  test("várias requisições com 401 ao mesmo tempo fazem uma só renovação", async () => {
    server = fakeServer({
      "get /a": [[401], [200]],
      "get /b": [[401], [200]],
      "get /c": [[401], [200]],
      "post /auth/refresh": [[200, { session: {} }]],
    });
    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(server.calls.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
  });

  test("se a renovação também dá 401, devolve o 401 original e não entra em laço", async () => {
    server = fakeServer({ "get /transactions": [[401]], "post /auth/refresh": [[401]] });
    await expect(api.get("/transactions")).rejects.toMatchObject({ response: { status: 401 }, config: { url: "/transactions" } });
    expect(server.calls.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
    expect(server.calls.filter((c) => c.url === "/transactions")).toHaveLength(1);
  });

  test("se a requisição repetida ainda der 401, para (não renova de novo)", async () => {
    server = fakeServer({ "get /x": [[401]], "post /auth/refresh": [[200, { session: {} }]] });
    await expect(api.get("/x")).rejects.toMatchObject({ response: { status: 401 } });
    expect(server.calls.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
  });

  test("falha de rede ou 5xx na renovação aparece como ela é, não como sessão vencida", async () => {
    server = fakeServer({ "get /x": [[401]], "post /auth/refresh": [[503]] });
    await expect(api.get("/x")).rejects.toMatchObject({ response: { status: 503 } });
  });

  test("login, cadastro, Google, sair e config não tentam renovar", async () => {
    server = fakeServer({
      "post /auth/signin": [[401]],
      "post /auth/signup": [[401]],
      "post /auth/google": [[401]],
      "post /auth/logout": [[401]],
    });
    for (const url of ["/auth/signin", "/auth/signup", "/auth/google", "/auth/logout"]) {
      await expect(api.post(url)).rejects.toMatchObject({ response: { status: 401 } });
    }
    expect(server.calls.some((c) => c.url === "/auth/refresh")).toBe(false);
  });

  test("409 (outra aba renovou agora) tenta mais uma vez", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server = fakeServer({ "post /auth/refresh": [[409], [200, { session: {} }]] });
    const done = refreshSession();
    await vi.advanceTimersByTimeAsync(400);
    await expect(done).resolves.toEqual({ session: {} });
    expect(server.calls).toHaveLength(2);
  });

  test("409 duas vezes seguidas desiste", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    server = fakeServer({ "post /auth/refresh": [[409]] });
    const done = refreshSession().catch((e) => e);
    await vi.advanceTimersByTimeAsync(400);
    expect((await done).response.status).toBe(409);
    expect(server.calls).toHaveLength(2);
  });
});
