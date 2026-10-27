import { Schema, model } from "mongoose";
import { TRANSACTION_TYPES, ALL_CATEGORY_IDS, DEFAULT_CATEGORY, isCustomCategoryId } from "@corewallet/shared";

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
    // Id de fábrica ("mercado") ou id de uma categoria da pessoa (ObjectId em texto).
    category: {
      type: String,
      default: DEFAULT_CATEGORY,
      validate: { validator: (v) => ALL_CATEGORY_IDS.includes(v) || isCustomCategoryId(v), message: "categoria inválida" },
    },
    // Excluir não apaga: marca a data aqui e o lançamento sai da lista e dos totais.
    // O histórico guarda tudo e dá para restaurar.
    deletedAt: { type: Date, default: null },
    // Arquivar tira da lista mas o lançamento continua valendo: conta no saldo, nos totais e no
    // gráfico. Desarquivar traz de volta. Arquivado não se edita nem se exclui sem desarquivar.
    archivedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });

export default model("Transaction", transactionSchema);
