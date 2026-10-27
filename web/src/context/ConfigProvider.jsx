import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { ConfigContext } from "./configContext.js";

// Busca na API o que a tela precisa saber: se há captcha (e a chave pública dele)
// e se o login com Google está ligado. Assim as chaves não ficam fixas no build.
// Se a busca falhar o estado é "error": mostrar o formulário sem captcha seria
// enganoso (a API continuaria exigindo), então o app oferece tentar de novo.
export function ConfigProvider({ children }) {
  const [state, setState] = useState({ status: "loading", captcha: null, google: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/config")
      .then((res) => !cancelled && setState({ status: "ready", captcha: res.data.captcha, google: res.data.google }))
      .catch(() => !cancelled && setState({ status: "error", captcha: null, google: null }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", captcha: null, google: null });
    setAttempt((a) => a + 1);
  }, []);

  const value = useMemo(() => ({ ...state, retry }), [state, retry]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
