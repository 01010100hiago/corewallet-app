const REQUIRED = ["DATABASE_URI", "JWT_SECRET", "WEB_ORIGIN"];
const JWT_SECRET_MIN = 32;
const DUMMY_TURNSTILE_SECRETS = new Set([
  "1x0000000000000000000000000000000AA", // sempre passa
  "2x0000000000000000000000000000000AA", // sempre falha
  "3x0000000000000000000000000000000AA", // token já usado
]);

// Lê as variáveis de ambiente e para a API na hora se faltar alguma ou se algo estiver fraco.
export function loadEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente faltando: ${missing.join(", ")}`);
  }
  if (process.env.JWT_SECRET.length < JWT_SECRET_MIN) {
    throw new Error(`JWT_SECRET precisa ter pelo menos ${JWT_SECRET_MIN} caracteres`);
  }

  const production = process.env.NODE_ENV === "production";

  // Cookie "Secure" só vale em HTTPS. Em produção fica ligado, a menos que
  // COOKIE_SECURE=false (rodando o compose em http://localhost). Qualquer outro
  // valor é erro, para um "1" ou "True" esquecido não desligar o flag em silêncio.
  const rawSecure = process.env.COOKIE_SECURE;
  if (rawSecure && !["true", "false"].includes(rawSecure)) {
    throw new Error('COOKIE_SECURE precisa ser "true" ou "false"');
  }
  const cookieSecure = rawSecure ? rawSecure === "true" : production;
  if (production && !cookieSecure) {
    console.warn("Aviso: cookie de sessão sem o flag Secure. Use COOKIE_SECURE=true ao servir por HTTPS.");
  }

  // Chaves de teste públicas da Cloudflare: o captcha sempre passa. Servem para
  // desenvolver, e nunca podem ir para produção.
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY || "";
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
  if (Boolean(turnstileSecret) !== Boolean(turnstileSiteKey)) {
    throw new Error("Defina TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY juntas, ou nenhuma das duas");
  }
  if (production && DUMMY_TURNSTILE_SECRETS.has(turnstileSecret)) {
    throw new Error("TURNSTILE_SECRET_KEY é uma chave de teste da Cloudflare (o captcha sempre passa). Use a chave real em produção");
  }
  if (production && !turnstileSecret) {
    console.warn("Aviso: captcha desligado. Defina TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY para proteger o login.");
  }

  return {
    port: Number(process.env.PORT) || 4000,
    // Quantos proxies confiáveis (o nginx) ficam na frente. 0 = nenhum.
    trustProxy: Number(process.env.TRUST_PROXY) || 0,
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    turnstile: turnstileSecret ? { secret: turnstileSecret, siteKey: turnstileSiteKey } : null,
    databaseUri: process.env.DATABASE_URI,
    jwtSecret: process.env.JWT_SECRET,
    webOrigin: process.env.WEB_ORIGIN,
    cookieSecure,
  };
}
