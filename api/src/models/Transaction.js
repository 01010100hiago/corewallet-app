import { Schema, model } from "mongoose";
import { TRANSACTION_TYPES, ALL_CATEGORY_IDS, DEFAULT_CATEGORY } from "@corewallet/shared";

const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    // Centavos, sempre inteiro e positivo; o sinal vem do tipo.
    valueCents: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "valueCents precisa ser inteiro" },
    },
    description: { type: String, required: true, trim: true },
    // Lançamentos criados antes das categorias não têm o campo: contam como "outros".
    category: { type: String, enum: ALL_CATEGORY_IDS, default: DEFAULT_CATEGORY },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ userId: 1, createdAt: -1 });

export default model("Transaction", transactionSchema);
