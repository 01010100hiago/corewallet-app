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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ userId: 1, type: 1, nameKey: 1 }, { unique: true });

export default model("Category", schema);
