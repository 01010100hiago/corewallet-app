import { createContext, useContext } from "react";

export const ConfigContext = createContext(null);

// { status: "loading" | "ready" | "error", captcha: { siteKey } | null, google: { clientId } | null, retry() }
export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig precisa estar dentro de <ConfigProvider>");
  return ctx;
}
