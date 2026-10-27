import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, onSessionRefreshed, refreshSession } from "../lib/api.js";
import { AuthContext } from "./authContext.js";

// A renovação começa um pouco antes de o acesso vencer.
const RENEW_MARGIN_MS = 60 * 1000;
// setTimeout aceita no máximo ~24,8 dias; a sessão dura bem menos que isso.
const MAX_TIMEOUT = 2 ** 31 - 1;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null); // { startedAt, expiresAt, serverTime }
  // loading | authenticated | anonymous | error (servidor fora do ar)
  const [status, setStatus] = useState("loading");
  const [notice, setNotice] = useState(null); // "expired" quando a sessão acabou sozinha
  const [attempt, setAttempt] = useState(0);
  // Diferença entre o relógio do servidor e o do aparelho. O vencimento é
  // calculado pela hora do servidor, então um relógio errado não derruba a sessão.
  const offsetRef = useRef(0);

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  const apply = useCallback((data) => {
    const { session: s, ...rest } = data;
    if (s?.serverTime) offsetRef.current = new Date(s.serverTime).getTime() - Date.now();
    setUser(rest);
    setSession(s ?? null);
    setNotice(null);
    setStatus("authenticated");
  }, []);

  const clear = useCallback((reason = null) => {
    setUser(null);
    setSession(null);
    setNotice(reason);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/me")
      .then((res) => !cancelled && apply(res.data))
      .catch((err) => {
        if (cancelled) return;
        // Só 401 significa "não está logado". Rede fora ou erro 5xx não é motivo
        // para mandar a pessoa para o login como se a sessão tivesse acabado.
        if (err.response?.status === 401) clear();
        else setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apply, clear, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((a) => a + 1);
  }, []);

  // Quando a sessão vence, a tela volta para o login sozinha em vez de esperar
  // a próxima chamada falhar com 401. Também confere ao voltar para a aba, porque
  // timers pausam quando o computador dorme.
  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return undefined;
    const expiry = new Date(expiresAt).getTime();
    let timer;
    const check = () => {
      if (expiry <= Date.now() + offsetRef.current) {
        clear("expired");
        return true;
      }
      return false;
    };
    const schedule = () => {
      const ms = Math.min(Math.max(expiry - (Date.now() + offsetRef.current), 0), MAX_TIMEOUT);
      timer = setTimeout(() => {
        if (!check()) schedule();
      }, ms);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [expiresAt, clear]);

  // A API renova o acesso sozinha quando uma requisição falha com 401 (ver lib/api.js).
  // Aqui a renovação é preventiva: acontece antes de vencer, e também ao voltar
  // para a aba depois de o computador dormir. Quem recebe a resposta é este provider.
  useEffect(() => onSessionRefreshed(apply), [apply]);

  const accessExpiresAt = session?.accessExpiresAt;
  useEffect(() => {
    if (!accessExpiresAt) return undefined;
    const due = new Date(accessExpiresAt).getTime() - RENEW_MARGIN_MS;
    const renew = () =>
      refreshSession().catch((err) => {
        // Só 401 encerra: queda de rede não deve derrubar a pessoa; a próxima
        // requisição tenta renovar de novo.
        if (err.response?.status === 401) clear("expired");
      });
    const onVisible = () => {
      if (document.visibilityState === "visible" && due <= Date.now() + offsetRef.current) renew();
    };
    const timer = setTimeout(renew, Math.min(Math.max(due - (Date.now() + offsetRef.current), 0), MAX_TIMEOUT));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessExpiresAt, clear]);

  const signin = useCallback(
    async (credentials) => {
      const res = await api.post("/auth/signin", credentials);
      apply(res.data);
    },
    [apply]
  );

  const googleSignin = useCallback(
    async (credential) => {
      const res = await api.post("/auth/google", { credential });
      apply(res.data);
      return res.data;
    },
    [apply]
  );

  const updateProfile = useCallback(
    async (data) => {
      const res = await api.patch("/auth/profile", data);
      apply(res.data);
    },
    [apply]
  );

  const signup = useCallback(async (data) => {
    await api.post("/auth/signup", data);
  }, []);

  // Só dá a pessoa como deslogada se o servidor confirmou: se a chamada falhar, o
  // cookie continua valendo e a tela não pode afirmar o contrário.
  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      if (err.response?.status !== 401) throw err;
    }
    clear();
  }, [clear]);

  const logoutAll = useCallback(async () => {
    try {
      await api.post("/auth/logout-all");
    } catch (err) {
      if (err.response?.status !== 401) throw err;
    }
    clear();
  }, [clear]);

  // Chamado quando a API responde 401 no meio do uso (sessão vencida).
  const expire = useCallback(() => clear("expired"), [clear]);

  const value = useMemo(
    () => ({ user, session, status, notice, now, retry, signin, googleSignin, updateProfile, signup, logout, logoutAll, expire }),
    [user, session, status, notice, now, retry, signin, googleSignin, updateProfile, signup, logout, logoutAll, expire]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
