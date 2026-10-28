import { Schema, model } from "mongoose";

// Uma sessão por aparelho. O token de renovação nunca é guardado: só o hash dele,
// então um vazamento do banco não entrega sessões abertas.
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // Hash do token anterior. Se alguém apresentar um token já trocado, ele foi
    // copiado: a sessão inteira é encerrada.
    prevHash: { type: String, index: true, sparse: true },
    rotatedAt: Date,
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    lastUsedAt: { type: Date, required: true },
    // Fim absoluto da sessão. O Mongo apaga o documento sozinho depois disso.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model("RefreshSession", schema);
