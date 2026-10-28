import PowUsed from "../models/PowUsed.js";

const DUPLICATE_KEY = 11000;

// "Reivindicar" um identificador de uso único (um desafio da verificação automática) até `expiresAtMs`.
// Devolve "ok" na primeira vez, "used" se já foi reivindicado e "unavailable" se não dá para garantir
// que é a primeira vez (falha fechada, nunca aceita de novo por dúvida).

// No Mongo: o índice único decide, mesmo entre instâncias diferentes da API.
export function createMongoClaimStore({ model = PowUsed } = {}) {
  return {
    async claim(id, expiresAtMs) {
      try {
        await model.create({ _id: id, exp: new Date(expiresAtMs) });
        return "ok";
      } catch (err) {
        if (err?.code === DUPLICATE_KEY) return "used";
        return "unavailable";
      }
    },
  };
}

// Na memória do processo: serve para testes sem banco e para uma instância só. Passou de `maxUsed`,
// falha fechada em vez de esquecer um desafio usado.
export function createMemoryClaimStore({ maxUsed = 20_000, now = Date.now } = {}) {
  const used = new Map(); // id -> quando expira (a ordem de inserção já é a ordem de expiração)
  return {
    async claim(id, expiresAtMs) {
      const t = now();
      for (const [key, expires] of used) {
        if (expires > t) break;
        used.delete(key);
      }
      if (used.has(id)) return "used";
      if (used.size >= maxUsed) return "unavailable";
      used.set(id, expiresAtMs);
      return "ok";
    },
    get size() {
      return used.size;
    },
  };
}
