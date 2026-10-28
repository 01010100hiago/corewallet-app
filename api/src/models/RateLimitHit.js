import { Schema, model } from "mongoose";

// Contador do limite de tentativas, por chave (IP, IP + email...). Fica no banco, e não na memória
// de cada processo, para várias instâncias da API dividirem o MESMO limite.
// O Mongo apaga o documento sozinho quando a janela acaba.
const schema = new Schema(
  {
    _id: { type: String },
    hits: { type: Number, required: true },
    resetAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false }
);

export default model("RateLimitHit", schema);
