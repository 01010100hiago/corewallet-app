import { Schema, model } from "mongoose";

// Desafios da verificação automática que já foram aceitos (cada um vale uma vez). No banco, e não na
// memória, para o mesmo desafio não ser aceito em duas instâncias da API.
const schema = new Schema(
  {
    _id: { type: String },
    exp: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false }
);

export default model("PowUsed", schema);
