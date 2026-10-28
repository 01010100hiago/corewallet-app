import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Senha de uso único por tempo (TOTP, RFC 6238) com HMAC-SHA1, 6 dígitos e passo de 30 s: o que o
// Google Authenticator, o Authy, o 1Password e outros apps geram. Só usa o módulo crypto do Node.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Base32 inválido");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// 20 bytes aleatórios (160 bits), o tamanho recomendado para HMAC-SHA1.
export const generateSecret = () => base32Encode(randomBytes(20));

function hotp(secretBase32, counter, digits = DIGITS) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (nowMs) => Math.floor(nowMs / 1000 / STEP_SECONDS);

export const codeAt = (secret, nowMs = Date.now()) => hotp(secret, stepOf(nowMs));

// Confere o código aceitando o passo anterior e o seguinte (relógios um pouco fora de hora).
// Devolve o passo que bateu, ou null. O chamador precisa gravar esse passo e recusar qualquer um
// igual ou anterior depois, senão o mesmo código serviria duas vezes.
export function verifyTotp(secret, code, { nowMs = Date.now(), window = 1 } = {}) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const given = Buffer.from(code);
  const current = stepOf(nowMs);
  let matched = null;
  // Sem sair no primeiro acerto: o tempo gasto não revela qual passo bateu.
  for (let step = current - window; step <= current + window; step++) {
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(given, expected) && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}
