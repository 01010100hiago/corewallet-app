import { createContext, useContext } from "react";

// Modo "esconder valores": quando ligado, todo valor em dinheiro vira "R$ ••••".
// Sem o provider (testes isolados) os valores aparecem normalmente.
export const PrivacyContext = createContext({ hidden: false, toggle: () => {} });
export const usePrivacy = () => useContext(PrivacyContext);
