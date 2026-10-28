import { useEffect } from "react";

// Cada tela tem o próprio título de aba, que também é o que o leitor de tela
// anuncia ao trocar de página.
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · CoreWallet` : "CoreWallet";
  }, [title]);
}
