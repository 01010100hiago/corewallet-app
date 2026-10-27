import { describe, test, expect } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { solveChallenge } from "./pow.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const digest = (bytes) => webcrypto.subtle.digest("SHA-256", bytes);
const challengeFor = (number, extra = {}) => {
  const salt = `${"c".repeat(32)}?e=1800000000000`;
  return { algorithm: "SHA-256", salt, challenge: sha(salt + number), maxnumber: 5000, signature: "d".repeat(64), ttl: 300, ...extra };
};
const decode = (token) => JSON.parse(atob(token));

describe("solveChallenge", () => {
  test("acha o número e devolve o token no formato que a API confere", async () => {
    const c = challengeFor(1234);
    const token = await solveChallenge(c, { digest });
    expect(decode(token)).toEqual({ algorithm: "SHA-256", challenge: c.challenge, number: 1234, salt: c.salt, signature: c.signature });
  });

  test("funciona com o número no começo, no fim do intervalo e zero", async () => {
    for (const n of [0, 1, 5000]) {
      const token = await solveChallenge(challengeFor(n), { digest });
      expect(decode(token).number).toBe(n);
    }
  });

  test("sem solução dentro do intervalo, falha com erro claro", async () => {
    await expect(solveChallenge(challengeFor(9999, { maxnumber: 200 }), { digest })).rejects.toThrow(/resolver/);
  });

  test("recusa algoritmo desconhecido sem tentar nada", async () => {
    let calls = 0;
    await expect(solveChallenge(challengeFor(1, { algorithm: "MD5" }), { digest: async (b) => (calls++, digest(b)) })).rejects.toThrow(/Algoritmo/);
    expect(calls).toBe(0);
  });

  test("pode ser cancelado no meio", async () => {
    const controller = new AbortController();
    let calls = 0;
    const slow = async (b) => {
      calls++;
      if (calls === 50) controller.abort();
      return digest(b);
    };
    await expect(solveChallenge(challengeFor(4000), { digest: slow, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBeLessThan(200);
  });

  test("cede a vez ao navegador de tempos em tempos (a tela não trava)", async () => {
    // Hash instantâneo (só microtarefas): sem o `yield` explícito o laço monopoliza a tela e o
    // intervalo abaixo nunca dispara. O crypto.subtle real já devolve o controle sozinho e não provaria nada.
    const instant = async (bytes) => {
      const d = createHash("sha256").update(bytes).digest();
      return d.buffer.slice(d.byteOffset, d.byteOffset + d.length);
    };
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    await solveChallenge(challengeFor(4000), { digest: instant, yieldEvery: 200 });
    clearInterval(timer);
    expect(ticks).toBeGreaterThanOrEqual(10); // 4000 tentativas / 200 = ~20 cedências
  });

  test("com o desafio real da API o token passa na verificação do servidor (mesma conta, outro código)", async () => {
    // A API confere sha256(sal + número) === desafio; aqui o solucionador usa a mesma regra de ponta a ponta.
    const c = challengeFor(777);
    const { number, salt, challenge } = decode(await solveChallenge(c, { digest }));
    expect(sha(salt + number)).toBe(challenge);
  });
});
