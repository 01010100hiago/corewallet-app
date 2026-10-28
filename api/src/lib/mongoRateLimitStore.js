import RateLimitHit from "../models/RateLimitHit.js";

const DUPLICATE_KEY = 11000;

// Armazenamento do express-rate-limit no Mongo. Cada chave é um documento; o incremento é UMA operação
// atômica (a janela vence e recomeça dentro da própria atualização), então pedidos simultâneos, mesmo
// de instâncias diferentes, nunca perdem contagem.
export class MongoRateLimitStore {
  // O express-rate-limit usa isto para saber que o contador não é local ao processo.
  localKeys = false;

  constructor({ prefix = "", model = RateLimitHit, now = () => Date.now() } = {}) {
    this.prefix = prefix;
    this.model = model;
    this.now = now;
    this.windowMs = 60_000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const _id = this.prefix + key;
    const t = this.now();
    const nowDate = new Date(t);
    const resetDate = new Date(t + this.windowMs);
    const expired = { $lte: [{ $ifNull: ["$resetAt", new Date(0)] }, nowDate] };
    const update = [
      { $set: { hits: { $cond: [expired, 1, { $add: ["$hits", 1] }] }, resetAt: { $cond: [expired, resetDate, "$resetAt"] } } },
    ];
    // Duas primeiras batidas ao mesmo tempo disputam a criação do documento: quem perde repete e soma.
    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await this.model.findOneAndUpdate({ _id }, update, { upsert: true, returnDocument: "after", updatePipeline: true }).lean();
        return { totalHits: doc.hits, resetTime: doc.resetAt };
      } catch (err) {
        if (err?.code !== DUPLICATE_KEY || attempt >= 2) throw err;
      }
    }
  }

  async decrement(key) {
    await this.model.updateOne({ _id: this.prefix + key, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await this.model.deleteOne({ _id: this.prefix + key });
  }
}
