import axios from "axios";
import Cookies from "js-cookie";

// O front e a API ficam no mesmo endereço: /api. Em desenvolvimento o Vite
// encaminha para a porta 4000. Os cookies de sessão são httpOnly, então o
// JavaScript da página nunca enxerga o token.
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
});

const SAFE_METHODS = new Set(["get", "head", "options"]);
const CSRF_COOKIE = "cw_csrf";

// Proteção CSRF: toda requisição que muda dados repete o cookie anti-CSRF (legível
// só por páginas do nosso site) num cabeçalho, que outro site não consegue montar.
api.interceptors.request.use((config) => {
  if (!SAFE_METHODS.has((config.method ?? "get").toLowerCase())) {
    const token = Cookies.get(CSRF_COOKIE);
    if (token) config.headers.set("X-CSRF-Token", token);
  }
  return config;
});

// ---- Renovação da sessão -------------------------------------------------
// O acesso dura 15 minutos. Quando vence, a API responde 401 e o front pede uma
// sessão nova com o cookie de renovação, sem a pessoa perceber. Só uma renovação
// roda por vez (várias requisições em paralelo esperam a mesma).
const listeners = new Set();
let refreshing = null;

export function onSessionRefreshed(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestRefresh(canRetry = true) {
  try {
    const res = await api.post("/auth/refresh");
    listeners.forEach((fn) => fn(res.data));
    return res.data;
  } catch (error) {
    // 409: outra aba acabou de renovar. O cookie novo já está no navegador, então
    // uma segunda tentativa funciona.
    if (canRetry && error.response?.status === 409) {
      await wait(300);
      return requestRefresh(false);
    }
    throw error;
  }
}

export function refreshSession() {
  refreshing ??= requestRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Rotas em que um 401 significa outra coisa (senha errada, sem sessão) e renovar não ajuda.
const NO_REFRESH = /^\/auth\/(refresh|signin|signup|google|logout|config)/;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status !== 401 || !config || config._renewed || NO_REFRESH.test(config.url ?? "")) {
      throw error;
    }
    config._renewed = true;
    try {
      await refreshSession();
    } catch (refreshError) {
      // Sessão encerrada de verdade: quem chamou vê o 401 original e volta ao login.
      // Qualquer outro erro (rede, servidor) é mostrado como ele é.
      throw refreshError.response?.status === 401 ? error : refreshError;
    }
    return api(config);
  }
);

// Transforma qualquer erro do Axios numa frase para mostrar na tela.
export function getErrorMessage(error) {
  if (error?.response) {
    const { message, errors } = error.response.data ?? {};
    const first = errors && Object.values(errors)[0];
    return first || message || "Algo deu errado. Tente de novo.";
  }
  if (error?.code === "ECONNABORTED") return "O servidor demorou para responder.";
  return "Não foi possível conectar ao servidor.";
}
