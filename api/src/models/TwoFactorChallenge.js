import { Schema, model } from "mongoose";

// Estado de um desafio da segunda etapa do login (o nonce vem dentro do desafio assinado): quantas
// tentativas já gastou, se alguma conferência está em andamento e se já foi usado. Fica no banco para
// valer em qualquer instância da API: o desafio usado em uma não pode ser reaproveitado em outra.
const schema = new Schema(
  {
    _id: { type: String },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
    // Conferência em andamento (uma por vez por desafio); vence sozinha se a instância morrer no meio.
    busyUntil: { type: Date },
    // O desafio vence em 5 minutos; o Mongo apaga o documento sozinho depois.
    exp: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false }
);

export default model("TwoFactorChallenge", schema);
