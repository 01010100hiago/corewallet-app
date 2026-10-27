import { createPow } from "./powService.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

// Confere com a Cloudflare se o token do captcha (Turnstile) é de uma pessoa.
// Sem chave configurada o captcha fica desligado (enabled = false).
// Devolve "ok", "invalid" (token recusado) ou "unavailable" (não deu para confirmar).
export function createCaptcha(config, fetchImpl = fetch) {
  if (!config) return { enabled: false, verify: async () => "ok" };

  return {
    enabled: true,
    provider: "turnstile",
    async verify(token, ip) {
      try {
        const body = new URLSearchParams({ secret: config.secret, response: token });
        if (ip) body.set("remoteip", ip);
        const res = await fetchImpl(VERIFY_URL, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return "unavailable";
        const data = await res.json();
        return data.success === true ? "ok" : "invalid";
      } catch {
        // Falha fechada: se não dá para verificar, não se deixa passar.
        return "unavailable";
      }
    },
  };
}

// Verificação automática própria (sem chaves nem serviço externo). Ver powService.js.
export function createPowCaptcha(config, now = Date.now) {
  const pow = createPow({ secret: config.secret, maxNumber: config.maxNumber, now });
  return {
    enabled: true,
    provider: "pow",
    challenge: () => pow.issue(),
    verify: async (token) => pow.verify(token),
  };
}
