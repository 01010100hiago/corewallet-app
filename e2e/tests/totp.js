import { createHmac } from "node:crypto";

// Gerador de código do aplicativo autenticador (RFC 6238: SHA-1, 6 dígitos, 30 s), igual ao que o
// celular faria, para os testes digitarem o código "do celular".
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decode(secret) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret.replace(/[\s=-]/g, "").toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// `stepsAhead`: 1 = o código do próximo intervalo de 30 s (a API aceita um intervalo à frente e um
// atrás), útil para entrar de novo logo depois de ter usado o código atual.
export function totpCode(secret, stepsAhead = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + stepsAhead;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
