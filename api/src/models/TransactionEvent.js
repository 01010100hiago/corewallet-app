import { Schema, model } from "mongoose";
import { TRANSACTION_TYPES } from "@corewallet/shared";

// Registro de tudo que aconteceu com um lançamento. Só cresce: não há rota para
// editar nem apagar eventos.
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true },
  action: { type: String, enum: ["created", "edited", "deleted", "restored", "archived", "unarchived"], required: true },
  at: { type: Date, required: true },
  // Como o lançamento ficou depois deste evento.
  snapshot: {
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    valueCents: { type: Number, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
  },
  // Só em "edited": o que mudou (campo, valor antigo, valor novo).
  changes: [{ _id: false, field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
});

schema.index({ userId: 1, at: -1 });
schema.index({ transactionId: 1, at: -1 });

export default model("TransactionEvent", schema);
