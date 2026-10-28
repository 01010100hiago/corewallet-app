import { createHmac } from "node:crypto";

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

  // Sem as chaves do Turnstile, a verificação automática própria (prova de trabalho) fica ligada.
  // CAPTCHA_POW=off a desliga; POW_MAX_NUMBER ajusta a dificuldade (100 a 5.000.000; padrão 100.000).
  const powOff = process.env.CAPTCHA_POW === "off";
  const rawMax = process.env.POW_MAX_NUMBER;
  const powMax = rawMax ? Number(rawMax) : 100_000;
  if (!Number.isInteger(powMax) || powMax < 100 || powMax > 5_000_000) {
    throw new Error("POW_MAX_NUMBER precisa ser um inteiro entre 100 e 5000000");
  }
  const pow = turnstileSecret || powOff ? null : { secret: createHmac("sha256", process.env.JWT_SECRET).update("corewallet:pow:v1").digest("hex"), maxNumber: powMax };
  if (production && !turnstileSecret && !pow) {
    console.warn("Aviso: captcha desligado. Defina TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY para proteger o login.");
  }

  // Só para os testes de ponta a ponta, que criam muitas contas do mesmo IP.
  // Em produção desligar o limite de tentativas é erro, não opção.
  const rateLimitsOff = process.env.RATE_LIMITS === "off";
  if (rateLimitsOff && production) {
    throw new Error("RATE_LIMITS=off não pode ser usado em produção");
  }

  // Envio de email (confirmação de cadastro). SMTP_URL e MAIL_FROM juntos ligam o envio; a
  // confirmação de email só passa a ser exigida nesse caso (EMAIL_VERIFICATION=off a desliga).
  // MAIL_OUTBOX_FILE grava os emails num arquivo em vez de enviar: só para desenvolver e testar.
  const smtpUrl = process.env.SMTP_URL || "";
  const mailFrom = process.env.MAIL_FROM || "";
  const outboxFile = process.env.MAIL_OUTBOX_FILE || "";
  if (smtpUrl && !mailFrom) throw new Error("Defina MAIL_FROM junto com SMTP_URL (ex.: CoreWallet <nao-responda@seudominio.com>)");
  if (outboxFile && production) throw new Error("MAIL_OUTBOX_FILE não pode ser usado em produção (os emails não seriam enviados)");
  const mail = outboxFile ? { transport: "file", file: outboxFile } : smtpUrl ? { transport: "smtp", url: smtpUrl, from: mailFrom } : null;
  const emailVerificationRequired = Boolean(mail) && process.env.EMAIL_VERIFICATION !== "off";

  // Chave só do 2FA (opcional). Sem ela, usa uma derivada do JWT_SECRET, e trocar o JWT_SECRET
  // invalidaria os segredos já guardados. Defina antes de haver gente com 2FA ativo.
  const totpKey = process.env.TOTP_ENCRYPTION_KEY || "";
  if (totpKey && totpKey.length < JWT_SECRET_MIN) throw new Error(`TOTP_ENCRYPTION_KEY precisa ter pelo menos ${JWT_SECRET_MIN} caracteres`);

  return {
    totpEncryptionKey: totpKey || null,
    mail,
    emailVerificationRequired,
    rateLimits: rateLimitsOff ? false : undefined,
    port: Number(process.env.PORT) || 4000,
    // Quantos proxies confiáveis (o nginx) ficam na frente. 0 = nenhum.
    trustProxy: Number(process.env.TRUST_PROXY) || 0,
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    turnstile: turnstileSecret ? { secret: turnstileSecret, siteKey: turnstileSiteKey } : null,
    pow,
    databaseUri: process.env.DATABASE_URI,
    jwtSecret: process.env.JWT_SECRET,
    webOrigin: process.env.WEB_ORIGIN,
    cookieSecure,
  };
}
