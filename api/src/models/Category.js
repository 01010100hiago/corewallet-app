import { Schema, model } from "mongoose";
import { TRANSACTION_TYPES } from "@corewallet/shared";

// Categoria criada pela pessoa. As categorias de fábrica ficam em shared/categories.js.
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    // Nome em minúsculas e sem acento: "Pets" e "pets" são a mesma categoria.
    nameKey: { type: String, required: true },
    // Todo lançamento que passa a usar a categoria grava aqui dentro da transação; assim ele conflita com
    // quem a apaga em paralelo (as transações enxergam fotos separadas e, sem uma gravação em comum, ambas passariam).
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ userId: 1, type: 1, nameKey: 1 }, { unique: true });

export default model("Category", schema);
