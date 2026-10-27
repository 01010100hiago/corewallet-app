import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const POW_DEFAULT_MAX_NUMBER = 100_000;
export const POW_TTL_MS = 5 * 60 * 1000;
// Teto de desafios usados guardados na memória (cada um vive 5 minutos). Passou disso, a
// verificação falha fechada em vez de esquecer um desafio e deixar reusá-lo.
const MAX_USED = 20_000;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const SALT = /^[0-9a-f]{32}\?e=\d{10,15}$/;
const HEX64 = /^[0-9a-f]{64}$/;

// Verificação automática contra robôs, sem serviço externo (prova de trabalho, no estilo ALTCHA):
// o servidor sorteia um número secreto N, entrega só o hash de (sal + N) e o navegador descobre N
// tentando um por um. É barato para uma pessoa (1 a 3 s, sozinho, sem clicar em nada) e encarece
// cadastros em massa por robôs simples. NÃO é uma barreira forte contra robô sob medida: o limite de
// tentativas da API e, quando existir, o Turnstile da Cloudflare completam a defesa.
//
// O que impede trapaça: o desafio é assinado (HMAC) com um segredo do servidor, tem validade e só
// vale uma vez. Os desafios usados ficam na memória: serve para uma instância, como o limite de tentativas.
export function createPow({ secret, maxNumber = POW_DEFAULT_MAX_NUMBER, ttlMs = POW_TTL_MS, maxUsed = MAX_USED, now = Date.now }) {
  const used = new Map(); // desafio -> quando expira (a ordem de inserção já é a ordem de expiração)
  const sign = (salt, challenge) => createHmac("sha256", secret).update(`${salt}|${challenge}`).digest("hex");

  function sweep() {
    const t = now();
    for (const [challenge, expires] of used) {
      if (expires > t) break;
      used.delete(challenge);
    }
  }

  return {
    maxNumber,
    issue() {
      const expires = now() + ttlMs;
      const salt = `${randomBytes(16).toString("hex")}?e=${expires}`;
      const challenge = sha256(salt + randomInt(0, maxNumber + 1));
      return { algorithm: "SHA-256", salt, challenge, maxnumber: maxNumber, signature: sign(salt, challenge), ttl: Math.floor(ttlMs / 1000) };
    },

    // Devolve "ok", "invalid" ou "unavailable" (mesma convenção do Turnstile).
    verify(token) {
      let p;
      try {
        p = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
      } catch {
        return "invalid";
      }
      if (!p || typeof p !== "object") return "invalid";
      const { algorithm, salt, challenge, signature, number } = p;
      if (algorithm !== "SHA-256") return "invalid";
      if (typeof salt !== "string" || !SALT.test(salt)) return "invalid";
      if (typeof challenge !== "string" || !HEX64.test(challenge)) return "invalid";
      if (typeof signature !== "string" || !HEX64.test(signature)) return "invalid";
      if (!Number.isInteger(number) || number < 0 || number > maxNumber) return "invalid";

      const expires = Number(salt.split("?e=")[1]);
      if (!(expires > now())) return "invalid";
      // Assinatura: prova que este desafio saiu do nosso servidor e que sal e hash não foram trocados.
      if (!same(signature, sign(salt, challenge))) return "invalid";
      if (sha256(salt + number) !== challenge) return "invalid";

      sweep();
      if (used.has(challenge)) return "invalid";
      if (used.size >= maxUsed) return "unavailable";
      used.set(challenge, expires);
      return "ok";
    },

    get usedCount() {
      return used.size;
    },
  };
}
