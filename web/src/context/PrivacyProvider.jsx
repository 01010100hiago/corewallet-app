import { useCallback, useMemo, useState } from "react";
import { PrivacyContext } from "./privacyContext.js";

const KEY = "cw_privacidade";

// A escolha fica só neste navegador (localStorage) e não vai para o servidor. Se o navegador
// bloquear o armazenamento (janela privada, por exemplo), o botão funciona na página aberta
// e a escolha não é lembrada.
function read() {
  try {
    return localStorage.getItem(KEY) === "ocultar";
  } catch {
    return false;
  }
}

export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = useState(read);

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        localStorage.setItem(KEY, next ? "ocultar" : "mostrar");
      } catch {
        // sem armazenamento: vale só nesta página
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
