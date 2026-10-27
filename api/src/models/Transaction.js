import { Schema, model } from "mongoose";
import { TRANSACTION_TYPES } from "@corewallet/shared";

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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ userId: 1, createdAt: -1 });

export default model("Transaction", transactionSchema);
